import { Modal } from "obsidian";
import type { App, PluginManifest } from "obsidian";
import { AUTHOR_WEBSITE_URL, DOCUMENTATION_URL, GITHUB_FEEDBACK_URL, GITHUB_REPOSITORY_URL, KO_FI_URL } from "./external-links";
import type { Language, Translator } from "./i18n";

/** Builds the same plugin details and links for settings and the About dialog. */
export function createAboutDetails(manifest: PluginManifest, translate: Translator, language: Language): DocumentFragment {
  return createFragment(fragment => {
    fragment.createEl("p", { text: language === "en" ? manifest.description : translate("settings.about.description") });
    fragment.createEl("p", {
      text: translate("settings.about.metadata", { version: manifest.version, author: manifest.author })
    });
    const links = [
      ["settings.about.documentation", DOCUMENTATION_URL],
      ["settings.about.repository", GITHUB_REPOSITORY_URL],
      ["settings.about.feedback", GITHUB_FEEDBACK_URL],
      ["settings.about.website", AUTHOR_WEBSITE_URL],
      ["settings.about.kofi", KO_FI_URL]
    ] as const;
    links.forEach(([key, href], index) => {
      if (index > 0) fragment.appendText(" · ");
      fragment.createEl("a", { text: translate(key), href, attr: { target: "_blank", rel: "noopener" } });
    });
  });
}

/** Shows the installed plugin's manifest information and support links. */
export class AboutModal extends Modal {
  constructor(
    app: App, private readonly manifest: PluginManifest,
    private readonly translate: Translator, private readonly language: Language
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("file-diff-sbs-about-modal");
    this.setTitle(this.translate("settings.about.title", { name: this.manifest.name }));
    this.contentEl.append(createAboutDetails(this.manifest, this.translate, this.language));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
