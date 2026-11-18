import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import type { TFile, ViewState, WorkspaceLeaf } from "obsidian";
import type { FileDiffSideBySidePlugin } from "../src/main.ts";
import type { SideBySideDiffView } from "../src/diff-view.ts";
import type { FileDiffSettingsTab } from "../src/settings.ts";
import type { FilePickerModal } from "../src/modals.ts";
import type { PluginSettings } from "../src/settings-model.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Supplies real instanceof checks and file extensions to the bundled plugin. */
class TestFile {
  path: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    this.extension = path.split(".").at(-1)!;
  }
  get name(): string { return this.path.split("/").at(-1)!; }
}

/** Retains the actual view's rendered text, controls and event handlers without browser layout. */
class ViewElement {
  children: ViewElement[] = [];
  classes = new Set<string>();
  dataset: Record<string, string> = {};
  ownerDocument = { defaultView: null };
  handlers = new Map<string, () => void>();
  textContent = "";
  tag: string;
  constructor(tag = "div", options: { cls?: string; text?: string } = {}) {
    this.tag = tag;
    this.addClass(...(options.cls?.split(" ") ?? []));
    this.textContent = options.text ?? "";
  }
  get innerText(): string { return this.textContent + this.children.map(child => child.innerText).join(""); }
  createEl(tag: string, options: { cls?: string; text?: string } = {}): ViewElement {
    const child = new ViewElement(tag, options);
    this.children.push(child);
    return child;
  }
  createDiv(options: { cls?: string; text?: string } = {}): ViewElement { return this.createEl("div", options); }
  createSpan(options: { cls?: string; text?: string } = {}): ViewElement { return this.createEl("span", options); }
  addClass(...classes: string[]): void { classes.forEach(value => this.classes.add(value)); }
  empty(): void { this.children = []; this.textContent = ""; }
  addEventListener(event: string, callback: () => void): void { this.handlers.set(event, callback); }
  setAttribute(): void {}
  querySelector(selector: string): ViewElement | null {
    return this.find(element => selector.split(",").some(value => element.classes.has(value.trim().slice(1))));
  }
  find(predicate: (element: ViewElement) => boolean): ViewElement | null {
    return this.children.find(predicate) ?? this.children.map(child => child.find(predicate)).find(Boolean) ?? null;
  }
}

/** Provides only the ItemView host; constructor, lifecycle, state and rendering remain plugin code. */
class TestItemView {
  app: unknown;
  leaf: unknown;
  contentEl: ViewElement;
  constructor(leaf: { app: unknown; contentEl: ViewElement }) {
    this.app = leaf.app;
    this.leaf = leaf;
    this.contentEl = leaf.contentEl;
  }
  registerDomEvent(): void {}
  registerEvent(): void {}
  async setState(): Promise<void> {}
}

type Picker = FilePickerModal & { placeholder: string };

/** Lets tests choose or close the actual FilePickerModal without rendering Obsidian. */
class TestSuggestModal {
  app: { pickers: Picker[] };
  placeholder = "";
  constructor(app: { pickers: Picker[] }) { this.app = app; }
  setPlaceholder(value: string): void { this.placeholder = value; }
  open(): void { this.app.pickers.push(this as unknown as Picker); }
  close(): void { this.onClose(); }
  onClose(): void {}
  /** Matches Obsidian's close-before-choice order when accepting a suggestion. */
  selectSuggestion(file: TFile): void {
    this.close();
    (this as unknown as Picker).onChooseSuggestion(file);
  }
}

const notices: string[] = [];
const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, write: false, logLevel: "silent" });
assert.ok(bundle.outputFiles?.[0]);
const module = { exports: {} as { FileDiffSideBySidePlugin: typeof FileDiffSideBySidePlugin } };
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports, console,
  createFragment: (callback: (fragment: { appendText: () => void; createEl: () => void }) => void) => {
    const fragment = { appendText: () => {}, createEl: () => {} };
    callback(fragment);
    return fragment;
  },
  require: (name: string) => {
    if (name === "electron") return {};
    if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
    assert.equal(name, "obsidian");
    return {
      Plugin: class {}, ItemView: TestItemView, PluginSettingTab: class {}, Modal: class {},
      SuggestModal: TestSuggestModal, TFile: TestFile,
      Notice: class { constructor(message: string) { notices.push(message); } },
      moment: { locale: () => "en" }, requireApiVersion: () => true
    };
  }
});

/** Loads the plugin and lets setViewState construct, open and render the registered real view. */
async function loadPlugin(activeFile: TestFile | null, stored: Partial<PluginSettings> = {}, files: TestFile[] = []) {
  notices.length = 0;
  const registrations: { icon: string; label: string; click: () => void }[] = [];
  const tabs: FileDiffSettingsTab[] = [];
  const pickers: Picker[] = [];
  const states: unknown[] = [];
  const newLeaves: boolean[] = [];
  const revealed: unknown[] = [];
  const persisted: PluginSettings[] = [];
  const visibility: boolean[] = [];
  const ribbon = { toggleVisibility: (visible: boolean) => { visibility.push(visible); } };
  const plugin = Object.create(module.exports.FileDiffSideBySidePlugin.prototype) as FileDiffSideBySidePlugin;
  const creators = new Map<string, (leaf: WorkspaceLeaf) => SideBySideDiffView>();
  const vaultFiles = new Map([...files, ...(activeFile ? [activeFile] : [])].map(file => [file.path, file]));
  const leaf = {
    get app() { return plugin.app; },
    contentEl: new ViewElement(),
    view: null as SideBySideDiffView | null,
    async setViewState(state: ViewState): Promise<void> {
      states.push(structuredClone(state));
      const createView = creators.get(state.type);
      assert.ok(createView, "the plugin must register the requested view type");
      this.view = createView(this as unknown as WorkspaceLeaf);
      await this.view.onOpen();
      await this.view.setState(state.state, { history: false });
    }
  };
  Object.assign(plugin, {
    app: { pickers, vault: {
      getFiles: () => [...vaultFiles.values()],
      getAbstractFileByPath: (path: string) => vaultFiles.get(path) ?? null,
      getName: () => "Test Vault", on: () => ({}),
      cachedRead: (file: TestFile) => Promise.resolve(`Content of ${file.path}\n`)
    }, workspace: {
      getActiveFile: () => activeFile,
      getLeaf: (newLeaf: boolean) => { newLeaves.push(newLeaf); return leaf; },
      revealLeaf: (value: unknown) => { revealed.push(value); return Promise.resolve(); },
      on: () => ({}), onLayoutReady: () => {}
    } },
    loadData: () => Promise.resolve(stored),
    saveData: (settings: PluginSettings) => { persisted.push(structuredClone(settings)); return Promise.resolve(); },
    registerView: (type: string, createView: (leaf: WorkspaceLeaf) => SideBySideDiffView) => { creators.set(type, createView); },
    registerObsidianProtocolHandler: () => {}, registerEvent: () => {},
    addCommand: (command: unknown) => command,
    addRibbonIcon: (icon: string, label: string, click: () => void) => {
      registrations.push({ icon, label, click });
      return ribbon;
    },
    addSettingTab: (tab: FileDiffSettingsTab) => { tabs.push(tab); }
  });
  // Forward to the real handler and expose its promise: the ribbon intentionally returns void.
  const operations: Promise<void>[] = [];
  const compareTwoFiles = plugin.compareTwoFiles.bind(plugin);
  plugin.compareTwoFiles = () => {
    const operation = compareTwoFiles();
    operations.push(operation);
    return operation;
  };
  await plugin.onload();
  assert.equal(registrations.length, 1);
  const registration = registrations[0]!;
  /** Dispatches the exact callback registered with Obsidian and awaits its real async work. */
  function clickRibbon(): Promise<void> {
    const before = operations.length;
    registration.click();
    assert.equal(operations.length, before + 1, "the ribbon must invoke Compare two files");
    return operations[before]!;
  }
  return { plugin, registration, clickRibbon, pickers, states, newLeaves, revealed, leaf, visibility, tabs, persisted };
}

/** Checks the rendered original and the functional comparison-file selector, not just the workspace request. */
function assertOriginalOpened(fixture: Awaited<ReturnType<typeof loadPlugin>>, path: string): void {
  assert.deepEqual(fixture.states, [{
    type: "side-by-side-diff-view", active: true,
    state: { leftPath: path, rightPath: null, editRight: false, mode: "compare" }
  }]);
  assert.deepEqual(fixture.newLeaves, [true]);
  assert.deepEqual(fixture.revealed, [fixture.leaf]);
  assert.deepEqual(notices, []);
  assert.equal(fixture.leaf.view?.getViewType(), "side-by-side-diff-view");
  assert.equal(fixture.leaf.view?.state.leftPath, path);
  assert.equal(fixture.leaf.view?.state.rightPath, null);
  const content = fixture.leaf.contentEl;
  assert.equal(content.querySelector(".file-diff-sbs-message"), null, "rendering must not fall back to an error message");
  assert.equal(content.querySelector(".file-diff-sbs-code")?.innerText, `Content of ${path}`);
  const pickerPane = content.querySelector(".file-diff-sbs-picker-pane");
  assert.ok(pickerPane, "the actual view must render the comparison-file selector");
  const chooseButton = pickerPane.find(element => element.tag === "button" && element.textContent === "Open file search");
  assert.ok(chooseButton?.handlers.get("click"), "the comparison selector must expose a working search button");
}

test("the registered ribbon button opens the active text file with no comparison file or picker", async () => {
  for (const extension of ["md", "txt"]) {
    const fixture = await loadPlugin(new TestFile(`Notes/Original.${extension}`));
    assert.equal(fixture.registration.icon, "square-split-horizontal");
    assert.equal(fixture.registration.label, "Compare two files");
    await fixture.clickRibbon();
    assert.deepEqual(fixture.pickers, []);
    assertOriginalOpened(fixture, `Notes/Original.${extension}`);
  }
});

test("without an active text file the ribbon waits for a text-file selection before opening", async () => {
  const first = new TestFile("Notes/A.md");
  const last = new TestFile("Notes/Z.txt");
  const binary = new TestFile("Images/photo.PNG");
  for (const active of [null, binary]) {
    const fixture = await loadPlugin(active, {}, [last, binary, first]);
    const operation = fixture.clickRibbon();
    assert.equal(fixture.pickers.length, 1);
    assert.deepEqual(fixture.states, []);
    assert.deepEqual(fixture.newLeaves, []);
    const picker = fixture.pickers[0]!;
    assert.equal(picker.placeholder, "Select left file");
    assert.deepEqual(Array.from(picker.getSuggestions("")), [first, last]);
    picker.selectSuggestion(last as unknown as TFile, {} as MouseEvent);
    await operation;
    assertOriginalOpened(fixture, last.path);
    const view = fixture.leaf.view!;
    const searchButton = fixture.leaf.contentEl.querySelector(".file-diff-sbs-picker-pane")!
      .find(element => element.tag === "button" && element.textContent === "Open file search")!;
    searchButton.handlers.get("click")!();
    assert.equal(fixture.pickers.length, 2, "the rendered comparison selector must open the second file picker");
    const comparisonPicker = fixture.pickers[1]!;
    assert.equal(comparisonPicker.placeholder, "Select right file");
    assert.deepEqual(Array.from(comparisonPicker.getSuggestions("")), [first], "the original and binary files must be excluded");
    comparisonPicker.close();
    assert.equal(fixture.leaf.view, view);
    assert.equal(view.state.rightPath, null, "cancelling the comparison picker must keep the original preview");
  }
});

test("cancelling the ribbon's file picker opens no comparison or workspace leaf", async () => {
  for (const files of [[], [new TestFile("Notes/Original.md")]]) {
    const fixture = await loadPlugin(null, {}, files);
    const operation = fixture.clickRibbon();
    assert.equal(fixture.pickers.length, 1);
    fixture.pickers[0]!.close();
    await operation;
    assert.deepEqual(fixture.states, []);
    assert.deepEqual(fixture.newLeaves, []);
    assert.deepEqual(fixture.revealed, []);
    assert.deepEqual(notices, []);
  }
});

test("the ribbon restores visibility and the registered settings control hides and shows the same button", async () => {
  for (const initial of [true, false]) {
    const fixture = await loadPlugin(null, { showRibbonIcon: initial });
    assert.deepEqual(fixture.visibility, [initial]);
    assert.equal(fixture.tabs.length, 1);
    const tab = fixture.tabs[0]!;
    const definition = tab.getSettingDefinitions().find(item => "name" in item && item.name === fixture.plugin.translate("settings.ribbon.name"));
    assert.ok(definition && "control" in definition);
    assert.equal(definition.control.type, "toggle");
    assert.equal(definition.control.key, "showRibbonIcon");
    assert.equal(definition.control.defaultValue, true);
    const key = definition.control.key;
    await tab.setControlValue(key, !initial);
    assert.equal(fixture.plugin.settings.showRibbonIcon, !initial);
    assert.deepEqual(fixture.visibility, [initial, !initial]);
    assert.equal(fixture.persisted.at(-1)?.showRibbonIcon, !initial);
    await tab.setControlValue(key, initial);
    assert.deepEqual(fixture.visibility, [initial, !initial, initial]);
    assert.deepEqual(fixture.persisted.map(settings => settings.showRibbonIcon), [!initial, initial]);
    await tab.setControlValue(key, "false");
    assert.deepEqual(fixture.visibility, [initial, !initial, initial]);
    assert.equal(fixture.persisted.length, 2);
  }
});
