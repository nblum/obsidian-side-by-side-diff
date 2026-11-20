import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Rejects all desktop modules while loading the same bundle options used for shipping. */
async function mobileBundle(entry: string) {
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
        Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {}, SuggestModal: class {}
      };
    }
  });
  return { exports: module.exports, imports };
}

test("the production plugin loads with only Obsidian available on mobile", async () => {
  const api = await mobileBundle("src/main.ts");
  assert.ok("default" in api.exports);
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
