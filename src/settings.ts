import { PluginSettingTab, Setting } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type FileDiffSideBySidePlugin from "./main";
import { DEFAULT_SETTINGS, isLanguagePreference, sanitizeCopySuffix } from "./settings-model";

export { DEFAULT_SETTINGS, isLanguagePreference, normalizePluginSettings, sanitizeCopySuffix } from "./settings-model";
export type { PluginSettings } from "./settings-model";

const AUTHOR_WEBSITE_URL = "https://blum-nico.de";
const GITHUB_REPOSITORY_URL = "https://github.com/nblum/obsidian-side-by-side-diff";
const GITHUB_FEEDBACK_URL = `${GITHUB_REPOSITORY_URL}/issues/new`;

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
        name: this.plugin.translate("settings.about.name"),
        desc: this.createAboutDescription(),
        searchable: false
      },
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
        name: this.plugin.translate("settings.autoAdvance.name"),
        desc: this.plugin.translate("settings.autoAdvance.description"),
        control: {
          type: "toggle",
          key: "autoAdvanceAfterChange",
          defaultValue: DEFAULT_SETTINGS.autoAdvanceAfterChange
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
    } else if (key === "autoAdvanceAfterChange" && typeof value === "boolean") {
      this.plugin.settings.autoAdvanceAfterChange = value;
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
    new Setting(containerEl).setName(this.plugin.translate("settings.about.name")).setDesc(this.createAboutDescription());
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
    new Setting(containerEl).setName(this.plugin.translate("settings.autoAdvance.name")).setDesc(this.plugin.translate("settings.autoAdvance.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoAdvanceAfterChange).onChange(async (value) => {
        this.plugin.settings.autoAdvanceAfterChange = value;
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

  /** Builds the localized about text and its external links. */
  private createAboutDescription(): DocumentFragment {
    return createFragment((fragment) => {
      fragment.appendText(this.plugin.translate("settings.about.description"));
      fragment.createEl("br");
      fragment.appendText(this.plugin.translate("settings.about.support"));
      fragment.createEl("br");
      this.appendExternalLink(fragment, this.plugin.translate("settings.about.website"), AUTHOR_WEBSITE_URL);
      fragment.appendText(" · ");
      this.appendExternalLink(fragment, this.plugin.translate("settings.about.star"), GITHUB_REPOSITORY_URL);
      fragment.appendText(" · ");
      this.appendExternalLink(fragment, this.plugin.translate("settings.about.feedback"), GITHUB_FEEDBACK_URL);
    });
  }

  /** Appends an external link that opens without access to the Obsidian window. */
  private appendExternalLink(parent: DocumentFragment, label: string, href: string): void {
    parent.createEl("a", {
      text: label,
      href,
      attr: {
        target: "_blank",
        rel: "noopener"
      }
    });
  }
}
