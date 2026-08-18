import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type FileDiffSideBySidePlugin from "./main";
import type { LanguagePreference } from "./i18n";

export interface PluginSettings {
  showRibbonIcon: boolean;
  changeCopySuffix: string;
  language: LanguagePreference;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  showRibbonIcon: true,
  changeCopySuffix: "_changes_",
  language: "auto"
};

/** Checks whether a persisted or UI value is a supported language preference. */
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "auto" || value === "de" || value === "en";
}

/** Replaces path-invalid suffix characters with safe underscores. */
export function sanitizeCopySuffix(value: string): string {
  return (value.length > 0 ? value : "_changes_").replace(/[\\/:*?"<>|]/g, "_");
}

/** Renders plugin settings for current and legacy Obsidian versions. */
export class FileDiffSettingsTab extends PluginSettingTab {
  private readonly plugin: FileDiffSideBySidePlugin;

  /** Creates the settings tab for the file diff plugin. */
  constructor(app: App, plugin: FileDiffSideBySidePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Returns settings rendered by Obsidian 1.13 and newer. */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: this.plugin.translate("settings.language.name"),
        desc: this.plugin.translate("settings.language.description"),
        control: {
          type: "dropdown",
          key: "language",
          defaultValue: DEFAULT_SETTINGS.language,
          options: {
            auto: this.plugin.translate("settings.language.auto"),
            de: this.plugin.translate("settings.language.de"),
            en: this.plugin.translate("settings.language.en")
          }
        }
      },
      {
        name: this.plugin.translate("settings.ribbon.name"),
        desc: this.plugin.translate("settings.ribbon.description"),
        control: {
          type: "toggle",
          key: "showRibbonIcon",
          defaultValue: DEFAULT_SETTINGS.showRibbonIcon
        }
      },
      {
        name: this.plugin.translate("settings.suffix.name"),
        desc: this.plugin.translate("settings.suffix.description"),
        control: {
          type: "text",
          key: "changeCopySuffix",
          defaultValue: DEFAULT_SETTINGS.changeCopySuffix,
          placeholder: "_changes_",
          validate: (value: string): string | undefined => {
            if (value.length === 0 || sanitizeCopySuffix(value) !== value) {
              return this.plugin.translate("settings.suffix.invalid");
            }
          }
        }
      }
    ];
  }

  /** Persists declarative setting changes and applies their runtime side effects. */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "language" && isLanguagePreference(value)) {
      this.plugin.updateLanguage(value);
    } else if (key === "showRibbonIcon" && typeof value === "boolean") {
      this.plugin.settings.showRibbonIcon = value;
      this.plugin.updateRibbonVisibility();
    } else if (key === "changeCopySuffix" && typeof value === "string") {
      this.plugin.settings.changeCopySuffix = sanitizeCopySuffix(value) || DEFAULT_SETTINGS.changeCopySuffix;
    } else {
      return;
    }
    await this.plugin.saveSettings();
  }
  /** Renders the legacy settings UI for Obsidian versions before declarative settings. */
  override display(): void {
    this.renderLegacySettings();
  }

  /** Re-renders legacy controls after a setting changes. */
  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(this.plugin.translate("settings.language.name")).setDesc(this.plugin.translate("settings.language.description")).addDropdown((dropdown) => {
      dropdown.addOption("auto", this.plugin.translate("settings.language.auto")).addOption("de", this.plugin.translate("settings.language.de")).addOption("en", this.plugin.translate("settings.language.en")).setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.updateLanguage(value);
        await this.plugin.saveSettings();
        this.renderLegacySettings();
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.ribbon.name")).setDesc(this.plugin.translate("settings.ribbon.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
        this.plugin.settings.showRibbonIcon = value;
        this.plugin.updateRibbonVisibility();
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.suffix.name")).setDesc(this.plugin.translate("settings.suffix.description")).addText((text) => {
      text.setPlaceholder("_changes_").setValue(this.plugin.settings.changeCopySuffix).onChange(async (value) => {
        this.plugin.settings.changeCopySuffix = sanitizeCopySuffix(value) || DEFAULT_SETTINGS.changeCopySuffix;
        text.setValue(this.plugin.settings.changeCopySuffix);
        await this.plugin.saveSettings();
      });
    });
  }
}
