import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import esbuild from "esbuild";
import type { Menu, TFile, ViewState } from "obsidian";
import type { FileDiffSideBySidePlugin } from "../src/main.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Models text, binary and deferred-view file identities. */
class TestFile {
  path: string;
  constructor(path: string) { this.path = path; }
  get extension(): string { return this.path.split(".").at(-1)!; }
  get basename(): string { return this.path.split("/").at(-1)!.split(".")[0]!; }
}

/** Preserves native items and dispatches the actual registered comparison callback. */
class TestMenu {
  items: { title: string; icon: string; click: () => void }[] = [];
  addItem(callback: (item: unknown) => void): void {
    const entry = { title: "", icon: "", click: () => {} };
    const item = {
      setTitle(value: string) { entry.title = value; return this; },
      setIcon(value: string) { entry.icon = value; return this; },
      onClick(value: () => void) { entry.click = value; return this; }
    };
    callback(item);
    this.items.push(entry);
  }
}

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, write: false, logLevel: "silent" });
assert.ok(bundle.outputFiles?.[0]);

/** Loads the real plugin with Obsidian's visible versus hidden tab-menu lifecycle. */
async function loadPlugin(active: TestFile | null, files: TestFile[], tabHook = true) {
  class TestView {
    private state: Record<string, unknown>;
    constructor(state: Record<string, unknown>) { this.state = state; }
    getState(): Record<string, unknown> { return this.state; }
    onTabMenu(menu: TestMenu): void {
      menu.addItem((item) => { (item as { setTitle: (value: string) => void }).setTitle("Native close"); });
    }
  }
  const nativeTabMenu = TestView.prototype.onTabMenu;
  if (!tabHook) Reflect.deleteProperty(TestView.prototype, "onTabMenu");
  const module = { exports: {} as { FileDiffSideBySidePlugin: typeof FileDiffSideBySidePlugin } };
  runInNewContext(bundle.outputFiles[0]!.text, {
    module, exports: module.exports, console,
    require: (name: string) => {
      if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
      if (name === "electron") return {};
      assert.equal(name, "obsidian");
      return {
        addIcon: () => {}, Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, Modal: class {},
        SuggestModal: class {}, View: TestView, TFile: TestFile,
        Notice: class { constructor(message: string) { assert.fail(message); } },
        moment: { locale: () => "en" }, requireApiVersion: () => true
      };
    }
  });
  const plugin = Object.create(module.exports.FileDiffSideBySidePlugin.prototype) as FileDiffSideBySidePlugin;
  const events = new Map<string, (menu: Menu, file: TFile, source: string) => void>();
  const cleanups: (() => void)[] = [];
  const states: ViewState[] = [];
  const leaves: boolean[] = [];
  const revealed: unknown[] = [];
  const leaf = { setViewState: (state: ViewState) => { states.push(structuredClone(state)); return Promise.resolve(); } };
  const vaultFiles = [...files, ...(active ? [active] : [])];
  let activeFile = active;
  Object.assign(plugin, {
    app: {
      vault: {
        getAbstractFileByPath: (path: string) => vaultFiles.find(file => file.path === path) ?? null,
        getFiles: () => vaultFiles
      },
      workspace: {
        getActiveFile: () => activeFile,
        getLeaf: (newLeaf: boolean) => { leaves.push(newLeaf); return leaf; },
        revealLeaf: (value: unknown) => { revealed.push(value); return Promise.resolve(); },
        on: (name: string, callback: (menu: Menu, file: TFile, source: string) => void) => { events.set(name, callback); return {}; },
        onLayoutReady: () => {}
      }
    },
    loadData: () => Promise.resolve({ introductionSeen: true }),
    registerView: () => {}, registerObsidianProtocolHandler: () => {}, registerEvent: () => {},
    register: (cleanup: () => void) => { cleanups.push(cleanup); },
    addCommand: (command: unknown) => command,
    addRibbonIcon: () => ({ toggleVisibility: () => {} }), addSettingTab: () => {},
    pickFile: () => { assert.fail("direct comparison must not open a picker"); }
  });
  await plugin.onload();
  /** Reproduces the native menu flow: only visible tabs additionally emit file-menu. */
  function tabMenu(path: unknown, visible = false): TestMenu {
    const menu = new TestMenu();
    new TestView({ file: path }).onTabMenu(menu);
    const file = vaultFiles.find(file => file.path === path);
    if (visible && file) events.get("file-menu")!(menu as unknown as Menu, file as unknown as TFile, "tab-header");
    return menu;
  }
  return {
    plugin, events, states, leaves, revealed, leaf, tabMenu, TestView, nativeTabMenu,
    setActiveFile: (file: TestFile | null) => { activeFile = file; },
    unload: () => { cleanups.forEach(cleanup => cleanup()); }
  };
}

test("a hidden tab compares directly with the menu-time active file and preserves native items", async () => {
  for (const extension of ["md", "txt"]) {
    const active = new TestFile("Notes/Original.md");
    const other = new TestFile(`Notes/Comparison.${extension}`);
    const fixture = await loadPlugin(active, [other]);
    const menu = fixture.tabMenu(other.path);
    assert.deepEqual(menu.items.map(item => item.title), ["Native close", "Compare with active file"]);
    assert.equal(menu.items[1]!.icon, "square-split-horizontal");
    assert.deepEqual(fixture.states, [], "opening the menu alone must not open a comparison");
    fixture.setActiveFile(other);
    menu.items[1]!.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.states, [{
      type: "side-by-side-diff-view", active: true,
      state: { leftPath: active.path, rightPath: other.path, editRight: false, mode: "compare" }
    }]);
    assert.deepEqual(fixture.leaves, [true]);
    assert.deepEqual(fixture.revealed, [fixture.leaf]);
    fixture.unload();
  }
});

test("visible inactive tabs get the direct action once and retain the existing picker action", async () => {
  const active = new TestFile("Original.md");
  const other = new TestFile("Comparison.md");
  const fixture = await loadPlugin(active, [other]);
  const menu = fixture.tabMenu(other.path, true);
  assert.deepEqual(menu.items.map(item => item.title), ["Native close", "Compare with active file", "Compare with another file"]);
  fixture.unload();
});

test("active/same-file tabs, non-text files, missing files and non-file views have no direct action", async () => {
  const original = new TestFile("Original.md");
  const binary = new TestFile("Image.PNG");
  const other = new TestFile("Comparison.txt");
  for (const active of [original, null, binary]) {
    const fixture = await loadPlugin(active, [original, other, binary]);
    for (const path of [original.path, binary.path, "Missing.md", undefined, 42, ...(active !== original ? [other.path] : [])]) {
      assert.deepEqual(fixture.tabMenu(path).items.map(item => item.title), ["Native close"]);
    }
    assert.deepEqual(fixture.states, []);
    fixture.unload();
  }
});

test("file explorer menus offer direct comparison while document menus retain their existing actions", async () => {
  const active = new TestFile("Original.md");
  const other = new TestFile("Comparison.md");
  const fixture = await loadPlugin(active, [other]);
  for (const source of ["file-explorer-context-menu", "more-options"]) {
    for (const file of [active, other]) {
      const menu = new TestMenu();
      fixture.events.get("file-menu")!(menu as unknown as Menu, file as unknown as TFile, source);
      assert.deepEqual(menu.items.map(item => item.title), file === active
        ? ["Compare with another file", "Suggest changes", "Refresh"]
        : source === "file-explorer-context-menu"
          ? ["Compare with another file", "Compare with active file"]
          : ["Compare with another file"]);
    }
  }
  fixture.unload();
});

test("file explorer comparison captures the active file and opens the clicked file without a picker", async () => {
  for (const tabHook of [true, false]) {
    const active = new TestFile("Notes/Original.md");
    const other = new TestFile("Archive/Comparison.txt");
    const fixture = await loadPlugin(active, [other], tabHook);
    const menu = new TestMenu();
    fixture.events.get("file-menu")!(menu as unknown as Menu, other as unknown as TFile, "file-explorer-context-menu");
    const directAction = menu.items.find(item => item.title === "Compare with active file");
    assert.ok(directAction);
    assert.deepEqual(fixture.states, []);
    fixture.setActiveFile(other);
    directAction.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.states, [{
      type: "side-by-side-diff-view", active: true,
      state: { leftPath: active.path, rightPath: other.path, editRight: false, mode: "compare" }
    }]);
    assert.deepEqual(fixture.leaves, [true]);
    fixture.unload();
  }
});

test("file explorer direct comparison excludes the active file, folders, binaries and missing active text files", async () => {
  const original = new TestFile("Original.md");
  const other = new TestFile("Comparison.md");
  const binary = new TestFile("Image.PNG");
  const folder = { path: "Notes" };
  for (const active of [original, null, binary]) {
    const fixture = await loadPlugin(active, [original, other, binary]);
    for (const file of [original, binary, folder, ...(active !== original ? [other] : [])]) {
      const menu = new TestMenu();
      fixture.events.get("file-menu")!(menu as unknown as Menu, file as unknown as TFile, "file-explorer-context-menu");
      assert.equal(menu.items.some(item => item.title === "Compare with active file"), false);
    }
    assert.deepEqual(fixture.states, []);
    fixture.unload();
  }
});

test("unloading restores the native tab hook and leaves later wrappers intact", async () => {
  for (const wrapLater of [false, true]) {
    const fixture = await loadPlugin(new TestFile("Original.md"), [new TestFile("Other.md")]);
    const wrapped = fixture.TestView.prototype.onTabMenu;
    if (wrapLater) {
      fixture.TestView.prototype.onTabMenu = function (menu) {
        wrapped.call(this, menu);
        menu.addItem(item => { (item as { setTitle: (value: string) => void }).setTitle("Other plugin"); });
      };
    }
    const latest = fixture.TestView.prototype.onTabMenu;
    fixture.unload();
    assert.equal(fixture.TestView.prototype.onTabMenu, wrapLater ? latest : fixture.nativeTabMenu);
    assert.deepEqual(fixture.tabMenu("Other.md").items.map(item => item.title), wrapLater ? ["Native close", "Other plugin"] : ["Native close"]);
  }
});

test("an unavailable internal tab hook falls back to public file-menu events", async () => {
  const active = new TestFile("Original.md");
  const other = new TestFile("Other.md");
  const fixture = await loadPlugin(active, [other], false);
  const menu = new TestMenu();
  fixture.events.get("file-menu")!(menu as unknown as Menu, other as unknown as TFile, "tab-header");
  assert.deepEqual(menu.items.map(item => item.title), ["Compare with another file", "Compare with active file"]);
  fixture.unload();
});
