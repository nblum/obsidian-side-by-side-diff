import { Modal, SuggestModal } from "obsidian";
import type { App, TFile } from "obsidian";
import { AUTHOR_WEBSITE_URL, DOCUMENTATION_URL, GITHUB_FEEDBACK_URL, GITHUB_REPOSITORY_URL, KO_FI_URL } from "./external-links";
import type { Translator } from "./i18n";
import { getIntroductionAssetUrl } from "./introduction-assets";
import type { IntroductionAssetName } from "./introduction-assets";
import { orderRecentFiles } from "./recent-files";

export type UnsavedChoice = "save" | "discard" | "cancel";

interface IntroductionStep {
  id: "welcome" | "start" | "selection" | "tips" | "thanks";
  titleKey: string;
  descriptionKey: string;
}

const INTRODUCTION_STEPS: readonly IntroductionStep[] = [
  {
    id: "welcome",
    titleKey: "modal.introduction.welcome.title",
    descriptionKey: "modal.introduction.welcome.description"
  },
  {
    id: "start",
    titleKey: "modal.introduction.start.title",
    descriptionKey: "modal.introduction.start.description"
  },
  {
    id: "selection",
    titleKey: "modal.introduction.selection.title",
    descriptionKey: "modal.introduction.selection.description"
  },
  {
    id: "tips",
    titleKey: "modal.introduction.tips.title",
    descriptionKey: "modal.introduction.tips.description"
  },
  {
    id: "thanks",
    titleKey: "modal.introduction.thanks.title",
    descriptionKey: "modal.introduction.thanks.description"
  }
];

/** Introduces the plugin through an extendable activation-time stepper. */
export class IntroductionModal extends Modal {
  private readonly translate: Translator;
  private currentStep = 0;

  /** Creates the localized introduction dialog. */
  constructor(app: App, translate: Translator, private readonly showAgentInstructions: () => void) {
    super(app);
    this.translate = translate;
  }
  /** Prepares the dialog and renders its first introduction step. */
  override onOpen(): void {
    this.modalEl.addClass("file-diff-sbs-introduction-modal");
    this.renderStep();
  }
  /** Renders the active step and its available navigation actions. */
  private renderStep(): void {
    const step = INTRODUCTION_STEPS[this.currentStep];
    if (!step) {
      this.close();
      return;
    }
    this.titleEl.setText(this.translate("modal.introduction.title"));
    this.contentEl.empty();
    const stepEl = this.contentEl.createDiv({ cls: "file-diff-sbs-introduction" });
    stepEl.createEl("h3", { text: this.translate(step.titleKey) });
    stepEl.createEl("p", { text: this.translate(step.descriptionKey) });
    this.renderStepContent(step.id, stepEl);
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-introduction-actions" });
    actions.createSpan({
      text: this.translate("modal.introduction.progress", {
        current: this.currentStep + 1,
        total: INTRODUCTION_STEPS.length
      }),
      cls: "file-diff-sbs-introduction-progress"
    });
    if (this.currentStep > 0) {
      const previousButton = actions.createEl("button", { text: this.translate("modal.introduction.previous") });
      previousButton.addEventListener("click", () => {
        this.currentStep -= 1;
        this.renderStep();
      });
    }
    const isFinalStep = this.currentStep === INTRODUCTION_STEPS.length - 1;
    const continueLabelKey = isFinalStep
      ? "modal.introduction.finish"
      : this.currentStep === 0 ? "modal.introduction.startAction" : "modal.introduction.next";
    const continueButton = actions.createEl("button", {
      text: this.translate(continueLabelKey),
      cls: "mod-cta"
    });
    continueButton.addEventListener("click", () => {
      if (isFinalStep) {
        this.close();
        return;
      }
      this.currentStep += 1;
      this.renderStep();
    });
  }
  /** Renders the page-specific content for an introduction step. */
  private renderStepContent(stepId: IntroductionStep["id"], parent: HTMLElement): void {
    if (stepId === "welcome") {
      this.renderWelcomeContent(parent);
      return;
    }
    if (stepId === "start") {
      this.renderStartContent(parent);
      return;
    }
    if (stepId === "selection") {
      this.renderFileSelectionContent(parent);
      return;
    }
    if (stepId === "tips") {
      this.renderTipsContent(parent);
      return;
    }
    this.renderThankYouContent(parent);
  }
  /** Shows the teaser and cards for feedback, bug reports, and documentation. */
  private renderWelcomeContent(parent: HTMLElement): void {
    this.appendImage(parent, "teaser.png", "modal.introduction.welcome.teaserAlt").addClass("file-diff-sbs-introduction-teaser");
    const cards = parent.createDiv({ cls: "file-diff-sbs-introduction-cards" });
    const feedback = this.appendIntroductionSection(
      cards,
      "modal.introduction.welcome.feedback.title",
      "modal.introduction.welcome.feedback.description"
    );
    const feedbackLinks = feedback.createDiv({ cls: "file-diff-sbs-introduction-links" });
    this.appendExternalLink(feedbackLinks, "settings.about.star", GITHUB_REPOSITORY_URL);
    this.appendExternalLink(feedbackLinks, "settings.about.feedback", GITHUB_FEEDBACK_URL);
    const bugReport = this.appendIntroductionSection(
      cards,
      "modal.introduction.welcome.reportBug.title",
      "modal.introduction.welcome.reportBug.description"
    );
    const bugReportLinks = bugReport.createDiv({ cls: "file-diff-sbs-introduction-links" });
    this.appendExternalLink(bugReportLinks, "modal.introduction.welcome.reportBug.link", GITHUB_FEEDBACK_URL);
    const documentation = this.appendIntroductionSection(
      cards,
      "modal.introduction.welcome.documentation.title",
      "modal.introduction.welcome.documentation.description"
    );
    const documentationLinks = documentation.createDiv({ cls: "file-diff-sbs-introduction-links" });
    this.appendExternalLink(documentationLinks, "modal.introduction.welcome.documentation.link", DOCUMENTATION_URL);
  }
  /** Describes both file-menu entry points for starting a comparison. */
  private renderStartContent(parent: HTMLElement): void {
    const workflows = parent.createDiv({ cls: "file-diff-sbs-introduction-workflows" });
    this.appendWorkflow(
      workflows,
      "modal.introduction.start.single.title",
      "modal.introduction.start.single.description",
      "file-menu.webp",
      "modal.introduction.start.single.imageAlt"
    );
    this.appendWorkflow(
      workflows,
      "modal.introduction.start.multiple.title",
      "modal.introduction.start.multiple.description",
      "compare-two-files-menu.png",
      "modal.introduction.start.multiple.imageAlt"
    );
  }
  /** Shows the right-file picker, drag-and-drop, and the direct tab comparison. */
  private renderFileSelectionContent(parent: HTMLElement): void {
    this.appendImage(parent, "file-selection.png", "modal.introduction.selection.imageAlt");
    const hints = parent.createDiv({ cls: "file-diff-sbs-introduction-hints" });
    this.appendIntroductionSection(hints, "modal.introduction.selection.drop.title", "modal.introduction.selection.drop.description", {
      target: this.translate("view.selection.dropFiles")
    });
    this.appendIntroductionSection(hints, "menu.compareWithActiveFile", "modal.introduction.selection.activeTab.description");
  }
  /** Lists the most useful navigation and review shortcuts. */
  private renderTipsContent(parent: HTMLElement): void {
    const keyboard = this.appendTip(parent, "modal.introduction.tips.keyboard.title", "modal.introduction.tips.keyboard.description");
    this.appendImage(keyboard, "keyboard-shortcuts.webp", "modal.introduction.tips.keyboard.imageAlt");
    const groups = this.appendTip(parent, "modal.introduction.tips.groups.title", "modal.introduction.tips.groups.description");
    this.appendImage(groups, "grouped-changes.png", "modal.introduction.tips.groups.imageAlt");
  }
  /** Adds the closing note, support links, and optional agent setup. */
  private renderThankYouContent(parent: HTMLElement): void {
    const note = parent.createEl("p", { text: this.translate("modal.introduction.thanks.websitePrefix") });
    note.appendText(" ");
    this.appendExternalLink(note, "modal.introduction.thanks.websiteLink", AUTHOR_WEBSITE_URL);
    note.appendText(".");
    const feedback = parent.createEl("p", { text: this.translate("modal.introduction.thanks.feedbackPrefix") });
    feedback.appendText(" ");
    this.appendExternalLink(feedback, "modal.introduction.thanks.feedbackLink", GITHUB_FEEDBACK_URL);
    feedback.appendText(".");
    const support = parent.createEl("p");
    this.appendExternalLink(support, "settings.about.kofi", KO_FI_URL);
    const agentSetup = this.appendIntroductionSection(parent, "agent.setup.title", "agent.setup.description");
    agentSetup.addClass("file-diff-sbs-introduction-agent");
    const setupButton = agentSetup.createEl("button", { text: this.translate("agent.setup.openAction") });
    setupButton.addEventListener("click", this.showAgentInstructions);
  }
  /** Adds one illustrated comparison-start workflow. */
  private appendWorkflow(parent: HTMLElement, titleKey: string, descriptionKey: string, assetName: IntroductionAssetName, imageAltKey: string): void {
    const workflow = parent.createEl("article", { cls: "file-diff-sbs-introduction-workflow" });
    const text = workflow.createDiv();
    text.createEl("h4", { text: this.translate(titleKey) });
    text.createEl("p", { text: this.translate(descriptionKey) });
    this.appendImage(workflow, assetName, imageAltKey);
  }
  /** Adds an image from the plugin's bundled assets. */
  private appendImage(parent: HTMLElement, assetName: IntroductionAssetName, altKey: string): HTMLImageElement {
    return parent.createEl("img", {
      cls: "file-diff-sbs-introduction-image",
      attr: {
        src: getIntroductionAssetUrl(assetName),
        alt: this.translate(altKey)
      }
    });
  }
  /** Adds a titled introduction section and returns it for supplementary links or images. */
  private appendIntroductionSection(parent: HTMLElement, titleKey: string, descriptionKey: string, variables?: Parameters<Translator>[1]): HTMLElement {
    const section = parent.createEl("section", { cls: "file-diff-sbs-introduction-section" });
    section.createEl("h4", { text: this.translate(titleKey) });
    section.createEl("p", { text: this.translate(descriptionKey, variables) });
    return section;
  }
  /** Adds a titled tip section to the tips page. */
  private appendTip(parent: HTMLElement, titleKey: string, descriptionKey: string): HTMLElement {
    const tip = this.appendIntroductionSection(parent, titleKey, descriptionKey);
    tip.addClass("file-diff-sbs-introduction-tip");
    return tip;
  }
  /** Adds an external link that opens in the default browser. */
  private appendExternalLink(parent: HTMLElement, labelKey: string, href: string): void {
    parent.createEl("a", {
      text: this.translate(labelKey),
      href,
      attr: {
        target: "_blank",
        rel: "noopener"
      }
    });
  }
  /** Clears dialog content after the introduction is dismissed. */
  override onClose(): void {
    this.modalEl.removeClass("file-diff-sbs-introduction-modal");
    this.contentEl.empty();
  }
}

/** Confirms moving an identical vault file to the system trash. */
export class DeleteIdenticalFileModal extends Modal {
  private readonly file: TFile;
  private readonly onConfirm: () => Promise<void>;
  private readonly translate: Translator;

  /** Creates a confirmation modal for the selected file. */
  constructor(app: App, file: TFile, onConfirm: () => Promise<void>, translate: Translator) {
    super(app);
    this.file = file;
    this.onConfirm = onConfirm;
    this.translate = translate;
  }
  /** Renders the warning and the confirm/cancel actions. */
  override onOpen(): void {
    this.titleEl.setText(this.translate("modal.deleteIdentical.title"));
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteIdentical.confirm", { path: this.file.path })
    });
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteIdentical.note"),
      cls: "file-diff-sbs-delete-note"
    });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-delete-actions" });
    const deleteButton = actions.createEl("button", {
      text: this.translate("modal.deleteIdentical.trash"),
      cls: "mod-warning"
    });
    deleteButton.addEventListener("click", () => {
      this.close();
      void this.onConfirm();
    });
    const cancelButton = actions.createEl("button", { text: this.translate("modal.cancel") });
    cancelButton.addEventListener("click", () => { this.close(); });
  }
  /** Clears modal content when it closes. */
  override onClose(): void {
    this.contentEl.empty();
  }
}
/** Confirms moving a processed change-copy file to the system trash. */
export class DeleteChangeCopyModal extends Modal {
  private readonly file: TFile;
  private readonly onConfirm: () => Promise<void>;
  private readonly translate: Translator;

  /** Creates a confirmation modal for a processed change copy. */
  constructor(app: App, file: TFile, onConfirm: () => Promise<void>, translate: Translator) {
    super(app);
    this.file = file;
    this.onConfirm = onConfirm;
    this.translate = translate;
  }
  /** Renders the warning and the confirm/cancel actions. */
  override onOpen(): void {
    this.titleEl.setText(this.translate("modal.deleteChangeCopy.title"));
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteChangeCopy.confirm", { path: this.file.path })
    });
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteChangeCopy.note"),
      cls: "file-diff-sbs-delete-note"
    });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-delete-actions" });
    const deleteButton = actions.createEl("button", {
      text: this.translate("modal.deleteChangeCopy.trash"),
      cls: "mod-warning"
    });
    deleteButton.addEventListener("click", () => {
      this.close();
      void this.onConfirm();
    });
    const cancelButton = actions.createEl("button", { text: this.translate("modal.cancel") });
    cancelButton.addEventListener("click", () => { this.close(); });
  }
  /** Clears modal content when it closes. */
  override onClose(): void {
    this.contentEl.empty();
  }
}
export interface FilePickerModalOptions {
  recentFiles?: TFile[];
  recentLabel?: string;
  allFilesLabel?: string;
}
/** Selects a text file from the vault for comparison. */
export class FilePickerModal extends SuggestModal<TFile> {
  private readonly files: TFile[];
  private readonly onChoose: (file: TFile | null) => void;
  private readonly locale: string;
  private readonly recentFiles: TFile[];
  private readonly recentFilePaths: Set<string>;
  private readonly recentLabel: string;
  private readonly allFilesLabel: string;
  private recentHeadingInserted = false;
  private allFilesHeadingInserted = false;
  private finished: boolean;

  /** Configures optional recent-file group labels for the picker. */
  constructor(
    app: App,
    files: TFile[],
    onChoose: (file: TFile | null) => void,
    locale = "de",
    options: FilePickerModalOptions = {},
  ) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.locale = locale;
    this.recentFiles = options.recentFiles ?? [];
    this.recentFilePaths = new Set(this.recentFiles.map((file) => file.path));
    this.recentLabel = options.recentLabel ?? "";
    this.allFilesLabel = options.allFilesLabel ?? "";
    this.finished = false;
  }

  /** Filters files by name or path and sorts them deterministically. */
  getSuggestions(query: string): TFile[] {
    const search = query.trim().toLowerCase();
    const matches = this.files
      .filter((file) => !search || file.path.toLowerCase().includes(search))
      .sort((a, b) => a.path.localeCompare(b.path, this.locale));
    this.recentHeadingInserted = false;
    this.allFilesHeadingInserted = false;
    return orderRecentFiles(matches, this.recentFiles.map((file) => file.path));
  }
  /** Displays both the filename and its vault-relative path. */
  renderSuggestion(file: TFile, element: HTMLElement): void {
    const isRecent = this.recentFilePaths.has(file.path);
    if (isRecent && !this.recentHeadingInserted && this.recentLabel) {
      this.insertGroupHeading(element, this.recentLabel);
      this.recentHeadingInserted = true;
    } else if (!isRecent && !this.allFilesHeadingInserted && this.allFilesLabel) {
      this.insertGroupHeading(element, this.allFilesLabel);
      this.allFilesHeadingInserted = true;
    }
    element.toggleClass("file-diff-sbs-picker-recent-item", isRecent);
    element.createDiv({ text: file.name });
    element.createEl("small", { text: file.path, cls: "file-diff-sbs-picker-path" });
  }
  /** Inserts an accessible visual separator before a picker group. */
  private insertGroupHeading(element: HTMLElement, label: string): void {
    const heading = this.resultContainerEl.createDiv({
      text: label,
      cls: "file-diff-sbs-picker-group-heading"
    });
    heading.setAttribute("role", "heading");
    heading.setAttribute("aria-level", "3");
    element.before(heading);
  }
  /** Marks acceptance before SuggestModal closes, so onClose cannot resolve it as cancellation. */
  override selectSuggestion(file: TFile, event: MouseEvent | KeyboardEvent): void {
    this.finished = true;
    super.selectSuggestion(file, event);
  }
  /** Resolves the picker with the selected file. */
  onChooseSuggestion(file: TFile): void {
    this.finished = true;
    this.onChoose(file);
  }
  /** Resolves cancellation when the picker is closed without a selection. */
  override onClose(): void {
    super.onClose();
    if (!this.finished) {
      this.onChoose(null);
    }
  }
}
/** Confirms whether pending changes should be saved before closing. */
export class UnsavedChangesModal extends Modal {
  private resolveChoice: ((choice: UnsavedChoice) => void) | null;
  private finished: boolean;
  private readonly translate: Translator;
  private readonly question: string;
  private readonly allowCancel: boolean;
  private readonly discardLabel: string;

  /** Creates a save-or-discard prompt for pending comparison changes. */
  constructor(app: App, translate: Translator, question = translate("modal.unsaved.question"), options: { allowCancel?: boolean; discardLabel?: string } = {}) {
    super(app);
    this.resolveChoice = null;
    this.finished = false;
    this.translate = translate;
    this.question = question;
    this.allowCancel = options.allowCancel ?? false;
    this.discardLabel = options.discardLabel ?? translate("modal.unsaved.discard");
  }
  /** Opens the prompt and resolves with the selected close action. */
  waitForChoice(): Promise<UnsavedChoice> {
    return new Promise<UnsavedChoice>((resolve) => {
      this.resolveChoice = resolve;
      this.open();
    });
  }
  /** Renders save/discard actions and an optional way to keep editing. */
  override onOpen(): void {
    this.titleEl.setText(this.translate("modal.unsaved.title"));
    this.contentEl.createEl("p", { text: this.question });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-unsaved-actions" });
    if (this.allowCancel) {
      const cancelButton = actions.createEl("button", { text: this.translate("modal.cancel") });
      cancelButton.addEventListener("click", () => { this.choose("cancel"); });
    }
    const saveButton = actions.createEl("button", { text: this.translate("modal.unsaved.save"), cls: "mod-cta" });
    saveButton.addEventListener("click", () => { this.choose("save"); });
    const discardButton = actions.createEl("button", { text: this.discardLabel });
    discardButton.addEventListener("click", () => { this.choose("discard"); });
  }
  /** Resolves the prompt and closes it after a button choice. */
  choose(choice: UnsavedChoice): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.resolveChoice?.(choice);
    this.resolveChoice = null;
    this.close();
  }
  /** Cancellable prompts preserve the editor when dismissed; existing close prompts keep their default. */
  override onClose(): void {
    if (!this.finished) {
      this.finished = true;
      this.resolveChoice?.(this.allowCancel ? "cancel" : "discard");
      this.resolveChoice = null;
    }
    this.contentEl.empty();
  }
}
