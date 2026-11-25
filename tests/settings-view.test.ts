import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import type { FileDiffSettingsTab } from "../src/settings.ts";
import { DEFAULT_SETTINGS } from "../src/settings-model.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Captures the callbacks registered by the real legacy settings renderer. */
class LegacyControl {
  value: string | boolean | undefined;
  options: Record<string, string> = {};
  change: ((value: string | boolean) => Promise<void> | void) | undefined;
  addOption(key: string, label: string): this { this.options[key] = label; return this; }
  setValue(value: string | boolean): this { this.value = value; return this; }
  onChange(callback: (value: string | boolean) => Promise<void> | void): this { this.change = callback; return this; }
  setPlaceholder(): this { return this; }
  setButtonText(): this { return this; }
  onClick(): this { return this; }
}

const legacySettings: LegacySetting[] = [];
const manifest = { name: "Side-by-Side Diff", author: "Nico Blum", version: "0.11.0", description: "Compare text files." };
/** Supplies Obsidian's fluent control builder while retaining rendered dropdowns. */
class LegacySetting {
  name = "";
  control: LegacyControl | undefined;
  constructor() { legacySettings.push(this); }
  setName(name: string): this { this.name = name; return this; }
  setDesc(): this { return this; }
  setHeading(): this { return this; }
  addDropdown(callback: (control: LegacyControl) => void): this {
    this.control = new LegacyControl();
    callback(this.control);
    return this;
  }
  addToggle(callback: (control: LegacyControl) => void): this { return this.addDropdown(callback); }
  addText(callback: (control: LegacyControl) => void): this { return this.addDropdown(callback); }
  addButton(callback: (control: LegacyControl) => void): this { return this.addDropdown(callback); }
}

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/settings.ts"], write: false, logLevel: "silent" });
assert.ok(bundle.outputFiles?.[0]);
const module = { exports: {} as { FileDiffSettingsTab: typeof FileDiffSettingsTab } };
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports,
  require: () => ({ PluginSettingTab: class {}, Setting: LegacySetting, Modal: class {}, requireApiVersion: () => true }),
  createFragment: (callback: (fragment: { appendText: () => void; createEl: () => void }) => void) => {
    const fragment = { appendText: () => {}, createEl: () => {} };
    callback(fragment);
    return fragment;
  }
});

test("legacy settings render the saved direction and persist changes through the actual dropdown callback", async () => {
  for (const initial of ["left-to-right", "right-to-left"] as const) {
    const settings = { ...DEFAULT_SETTINGS, defaultApplyDirection: initial };
    const persisted: string[] = [];
    const tab = Object.create(module.exports.FileDiffSettingsTab.prototype) as FileDiffSettingsTab;
    Object.assign(tab, {
      containerEl: { empty: () => { legacySettings.length = 0; } },
      plugin: {
        manifest, language: "en",
        settings,
        translate: (key: string) => key,
        saveSettings: () => { persisted.push(settings.defaultApplyDirection); return Promise.resolve(); }
      }
    });
    tab.display();
    const control = legacySettings.find(setting => setting.name === "settings.applyDirection.name")?.control;
    assert.ok(control?.change);
    assert.equal(control.value, initial);
    assert.deepEqual(control.options, {
      "left-to-right": "settings.applyDirection.leftToRight",
      "right-to-left": "settings.applyDirection.rightToLeft"
    });
    const selected = initial === "left-to-right" ? "right-to-left" : "left-to-right";
    await control.change(selected);
    assert.equal(settings.defaultApplyDirection, selected);
    assert.deepEqual(persisted, [selected]);
    await control.change("invalid");
    assert.equal(settings.defaultApplyDirection, selected);
    assert.deepEqual(persisted, [selected]);
    tab.display();
    assert.equal(legacySettings.find(setting => setting.name === "settings.applyDirection.name")?.control?.value, selected);
  }
});

test("the default-direction setting offers both directions and persists only valid selections", async () => {
  const settings = { ...DEFAULT_SETTINGS };
  const persisted: string[] = [];
  const tab = Object.create(module.exports.FileDiffSettingsTab.prototype) as FileDiffSettingsTab;
  Object.assign(tab, { plugin: {
    manifest, language: "en",
    settings,
    translate: (key: string) => key,
    saveSettings: () => { persisted.push(settings.defaultApplyDirection); return Promise.resolve(); }
  } });
  const definition = tab.getSettingDefinitions().find(item => "name" in item && item.name === "settings.applyDirection.name");
  assert.ok(definition && "control" in definition);
  assert.equal(definition.control.type, "dropdown");
  assert.equal(definition.control.key, "defaultApplyDirection");
  assert.equal(definition.control.defaultValue, "left-to-right");
  assert.ok("options" in definition.control);
  assert.deepEqual(Object.keys(definition.control.options).sort(), ["left-to-right", "right-to-left"]);
  await tab.setControlValue("defaultApplyDirection", "right-to-left");
  assert.equal(settings.defaultApplyDirection, "right-to-left");
  await tab.setControlValue("defaultApplyDirection", "invalid");
  await tab.setControlValue("defaultApplyDirection", true);
  assert.equal(settings.defaultApplyDirection, "right-to-left");
  assert.deepEqual(persisted, ["right-to-left"]);
  await tab.setControlValue("defaultApplyDirection", "left-to-right");
  assert.deepEqual(persisted, ["right-to-left", "left-to-right"]);
});

test("the legacy ribbon toggle restores its value, updates visibility and persists both states", async () => {
  for (const initial of [true, false]) {
    const settings = { ...DEFAULT_SETTINGS, showRibbonIcon: initial };
    const visible: boolean[] = [];
    const persisted: boolean[] = [];
    const tab = Object.create(module.exports.FileDiffSettingsTab.prototype) as FileDiffSettingsTab;
    Object.assign(tab, {
      containerEl: { empty: () => { legacySettings.length = 0; } },
      plugin: {
        manifest, language: "en",
        settings,
        translate: (key: string) => key,
        updateRibbonVisibility: () => { visible.push(settings.showRibbonIcon); },
        saveSettings: () => { persisted.push(settings.showRibbonIcon); return Promise.resolve(); }
      }
    });
    tab.display();
    const control = legacySettings.find(setting => setting.name === "settings.ribbon.name")?.control;
    assert.ok(control?.change);
    assert.equal(control.value, initial);
    await control.change(!initial);
    assert.equal(settings.showRibbonIcon, !initial);
    assert.deepEqual(visible, [!initial]);
    assert.deepEqual(persisted, [!initial]);
    await control.change(initial);
    assert.equal(settings.showRibbonIcon, initial);
    assert.deepEqual(visible, [!initial, initial]);
    assert.deepEqual(persisted, [!initial, initial]);
    tab.display();
    assert.equal(legacySettings.find(setting => setting.name === "settings.ribbon.name")?.control?.value, initial);
  }
});


test("both settings renderers offer layout defaults and persist only valid selections", async () => {
  for (const initial of ["auto", "side-by-side", "single-column"] as const) {
    const settings = { ...DEFAULT_SETTINGS, defaultLayout: initial };
    const persisted: string[] = [];
    const tab = Object.create(module.exports.FileDiffSettingsTab.prototype) as FileDiffSettingsTab;
    Object.assign(tab, {
      containerEl: { empty: () => { legacySettings.length = 0; } },
      plugin: {
        manifest, language: "en",
        settings, translate: (key: string) => key,
        saveSettings: () => { persisted.push(settings.defaultLayout); return Promise.resolve(); }
      }
    });
    const definition = tab.getSettingDefinitions().find(item => "name" in item && item.name === "settings.layout.name");
    assert.ok(definition && "control" in definition);
    assert.ok("options" in definition.control);
    assert.deepEqual({ ...definition.control.options }, {
      auto: "view.layout.auto", "side-by-side": "view.layout.side-by-side", "single-column": "view.layout.single-column"
    });
    tab.display();
    const control = legacySettings.find(setting => setting.name === "settings.layout.name")?.control;
    assert.ok(control?.change);
    assert.equal(control.value, initial);
    await control.change("single-column");
    await tab.setControlValue("defaultLayout", "side-by-side");
    await control.change("invalid");
    await tab.setControlValue("defaultLayout", null);
    assert.deepEqual(persisted, ["single-column", "side-by-side"]);
    assert.equal(settings.defaultLayout, "side-by-side");
  }
});
