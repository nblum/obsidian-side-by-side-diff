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
/** Supplies Obsidian's fluent control builder while retaining rendered dropdowns. */
class LegacySetting {
  name = "";
  control: LegacyControl | undefined;
  constructor() { legacySettings.push(this); }
  setName(name: string): this { this.name = name; return this; }
  setDesc(): this { return this; }
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
  require: () => ({ PluginSettingTab: class {}, Setting: LegacySetting }),
  createFragment: (callback: (fragment: { appendText: () => void; createEl: () => void }) => void) => {
    const fragment = { appendText: () => {}, createEl: () => {} };
    callback(fragment);
    return fragment;
  }
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
