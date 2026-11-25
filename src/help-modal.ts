import { Component, MarkdownRenderer, Modal } from "obsidian";
import type { App } from "obsidian";
import type { Language, Translator } from "./i18n";
import { HELP_MARKDOWN, helpHeadingId } from "./help-content";

/** Displays the bundled README using Obsidian's Markdown renderer. */
export class HelpModal extends Modal {
  private readonly translate: Translator;
  private renderComponent: Component | null = null;

  /** Creates the help dialog with localized window text. */
  constructor(app: App, translate: Translator, private readonly language: Language) {
    super(app);
    this.translate = translate;
  }

  /** Renders documentation with a component scoped to the open dialog. */
  override async onOpen(): Promise<void> {
    this.modalEl.addClass("file-diff-sbs-help-modal");
    this.setTitle(this.translate("menu.help"));
    let guideParent: HTMLElement = this.contentEl;
    if (this.language !== "en") {
      this.renderQuickGuide();
      guideParent = this.contentEl.createEl("details");
      guideParent.createEl("summary", { text: this.translate("help.englishGuide") });
    }
    const content = guideParent.createDiv({ cls: "file-diff-sbs-help-content markdown-rendered" });
    const component = new Component();
    this.renderComponent = component;
    component.load();
    component.registerDomEvent(content, "click", (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const href = link?.getAttribute("href");
      if (href?.startsWith("#") !== true) return;
      event.preventDefault();
      event.stopPropagation();
      const heading = Array.from(content.querySelectorAll("h1, h2, h3, h4, h5, h6"))
        .find(element => helpHeadingId(element.textContent) === href.slice(1));
      heading?.scrollIntoView({ block: "start" });
    }, { capture: true });
    await MarkdownRenderer.render(this.app, HELP_MARKDOWN, content, "", component);
  }

  /** Uses the introduction's localized instructions for the core workflows. */
  private renderQuickGuide(): void {
    this.contentEl.createEl("p", { text: this.translate("modal.introduction.welcome.description") });
    for (const section of ["start.single", "start.multiple", "tips.keyboard", "tips.groups"] as const) {
      this.contentEl.createEl("h3", { text: this.translate(`modal.introduction.${section}.title`) });
      this.contentEl.createEl("p", { text: this.translate(`modal.introduction.${section}.description`) });
    }
  }

  /** Releases Markdown children and event handlers when the dialog closes. */
  override onClose(): void {
    this.renderComponent?.unload();
    this.renderComponent = null;
    this.contentEl.empty();
  }
}
