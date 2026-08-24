import { Modal, SuggestModal } from "obsidian";
import type { App, TFile } from "obsidian";
import type { Translator } from "./i18n";
import { orderRecentFiles } from "./recent-files";

export type UnsavedChoice = "save" | "discard";

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

  /** Creates a save-or-discard prompt for pending comparison changes. */
  constructor(app: App, translate: Translator, question = translate("modal.unsaved.question")) {
    super(app);
    this.resolveChoice = null;
    this.finished = false;
    this.translate = translate;
    this.question = question;
  }
  /** Opens the prompt and resolves with the selected close action. */
  waitForChoice(): Promise<UnsavedChoice> {
    return new Promise<UnsavedChoice>((resolve) => {
      this.resolveChoice = resolve;
      this.open();
    });
  }
  /** Renders the save and discard actions. */
  override onOpen(): void {
    this.titleEl.setText(this.translate("modal.unsaved.title"));
    this.contentEl.createEl("p", { text: this.question });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-unsaved-actions" });
    const saveButton = actions.createEl("button", { text: this.translate("modal.unsaved.save"), cls: "mod-cta" });
    saveButton.addEventListener("click", () => { this.choose("save"); });
    const discardButton = actions.createEl("button", { text: this.translate("modal.unsaved.discard") });
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
  /** Defaults to discarding when the prompt is closed with Escape. */
  override onClose(): void {
    if (!this.finished) {
      this.finished = true;
      this.resolveChoice?.("discard");
      this.resolveChoice = null;
    }
    this.contentEl.empty();
  }
}
