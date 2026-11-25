import { PluginSettingTab, Setting, requireApiVersion } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type FileDiffSideBySidePlugin from "./main";
import { DEFAULT_SETTINGS, isDiffDirection, isLanguagePreference, sanitizeCopySuffix } from "./settings-model";
import { createAboutDetails } from "./about-modal";
import { isDiffLayout } from "./diff-layout";

export { DEFAULT_SETTINGS, isLanguagePreference, normalizePluginSettings, sanitizeCopySuffix } from "./settings-model";
export type { PluginSettings } from "./settings-model";

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
        name: this.plugin.manifest.name,
        desc: createAboutDetails(this.plugin.manifest, this.plugin.translate.bind(this.plugin), this.plugin.language),
        searchable: false
      },
      {
        name: this.plugin.translate("settings.about.name"),
        action: (): void => { this.plugin.showAbout(); }
      },
      {
        name: this.plugin.translate("settings.introduction.name"),
        desc: this.plugin.translate("settings.introduction.description"),
        action: (): void => { this.plugin.showIntroduction(); }
      },
      {
        name: this.plugin.translate("agent.setup.title"),
        desc: this.plugin.translate("agent.setup.description"),
        action: (): void => { this.plugin.showAgentInstructions(); }
      },
      {
        name: this.plugin.translate("settings.language.name"),
        desc: this.plugin.translate("settings.language.description"),
        // Native controls retain their existing label while focused during update().
        render: (setting): void => { this.renderLanguageDropdown(setting); }
      },
      {
        name: this.plugin.translate("settings.comparison.heading"),
        searchable: false,
        render: (setting): void => { setting.setHeading(); }
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
        name: this.plugin.translate("settings.applyDirection.name"),
        desc: this.plugin.translate("settings.applyDirection.description"),
        control: {
          type: "dropdown",
          key: "defaultApplyDirection",
          defaultValue: DEFAULT_SETTINGS.defaultApplyDirection,
          options: {
            "left-to-right": this.plugin.translate("settings.applyDirection.leftToRight"),
            "right-to-left": this.plugin.translate("settings.applyDirection.rightToLeft")
          }
        }
      },
      {
        name: this.plugin.translate("settings.layout.name"),
        desc: this.plugin.translate("settings.layout.description"),
        control: {
          type: "dropdown",
          key: "defaultLayout",
          defaultValue: DEFAULT_SETTINGS.defaultLayout,
          options: {
            auto: this.plugin.translate("view.layout.auto"),
            "side-by-side": this.plugin.translate("view.layout.side-by-side"),
            "single-column": this.plugin.translate("view.layout.single-column")
          }
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
        name: this.plugin.translate("settings.headingAlignment.name"),
        desc: this.plugin.translate("settings.headingAlignment.description"),
        control: {
          type: "toggle",
          key: "alignMarkdownByHeadings",
          defaultValue: DEFAULT_SETTINGS.alignMarkdownByHeadings
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
          validate: (value: string): string | undefined => this.validateSuffix(value)
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
    } else if (key === "defaultApplyDirection" && isDiffDirection(value)) {
      this.plugin.settings.defaultApplyDirection = value;
    } else if (key === "defaultLayout" && isDiffLayout(value)) {
      this.plugin.settings.defaultLayout = value;
    } else if (key === "alignMarkdownByHeadings" && typeof value === "boolean") {
      this.plugin.settings.alignMarkdownByHeadings = value;
    } else if (key === "changeCopySuffix" && typeof value === "string" && this.validateSuffix(value) === undefined) {
      this.plugin.settings.changeCopySuffix = value;
    } else {
      return;
    }
    await this.plugin.saveSettings();
    if (key === "language") {
      if (requireApiVersion("1.13.0")) this.update();
      else this.renderLegacySettings();
    }
  }
  /** Renders the legacy settings UI for Obsidian versions before declarative settings. */
  override display(): void {
    this.renderLegacySettings();
  }

  /** Re-renders legacy controls after a setting changes. */
  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(this.plugin.manifest.name)
      .setDesc(createAboutDetails(this.plugin.manifest, this.plugin.translate.bind(this.plugin), this.plugin.language));
    new Setting(containerEl).setName(this.plugin.translate("settings.about.name")).addButton(button => {
      button.setButtonText(this.plugin.translate("settings.about.open")).onClick(() => { this.plugin.showAbout(); });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.introduction.name")).setDesc(this.plugin.translate("settings.introduction.description")).addButton((button) => {
      button.setButtonText(this.plugin.translate("settings.introduction.button")).onClick(() => { this.plugin.showIntroduction(); });
    });
    new Setting(containerEl).setName(this.plugin.translate("agent.setup.title")).setDesc(this.plugin.translate("agent.setup.description")).addButton(button => {
      button.setButtonText(this.plugin.translate("agent.setup.openAction")).onClick(() => { this.plugin.showAgentInstructions(); });
    });
    this.renderLanguageDropdown(new Setting(containerEl).setName(this.plugin.translate("settings.language.name"))
      .setDesc(this.plugin.translate("settings.language.description")));
    new Setting(containerEl).setName(this.plugin.translate("settings.comparison.heading")).setHeading();
    new Setting(containerEl).setName(this.plugin.translate("settings.ribbon.name")).setDesc(this.plugin.translate("settings.ribbon.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
        await this.setControlValue("showRibbonIcon", value);
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.applyDirection.name")).setDesc(this.plugin.translate("settings.applyDirection.description")).addDropdown((dropdown) => {
      dropdown.addOption("left-to-right", this.plugin.translate("settings.applyDirection.leftToRight"))
        .addOption("right-to-left", this.plugin.translate("settings.applyDirection.rightToLeft"))
        .setValue(this.plugin.settings.defaultApplyDirection).onChange(async (value) => {
          await this.setControlValue("defaultApplyDirection", value);
        });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.layout.name")).setDesc(this.plugin.translate("settings.layout.description")).addDropdown((dropdown) => {
      dropdown.addOption("auto", this.plugin.translate("view.layout.auto"))
        .addOption("side-by-side", this.plugin.translate("view.layout.side-by-side"))
        .addOption("single-column", this.plugin.translate("view.layout.single-column"))
        .setValue(this.plugin.settings.defaultLayout).onChange(async (value) => {
          await this.setControlValue("defaultLayout", value);
        });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.autoAdvance.name")).setDesc(this.plugin.translate("settings.autoAdvance.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoAdvanceAfterChange).onChange(async (value) => {
        await this.setControlValue("autoAdvanceAfterChange", value);
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.headingAlignment.name")).setDesc(this.plugin.translate("settings.headingAlignment.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.alignMarkdownByHeadings).onChange(async (value) => {
        await this.setControlValue("alignMarkdownByHeadings", value);
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.suffix.name")).setDesc(this.plugin.translate("settings.suffix.description")).addText((text) => {
      text.setPlaceholder("_changes_").setValue(this.plugin.settings.changeCopySuffix).onChange(async (value) => {
        const error = this.validateSuffix(value);
        text.inputEl.setCustomValidity(error ?? "");
        if (error !== undefined) {
          text.inputEl.setAttribute("aria-invalid", "true");
          text.inputEl.reportValidity();
        } else {
          text.inputEl.removeAttribute("aria-invalid");
          await this.setControlValue("changeCopySuffix", value);
        }
      });
    });
  }

  /** Shares the language selector across both settings renderers. */
  private renderLanguageDropdown(setting: Setting): void {
    setting.addDropdown(dropdown => {
      for (const value of ["auto", "de", "en", "fr", "it", "es", "pt-BR", "pt-PT", "nl", "zh-CN"]) {
        dropdown.addOption(value, this.plugin.translate(`settings.language.${value}`));
      }
      dropdown.setValue(this.plugin.settings.language).onChange(async value => {
        await this.setControlValue("language", value);
      });
    });
  }

  /** Shares validation between the native declarative control and its legacy counterpart. */
  private validateSuffix(value: string): string | undefined {
    if (value.length === 0 || sanitizeCopySuffix(value) !== value) {
      return this.plugin.translate("settings.suffix.invalid");
    }
  }
}
