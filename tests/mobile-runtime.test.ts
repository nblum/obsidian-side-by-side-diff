import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";
import type { FileDiffSideBySidePlugin } from "../src/main.ts";

/** Rejects all desktop modules while loading the same bundle options used for shipping. */
async function mobileBundle(entry: string, obsidian: Record<string, unknown> = {}) {
  const build = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: [entry], write: false, minify: true, logLevel: "silent" });
  const module = { exports: {} };
  const imports: string[] = [];
  runInNewContext(build.outputFiles![0]!.text, {
    module, exports: module.exports, TextDecoder,
    require(name: string) {
      imports.push(name);
      assert.equal(name, "obsidian", "mobile must not resolve Node or Electron, even during capability detection");
      return {
        Platform: { isMobileApp: true },
        Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, SuggestModal: class {},
        ...obsidian
      };
    }
  });
  return { exports: module.exports, imports };
}

test("the production plugin starts on mobile with vault commands and without desktop hooks", async () => {
  class View {
    onTabMenu(): void {}
  }
  const nativeTabMenu = View.prototype.onTabMenu;
  const api = await mobileBundle("src/main.ts", {
    View, addIcon: () => {}, moment: { locale: () => "en" }, requireApiVersion: () => true
  });
  const { default: Plugin } = api.exports as { default: new () => FileDiffSideBySidePlugin };
  const commands: string[] = [];
  const cliHandlers: string[] = [];
  const workspaceEvents: string[] = [];
  const views: string[] = [];
  const ribbons: (() => void)[] = [];
  const plugin = Object.assign(new Plugin(), {
    app: { workspace: {
      on: (event: string) => { workspaceEvents.push(event); return {}; },
      onLayoutReady: () => {}
    } },
    loadData: () => Promise.resolve({ introductionSeen: true }),
    registerView: (id: string) => { views.push(id); },
    registerObsidianProtocolHandler: () => {},
    registerCliHandler: (id: string) => { cliHandlers.push(id); },
    register: () => {},
    registerEvent: () => {},
    addCommand: (command: { id: string }) => { commands.push(command.id); return command; },
    addRibbonIcon: (_icon: string, _label: string, callback: () => void) => {
      ribbons.push(callback);
      return { toggleVisibility: () => {} };
    },
    addSettingTab: () => {}
  });

  await plugin.onload();

  assert.deepEqual(views, ["side-by-side-diff-view"]);
  assert.equal(ribbons.length, 1);
  assert.ok(commands.includes("compare-two-files"));
  assert.ok(commands.includes("propose-changes"));
  assert.ok(workspaceEvents.includes("file-menu"));
  assert.deepEqual(cliHandlers, []);
  assert.equal(View.prototype.onTabMenu, nativeTabMenu);
  assert.ok(api.imports.length > 0);
  assert.ok(api.imports.every(name => name === "obsidian"));
});

test("mobile native-path helpers reject desktop capabilities without resolving their modules", async () => {
  const api = await mobileBundle("src/external-markdown.ts");
  const exported = api.exports as typeof import("../src/external-markdown.ts");
  assert.equal(exported.getDroppedFilePath({ path: "/vault/a.md" } as unknown as File), null);
  assert.equal(exported.getVaultRelativePath("/vault/a.md", "/vault"), null);
  assert.ok(api.imports.every(name => name === "obsidian"));
});
