import { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, SuggestModal, TFile, moment } from "obsidian";
import type { App, Command, TAbstractFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { createTranslator, resolveLanguage } from "./i18n";
import { alignSequences, applyAlignedRowChange, convertLineEndings, getDiffRowKey, getIgnoredDiffRow, getLineSyncPlan, indexDiffRows, joinLines, serializeEditableLines, splitLines, type DiffDirection, type IndexedDiffRow } from "./diff-core";
import type { Language, LanguagePreference, Translator } from "./i18n";

type PaneMode = "compare" | "proposal" | "accept";
type EditableSide = "left" | "right";
type EditableRowType = "equal" | "added" | "removed" | "changed";
type UnsavedChoice = "save" | "discard";

/** Checks whether a persisted or UI value is a supported language preference. */
function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "auto" || value === "de" || value === "en";
}

interface PluginSettings {
  showRibbonIcon: boolean;
  changeCopySuffix: string;
  language: LanguagePreference;
}

interface DiffViewState {
  leftPath: string | null;
  rightPath: string | null;
  editRight: boolean;
  mode: PaneMode;
}

interface ScrollPosition {
  top: number;
  left: number;
  editorTop: number;
  editorLeft: number;
}

interface EditInputSnapshot {
  editor: HTMLElement;
  rightCount: number;
  preferredIndex: number;
  selectionRemovesLines: boolean;
}

interface RightEditorState {
  editor: HTMLElement;
  initialValue: string;
  observer: MutationObserver;
}

interface PendingFile {
  file: TFile | null;
  content: string;
}

const VIEW_TYPE = "side-by-side-diff-view";
const ICON_ID = "square-split-horizontal";
const DEFAULT_SETTINGS: PluginSettings = {
  showRibbonIcon: true,
  changeCopySuffix: "_changes_",
  language: "auto"
};
const BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  "7z",
  "avif",
  "bmp",
  "class",
  "doc",
  "docx",
  "exe",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "otf",
  "pdf",
  "png",
  "rar",
  "tar",
  "ttf",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip"
]);
/** Returns whether a vault file can be compared as text. */
function isTextFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && !BINARY_EXTENSIONS.has(file.extension.toLowerCase());
}
/** Formats a timestamp for deterministic change-copy names. */
function formatCopyTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear().toString()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
/** Replaces path-invalid suffix characters with safe underscores. */
function sanitizeCopySuffix(value: string): string {
  return (value.length > 0 ? value : "_changes_").replace(/[\\/:*?"<>|]/g, "_");
}
/** Splits a line into whitespace and non-whitespace tokens for inline diffing. */
function tokenizeLine(line: string): string[] {
  return line.match(/\s+|[^\s]+/g) || [];
}
/** Renders token-level differences without injecting HTML strings. */
function appendInlineDiff(parent: HTMLElement, left: string | null, right: string | null, side: EditableSide): void {
  if (left === null || right === null) {
    parent.textContent = side === "left" ? left ?? " " : right ?? " ";
    return;
  }
  const tokens = alignSequences(tokenizeLine(left), tokenizeLine(right), (a, b) => a === b);
  for (const token of tokens) {
    const value = side === "left" ? token.left : token.right;
    if (value === null) {
      continue;
    }
    const span = parent.createSpan({ text: value });
    if (!token.equal) {
      span.addClass(`file-diff-sbs-inline-${side}`);
    }
  }
}
class DeleteIdenticalFileModal extends Modal {
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
class FilePickerModal extends SuggestModal<TFile> {
  private readonly files: TFile[];
  private readonly onChoose: (file: TFile | null) => void;
  private readonly locale: string;
  private finished: boolean;

  /** Creates a picker with the files that are valid for comparison. */
  constructor(app: App, files: TFile[], onChoose: (file: TFile | null) => void, locale = "de") {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.locale = locale;
    this.finished = false;
  }
  /** Filters files by name or path and sorts them deterministically. */
  getSuggestions(query: string): TFile[] {
    const search = query.trim().toLowerCase();
    return this.files.filter((file) => !search || file.path.toLowerCase().includes(search)).sort((a, b) => a.path.localeCompare(b.path, this.locale));
  }
  /** Displays both the filename and its vault-relative path. */
  renderSuggestion(file: TFile, element: HTMLElement): void {
    element.createDiv({ text: file.name });
    element.createEl("small", { text: file.path, cls: "file-diff-sbs-picker-path" });
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
class UnsavedChangesModal extends Modal {
  private resolveChoice: ((choice: UnsavedChoice) => void) | null;
  private finished: boolean;
  private readonly translate: Translator;

  /** Creates a save-or-discard prompt for pending comparison changes. */
  constructor(app: App, translate: Translator) {
    super(app);
    this.resolveChoice = null;
    this.finished = false;
    this.translate = translate;
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
    this.contentEl.createEl("p", { text: this.translate("modal.unsaved.question") });
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
class SideBySideDiffView extends ItemView {
  private readonly plugin: FileDiffSideBySidePlugin;
  state: DiffViewState = { leftPath: null, rightPath: null, editRight: false, mode: "compare" };
  private renderToken = 0;
  private readonly dismissedRows = new Set<string>();
  private readonly pendingFileContents = new Map<string, string>();
  private rightEditorState: RightEditorState | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private editInputSnapshot: EditInputSnapshot | null = null;
  private editSyncFrame: number | null = null;

  /** Initializes the view and subscribes to relevant vault changes. */
  constructor(leaf: WorkspaceLeaf, plugin: FileDiffSideBySidePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", (event) => { this.handleGlobalKeydown(event); }, { capture: true });
    this.registerDomEvent(this.contentEl, "beforeinput", (event) => { this.handleBeforeInput(event); });
    this.registerDomEvent(this.contentEl, "input", (event) => { this.handleInput(event as InputEvent); });
    this.registerDomEvent(this.contentEl, "keyup", (event) => { this.handleEditKeyup(event); });
    this.registerEvent(this.app.vault.on("modify", (file) => { this.refreshForPath(file.path); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.handleRename(file, oldPath); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { this.refreshForPath(file.path); }));
  }
  /** Translates one UI key using the plugin's current language. */
  translate(key: string, variables: Record<string, string | number> = {}): string {
    return this.plugin.translate(key, variables);
  }
  /** Returns the registered Obsidian view type. */
  override getViewType(): string {
    return VIEW_TYPE;
  }
  /** Returns a useful tab title for the current comparison. */
  override getDisplayText(): string {
    const labels = this.getPaneLabels();
    const getFileName = (path: string): string => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? file.name : path.split("/").pop() ?? this.translate("fileFallback");
    };
    if (this.state.leftPath !== null && this.state.rightPath !== null) {
      return `${labels.left} \xB7 ${getFileName(this.state.leftPath)} \u2194 ${labels.right} \xB7 ${getFileName(this.state.rightPath)}`;
    }
    return this.state.leftPath !== null ? `${labels.left} \xB7 ${getFileName(this.state.leftPath)}` : "Side-by-Side Diff";
  }
  /** Returns the serializable paths needed to restore the view. */
  override getState(): Record<string, unknown> {
    return {
      leftPath: this.state.leftPath,
      rightPath: this.state.rightPath,
      editRight: this.state.editRight,
      mode: this.state.mode
    };
  }
  /** Stores new paths and redraws the comparison. */
  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const nextState = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
    const mode = nextState.mode;
    this.state = {
      leftPath: typeof nextState.leftPath === "string" ? nextState.leftPath : null,
      rightPath: typeof nextState.rightPath === "string" ? nextState.rightPath : null,
      editRight: nextState.editRight === true,
      mode: mode === "proposal" || mode === "accept" ? mode : "compare"
    };
    await this.renderDiff();
  }
  /** Renders the initial comparison when the leaf opens. */
  override async onOpen(): Promise<void> {
    await this.renderDiff();
  }
  /** Clears the view when its leaf closes. */
  override async onClose(): Promise<void> {
    if (this.state.editRight && this.rightEditorState?.editor) {
      this.synchronizeEditablePanes(this.rightEditorState.editor);
    }
    if (this.hasUnsavedChanges()) {
      const choice = await new UnsavedChangesModal(this.app, this.translate.bind(this)).waitForChoice();
      if (choice === "save") {
        await this.saveChangesBeforeClose();
      }
    }
    this.disposeRightEditorObserver();
    this.contentEl.empty();
  }
  /** Rerenders only when a compared path changed. */
  refreshForPath(path: string): void {
    if (path === this.state.leftPath || path === this.state.rightPath) {
      void this.renderDiff(this.getScrollPosition());
    }
  }
  /** Handles view shortcuts before Obsidian's global key handlers can consume them. */
  handleGlobalKeydown(event: KeyboardEvent): void {
    if (!(event.target instanceof Node) || !this.contentEl.contains(event.target)) {
      return;
    }
    this.handleKeydown(event);
  }
  /** Captures the edit position before a browser input changes the right-side line structure. */
  handleBeforeInput(event: InputEvent): void {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    const selection = this.contentEl.ownerDocument.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const startLine = this.getEditableBoundaryLine(editor, range.startContainer, range.startOffset, "start");
    const endLine = this.getEditableBoundaryLine(editor, range.endContainer, range.endOffset, "end");
    if (!startLine || !endLine) {
      return;
    }
    const rightLines = this.getEditableLines(editor);
    const startIndex = rightLines.indexOf(startLine);
    if (startIndex < 0) {
      return;
    }
    const endIndex = rightLines.indexOf(endLine);
    const code = startLine.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
    const startOffset = code && code.contains(range.startContainer) ? this.getEditableCodeOffset(code, range.startContainer, range.startOffset) : 0;
    const isDeletion = event.inputType.startsWith("delete");
    let preferredIndex = startIndex;
    if (isDeletion) {
      preferredIndex = !range.collapsed || startLine !== endLine ? startIndex : event.inputType === "deleteContentBackward" && startOffset === 0 ? startIndex : startIndex + 1;
    } else if (startOffset > 0) {
      preferredIndex = startIndex + 1;
    }
    this.editInputSnapshot = {
      editor,
      rightCount: rightLines.length,
      preferredIndex,
      selectionRemovesLines: isDeletion && !range.collapsed && endIndex > startIndex
    };
  }
  /** Inserts compensating blank lines after the browser has changed the right-side line count. */
  handleInput(event: InputEvent): void {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    if (!editor) {
      return;
    }
    const snapshot = this.editInputSnapshot?.editor === editor ? this.editInputSnapshot : null;
    this.editInputSnapshot = null;
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    this.markDeletedSelectionGap(editor, snapshot);
    const editedLine = this.getEditableLine(event.target);
    const editedCode = editedLine?.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
    if (editedLine !== null && editedCode !== null && editedCode !== undefined && editedCode.textContent.length > 0) {
      editedLine.dataset.rightPresent = "true";
    }
    const leftCount = this.getEditableLines(leftPane).length;
    const rightCount = this.getEditableLines(editor).length;
    if (leftCount !== rightCount) {
      this.synchronizeEditablePanes(editor, snapshot?.preferredIndex);
    } else {
      this.updateEditableLineNumbers(editor);
      this.synchronizeEditableLineHeights(editor);
    }
    this.updateSaveButtonState();
  }
  /** Schedules a post-edit alignment pass after the browser has finished changing the DOM. */
  scheduleEditablePaneSync(editor: HTMLElement): void {
    if (this.editSyncFrame !== null) {
      return;
    }
    const windowRef = this.contentEl.ownerDocument.defaultView;
    if (!windowRef) {
      return;
    }
    this.editSyncFrame = windowRef.requestAnimationFrame(() => {
      this.editSyncFrame = null;
      if (!this.state.editRight || !editor.isConnected) {
        return;
      }
      const snapshot = this.editInputSnapshot?.editor === editor ? this.editInputSnapshot : null;
      this.editInputSnapshot = null;
      this.synchronizeEditablePanes(editor, snapshot?.preferredIndex);
    });
  }
  /** Schedules a final alignment pass after keyboard-driven editing has completed. */
  handleEditKeyup(event: KeyboardEvent): void {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    if (editor) {
      this.scheduleEditablePaneSync(editor);
    }
  }
  /** Disconnects the observer used to keep the two editable panes aligned. */
  disposeRightEditorObserver(): void {
    this.rightEditorState?.observer.disconnect();
    this.rightEditorState = null;
    this.saveButton = null;
    if (this.editSyncFrame !== null) {
      this.contentEl.ownerDocument.defaultView?.cancelAnimationFrame(this.editSyncFrame);
      this.editSyncFrame = null;
    }
    this.editInputSnapshot = null;
  }
  /** Saves pending diff changes or the editable right side when the user presses Ctrl/Cmd+S. */
  handleKeydown(event: KeyboardEvent): void {
    if (this.state.editRight && event.key === "Enter" && this.insertEditableLineBreak()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.state.editRight && (event.key === "Backspace" || event.key === "Delete")) {
      const editor = this.getEditableEditor(event.target);
      if (editor) {
        this.scheduleEditablePaneSync(editor);
      }
    }
    if (!event.ctrlKey && !event.metaKey || event.key.toLowerCase() !== "s") {
      return;
    }
    const canSave = this.state.editRight ? this.hasRightEditorChanges() : this.hasPendingChanges();
    if (!canSave) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void (this.state.editRight ? this.saveRightEdits() : this.savePendingChanges());
  }
  /** Keeps the view in sync when a compared file is renamed. */
  handleRename(file: TAbstractFile, oldPath: string): void {
    let changed = false;
    if (this.state.leftPath === oldPath) {
      this.state.leftPath = file.path;
      changed = true;
    }
    if (this.state.rightPath === oldPath) {
      this.state.rightPath = file.path;
      changed = true;
    }
    if (changed) {
      void this.renderDiff(this.getScrollPosition());
    }
  }
  /** Loads the active comparison or the initial left-hand file selection. */
  async renderDiff(scrollPosition: ScrollPosition | null = null): Promise<void> {
    this.disposeRightEditorObserver();
    const token = ++this.renderToken;
    this.contentEl.empty();
    this.contentEl.addClass("file-diff-sbs-view");
    const leftPath = this.state.leftPath;
    if (leftPath === null) {
      this.renderMessage(this.translate("view.leftUnavailable"));
      return;
    }
    const leftFile = this.app.vault.getAbstractFileByPath(leftPath);
    if (!(leftFile instanceof TFile)) {
      this.renderMessage(this.translate("view.leftUnavailable"));
      return;
    }
    try {
      const storedLeftContent = await this.app.vault.cachedRead(leftFile);
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      if (token !== this.renderToken) {
        return;
      }
      const rightPath = this.state.rightPath;
      if (rightPath === null) {
        this.buildSelectionLayout(leftFile, splitLines(leftContent));
        this.restoreScrollPosition(scrollPosition);
        return;
      }
      const rightFile = this.app.vault.getAbstractFileByPath(rightPath);
      if (!(rightFile instanceof TFile)) {
        this.renderMessage(this.translate("view.rightUnavailable"));
        return;
      }
      const storedRightContent = await this.app.vault.cachedRead(rightFile);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      if (token !== this.renderToken) {
        return;
      }
      this.buildLayout(leftFile, rightFile, splitLines(leftContent), splitLines(rightContent));
      this.restoreScrollPosition(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Dateien nicht lesen.", error);
      this.renderMessage(this.translate("view.readFailed"));
    }
  }
  /** Captures the current diff scroll position before a rerender. */
  getScrollPosition(): ScrollPosition | null {
    const scroll = this.contentEl.querySelector(".file-diff-sbs-scroll, .file-diff-sbs-selection-scroll");
    const editor = this.contentEl.querySelector(".file-diff-sbs-document-editor");
    return scroll ? {
      top: scroll.scrollTop,
      left: scroll.scrollLeft,
      editorTop: editor?.scrollTop ?? 0,
      editorLeft: editor?.scrollLeft ?? 0
    } : null;
  }
  /** Restores a previously captured scroll position after the diff is rebuilt. */
  restoreScrollPosition(position: ScrollPosition | null): void {
    if (!position) {
      return;
    }
    const scroll = this.contentEl.querySelector(".file-diff-sbs-scroll, .file-diff-sbs-selection-scroll");
    if (scroll) {
      scroll.scrollTop = position.top;
      scroll.scrollLeft = position.left;
    }
    const editor = this.contentEl.querySelector(".file-diff-sbs-document-editor");
    if (editor) {
      editor.scrollTop = position.editorTop;
      editor.scrollLeft = position.editorLeft;
    }
  }
  /** Opens a file picker for the right-hand pane. */
  selectRightFile(leftFile: TFile): void {
    const files = this.app.vault.getFiles().filter((file) => isTextFile(file) && file.path !== leftFile.path).sort((a, b) => a.path.localeCompare(b.path, this.plugin.language));
    const modal = new FilePickerModal(this.app, files, (rightFile) => {
      if (rightFile) {
        void this.applyRightFile(leftFile, rightFile);
      }
    }, this.plugin.language);
    modal.setPlaceholder(this.translate("picker.rightFile"));
    modal.open();
  }
  /** Applies the selected right file and redraws the comparison view. */
  async applyRightFile(leftFile: TFile, rightFile: TFile): Promise<void> {
    const nextState: DiffViewState = { leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" };
    this.state = nextState;
    this.pendingFileContents.clear();
    this.dismissedRows.clear();
    try {
      await this.renderDiff();
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Auswahl nicht anwenden.", error);
      new Notice(this.translate("notice.selectedFileLoadFailed"));
    }
  }
  /** Enables editing for the current right-hand file without changing either file. */
  async enableRightEditMode(): Promise<void> {
    if (this.state.rightPath === null || this.state.editRight) {
      return;
    }
    this.dismissedRows.clear();
    await this.setState({ ...this.state, editRight: true }, { history: false });
  }
  /** Leaves editing without discarding unsaved changes in the right-hand rows. */
  async disableRightEditMode(): Promise<void> {
    if (!this.state.editRight) {
      return;
    }
    const hasUnsavedChanges = this.rightEditorState !== null && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    if (hasUnsavedChanges) {
      new Notice(this.translate("notice.saveFirst"));
      return;
    }
    await this.setState({ ...this.state, editRight: false }, { history: false });
  }
  /** Returns whether editing or diff actions have produced unsaved changes. */
  hasUnsavedChanges(): boolean {
    const editorChanged = this.state.editRight && this.rightEditorState !== null && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    return editorChanged || this.hasPendingChanges();
  }
  /** Writes all current changes without rebuilding the view during close. */
  async saveChangesBeforeClose(): Promise<void> {
    try {
      if (this.state.editRight && this.rightEditorState) {
        const rightPath = this.state.rightPath;
        if (rightPath === null) {
          new Notice(this.translate("view.rightUnavailable"));
          return;
        }
        const rightFile = this.app.vault.getAbstractFileByPath(rightPath);
        if (!(rightFile instanceof TFile)) {
          new Notice(this.translate("view.rightUnavailable"));
          return;
        }
        const currentContent = await this.app.vault.read(rightFile);
        const editedContent = convertLineEndings(this.serializeRightEditor(this.rightEditorState.editor), currentContent);
        await this.app.vault.process(rightFile, () => editedContent);
        this.pendingFileContents.delete(rightFile.path);
      }
      if (this.hasPendingChanges() && !await this.writePendingChanges()) {
        new Notice(this.translate("notice.pendingFileUnavailable"));
      }
    } catch (error) {
      console.error("Side-by-Side Diff konnte \xC4nderungen vor dem Schlie\xDFen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Saves all edited right-side rows back to the right-hand vault file. */
  async saveRightEdits(): Promise<void> {
    if (!this.hasRightEditorChanges()) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
    const rightPath = this.state.rightPath;
    if (rightPath === null) {
      new Notice(this.translate("view.rightUnavailable"));
      return;
    }
    const rightFile = this.app.vault.getAbstractFileByPath(rightPath);
    if (!(rightFile instanceof TFile)) {
      new Notice(this.translate("view.rightUnavailable"));
      return;
    }
    try {
      const currentContent = await this.app.vault.read(rightFile);
      if (!this.rightEditorState) {
        return;
      }
      const editedContent = convertLineEndings(this.serializeRightEditor(this.rightEditorState.editor), currentContent);
      await this.app.vault.process(rightFile, () => editedContent);
      this.pendingFileContents.delete(rightFile.path);
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die rechten \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Inserts a real editable line at the current single-line selection. */
  insertEditableLineBreak(): boolean {
    const selection = this.contentEl.ownerDocument.getSelection();
    if (selection === null || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    const line = this.getEditableLine(range.startContainer);
    if (!line || line !== this.getEditableLine(range.endContainer)) {
      return false;
    }
    const code = line.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
    if (!code || !code.contains(range.startContainer) || !code.contains(range.endContainer)) {
      return false;
    }
    const text = code.textContent;
    const startOffset = this.getEditableCodeOffset(code, range.startContainer, range.startOffset);
    const endOffset = this.getEditableCodeOffset(code, range.endContainer, range.endOffset);
    const before = text.slice(0, startOffset);
    const after = text.slice(endOffset);
    line.dataset.rightPresent = "true";
    code.textContent = before;
    const newLine = line.cloneNode(false) as HTMLElement;
    newLine.dataset.rightPresent = "true";
    newLine.textContent = "";
    const lineNumber = line.ownerDocument.createElement("span");
    lineNumber.className = "file-diff-sbs-line-number file-diff-sbs-edit-line-number";
    lineNumber.setAttribute("contenteditable", "false");
    const newCode = line.ownerDocument.createElement("span");
    newCode.className = "file-diff-sbs-edit-code";
    newCode.textContent = after;
    newLine.append(lineNumber, newCode);
    line.after(newLine);
    const editor = line.parentElement;
    if (editor) {
      const newLineIndex = this.getEditableLines(editor).indexOf(newLine);
      this.synchronizeEditablePanes(editor, newLineIndex);
    }
    this.setEditableCaret(newCode, 0);
    this.updateSaveButtonState();
    return true;
  }
  /** Finds the editable diff line containing a DOM selection boundary. */
  getEditableLine(node: Node | EventTarget | null): HTMLElement | null {
    const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    return element?.closest<HTMLElement>(".file-diff-sbs-edit-line") ?? null;
  }
  /** Finds the shared document editor for an input or keyboard event target. */
  getEditableEditor(node: Node | EventTarget | null): HTMLElement | null {
    const element = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    return element?.closest<HTMLElement>(".file-diff-sbs-document-editor") ?? null;
  }
  /** Resolves selections that start or end directly on the contenteditable container. */
  getEditableBoundaryLine(editor: HTMLElement, node: Node, offset: number, direction: "start" | "end"): HTMLElement | null {
    const line = this.getEditableLine(node);
    if (line) {
      return line;
    }
    if (node !== editor) {
      return null;
    }
    const lines = this.getEditableLines(editor);
    if (lines.length === 0) {
      return null;
    }
    const rawIndex = direction === "end" ? Math.max(0, offset - 1) : offset;
    return lines[Math.min(rawIndex, lines.length - 1)] ?? null;
  }
  /** Marks Chromium's retained empty line as a visual gap after multi-line deletion. */
  markDeletedSelectionGap(editor: HTMLElement, snapshot: EditInputSnapshot | null): void {
    if (snapshot?.selectionRemovesLines !== true) {
      return;
    }
    const lines = this.getEditableLines(editor);
    const line = lines[snapshot.preferredIndex] ?? null;
    const code = line?.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
    if (line === null || code === null || code === undefined || code.textContent.trim().length > 0) {
      return;
    }
    line.dataset.rightPresent = "false";
    line.classList.add("file-diff-sbs-edit-gap");
  }
  /** Returns the text offset of a DOM selection boundary inside an editable code span. */
  getEditableCodeOffset(code: HTMLElement, node: Node, offset: number): number {
    if (!code.contains(node)) {
      return 0;
    }
    const range = code.ownerDocument.createRange();
    range.selectNodeContents(code);
    range.setEnd(node, offset);
    return range.toString().length;
  }
  /** Returns the editable line elements belonging directly to a pane or editor. */
  getEditableLines(parent: HTMLElement): HTMLElement[] {
    return Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && (child.classList.contains("file-diff-sbs-cell") || child.classList.contains("file-diff-sbs-edit-line")));
  }
  /** Finds the read-only left pane belonging to an editable comparison grid. */
  getEditableLeftPane(editor: HTMLElement): HTMLElement | null {
    const grid = editor.closest<HTMLElement>(".file-diff-sbs-edit-grid");
    return grid?.querySelector<HTMLElement>(".file-diff-sbs-edit-pane:not(.file-diff-sbs-edit-right-pane)") ?? null;
  }
  /** Keeps both edit panes aligned by inserting blank lines at the changed position. */
  synchronizeEditablePanes(editor: HTMLElement, preferredIndex: number | null = null): void {
    this.normalizeEditableEditor(editor);
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    const leftLines = this.getEditableLines(leftPane);
    const rightLines = this.getEditableLines(editor);
    const syncPlan = getLineSyncPlan(leftLines.length, rightLines.length, preferredIndex);
    while (this.getEditableLines(leftPane).length < syncPlan.targetCount) {
      const currentLines = this.getEditableLines(leftPane);
      const reference = currentLines[syncPlan.insertionIndex] ?? null;
      const gap = this.createEditableLeftGap(leftPane);
      leftPane.insertBefore(gap, reference);
    }
    while (this.getEditableLines(editor).length < syncPlan.targetCount) {
      const currentLines = this.getEditableLines(editor);
      const reference = currentLines[syncPlan.insertionIndex] ?? null;
      const gap = this.createEditableRightGap(editor);
      editor.insertBefore(gap, reference);
    }
    this.updateEditableLineNumbers(editor);
    this.synchronizeEditableLineHeights(editor);
  }
  /** Matches paired line heights so wrapped content keeps following rows aligned. */
  synchronizeEditableLineHeights(editor: HTMLElement): void {
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    const leftLines = this.getEditableLines(leftPane);
    const rightLines = this.getEditableLines(editor);
    const lineCount = Math.min(leftLines.length, rightLines.length);
    for (let index = 0; index < lineCount; index += 1) {
      const leftLine = leftLines[index];
      const rightLine = rightLines[index];
      if (!leftLine || !rightLine) {
        continue;
      }
      leftLine.setCssProps({ "--file-diff-sbs-line-min-height": "" });
      rightLine.setCssProps({ "--file-diff-sbs-line-min-height": "" });
    }
    for (let index = 0; index < lineCount; index += 1) {
      const leftLine = leftLines[index];
      const rightLine = rightLines[index];
      if (!leftLine || !rightLine) {
        continue;
      }
      const height = Math.max(leftLine.getBoundingClientRect().height, rightLine.getBoundingClientRect().height);
      if (height > 0) {
        const heightValue = `${height.toString()}px`;
        leftLine.setCssProps({ "--file-diff-sbs-line-min-height": heightValue });
        rightLine.setCssProps({ "--file-diff-sbs-line-min-height": heightValue });
      }
    }
  }
  /** Converts browser-generated direct editor nodes into normal editable line elements. */
  normalizeEditableEditor(editor: HTMLElement): void {
    for (const node of Array.from(editor.childNodes)) {
      if (node instanceof HTMLElement && node.classList.contains("file-diff-sbs-edit-line")) {
        continue;
      }
      const text = node.textContent ?? "";
      const line = this.createEditableRightGap(editor);
      const code = line.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
      if (code) {
        code.textContent = text;
      }
      editor.insertBefore(line, node);
      editor.removeChild(node);
    }
  }
  /** Creates a blank read-only line that preserves left-side vertical alignment. */
  createEditableLeftGap(parent: HTMLElement): HTMLElement {
    const cell = parent.createDiv({ cls: "file-diff-sbs-cell file-diff-sbs-edit-gap" });
    cell.createSpan({ cls: "file-diff-sbs-line-number" });
    cell.createSpan({ cls: "file-diff-sbs-code", text: " " });
    return cell;
  }
  /** Creates a blank editable line that preserves right-side vertical alignment. */
  createEditableRightGap(parent: HTMLElement): HTMLElement {
    const line = this.buildEditableRightLine(parent, { left: "", right: "", equal: true, leftIndex: 0, rightIndex: 0, leftLineNumber: null, rightLineNumber: null });
    line.dataset.rightPresent = "false";
    line.classList.add("file-diff-sbs-edit-gap");
    return line;
  }
  /** Updates right-side line numbers after a manual line insertion. */
  updateEditableLineNumbers(editor: HTMLElement): void {
    let lineNumber = 0;
    for (const line of this.getEditableLines(editor)) {
      const numberElement = line.querySelector(".file-diff-sbs-edit-line-number");
      if (!numberElement) {
        continue;
      }
      if (line.dataset.rightPresent === "false") {
        numberElement.textContent = "";
        continue;
      }
      lineNumber += 1;
      numberElement.textContent = String(lineNumber);
    }
  }
  /** Places the caret at a character offset inside an editable code span. */
  setEditableCaret(code: HTMLElement, offset: number): void {
    const editor = code.closest<HTMLElement>(".file-diff-sbs-document-editor");
    editor?.focus();
    const document2 = code.ownerDocument;
    const selection = document2.getSelection();
    if (!selection) {
      return;
    }
    const range = document2.createRange();
    const textNode = code.firstChild;
    if (textNode) {
      range.setStart(textNode, Math.min(offset, textNode.textContent?.length ?? 0));
    } else {
      range.setStart(code, 0);
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  /** Returns the currently displayed content, including changes pending for a file. */
  getDisplayedContent(path: string, storedContent: string): string {
    return this.pendingFileContents.get(path) ?? storedContent;
  }
  /** Returns whether the comparison contains changes waiting to be saved. */
  hasPendingChanges(): boolean {
    return this.pendingFileContents.size > 0;
  }
  /** Resolves the vault files represented by pending comparison changes. */
  getPendingFiles(): PendingFile[] {
    return Array.from(this.pendingFileContents.entries()).map(([path, content]) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return { file: file instanceof TFile ? file : null, content };
    });
  }
  /** Writes pending comparison changes and clears them after all files succeed. */
  async writePendingChanges(): Promise<boolean> {
    const pendingFiles = this.getPendingFiles();
    if (pendingFiles.some(({ file }) => !(file instanceof TFile))) {
      return false;
    }
    for (const { file, content } of pendingFiles) {
      if (!(file instanceof TFile)) {
        return false;
      }
      await this.app.vault.process(file, () => content);
    }
    this.pendingFileContents.clear();
    return true;
  }
  /** Saves all changes staged through the comparison controls. */
  async savePendingChanges(): Promise<void> {
    if (!this.hasPendingChanges()) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
    try {
      if (!await this.writePendingChanges()) {
        new Notice(this.translate("notice.pendingFileUnavailable"));
        return;
      }
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte vorgemerkte \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Stages one changed aligned row for saving instead of modifying a file immediately. */
  async applyRowChange(rowIndex: number, direction: DiffDirection): Promise<void> {
    const scrollPosition = this.getScrollPosition();
    const leftPath = this.state.leftPath;
    const rightPath = this.state.rightPath;
    if (leftPath === null || rightPath === null) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    const leftFile = this.app.vault.getAbstractFileByPath(leftPath);
    const rightFile = this.app.vault.getAbstractFileByPath(rightPath);
    if (!(leftFile instanceof TFile) || !(rightFile instanceof TFile)) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    try {
      const [storedLeftContent, storedRightContent] = await Promise.all([
        this.app.vault.cachedRead(leftFile),
        this.app.vault.cachedRead(rightFile)
      ]);
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      const rows = indexDiffRows(
        alignSequences(splitLines(leftContent), splitLines(rightContent), (a, b) => a === b)
      );
      const row = rows[rowIndex];
      if (row === undefined || row.equal) {
        return;
      }
      const leftToRight = direction === "left-to-right";
      const { leftLines: nextLeftLines, rightLines: nextRightLines } = applyAlignedRowChange(
        splitLines(leftContent),
        splitLines(rightContent),
        row,
        direction
      );
      const targetFile = leftToRight ? rightFile : leftFile;
      const targetContent = leftToRight ? rightContent : leftContent;
      const targetLines = leftToRight ? nextRightLines : nextLeftLines;
      this.pendingFileContents.set(targetFile.path, joinLines(targetLines, targetContent));
      new Notice(this.translate("notice.staged"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die \xC4nderung nicht \xFCbernehmen.", error);
      new Notice(this.translate("notice.changeFailed"));
    }
  }
  /** Shows a short error message inside the view. */
  renderMessage(message: string): void {
    this.contentEl.createDiv({ cls: "file-diff-sbs-message", text: message });
  }
  /** Shows the left file and an inline picker before a right file is selected. */
  buildSelectionLayout(leftFile: TFile, leftLines: string[]): void {
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    const toolbar = root.createDiv({ cls: "file-diff-sbs-toolbar" });
    const title = toolbar.createDiv({ cls: "file-diff-sbs-title" });
    title.createSpan({
      text: this.translate("view.title.selection", {
        label: this.translate("view.labels.comparison"),
        name: leftFile.name
      }),
      cls: "file-diff-sbs-title-main"
    });
    title.createEl("small", { text: this.translate("view.selection.leftFixed") });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: this.translate("view.selection.none") });
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    this.buildFileHeader(header, leftFile, this.translate("view.labels.comparison"));
    const rightHeader = header.createDiv({ cls: "file-diff-sbs-file-header" });
    rightHeader.createSpan({ text: this.translate("view.labels.comparison"), cls: "file-diff-sbs-side-label" });
    const chooseHeaderButton = rightHeader.createEl("button", { text: this.translate("view.selection.chooseFile") });
    chooseHeaderButton.addEventListener("click", () => { this.selectRightFile(leftFile); });
    const scroll = root.createDiv({ cls: "file-diff-sbs-selection-scroll" });
    const panes = scroll.createDiv({ cls: "file-diff-sbs-selection-grid" });
    this.buildSingleFilePane(panes.createDiv({ cls: "file-diff-sbs-single-pane" }), leftLines);
    const rightPane = panes.createDiv({ cls: "file-diff-sbs-picker-pane" });
    const pickerCard = rightPane.createDiv({ cls: "file-diff-sbs-picker-card" });
    pickerCard.createEl("h3", { text: this.translate("view.selection.rightFile") });
    pickerCard.createEl("p", { text: this.translate("view.selection.description") });
    const chooseButton = pickerCard.createEl("button", {
      text: this.translate("view.selection.openSearch"),
      cls: "mod-cta"
    });
    chooseButton.addEventListener("click", () => { this.selectRightFile(leftFile); });
  }
  /** Returns pane labels for proposal, acceptance and regular comparison modes. */
  getPaneLabels(): { left: string; right: string } {
    if (this.state.mode === "proposal") {
      return {
        left: this.translate("view.labels.original"),
        right: this.translate("view.labels.proposal")
      };
    }
    if (this.state.mode === "accept") {
      return {
        left: this.translate("view.labels.proposal"),
        right: this.translate("view.labels.original")
      };
    }
    return {
      left: this.translate("view.labels.comparison"),
      right: this.translate("view.labels.comparison")
    };
  }
  /** Renders one file without diff decorations while the other pane is pending. */
  buildSingleFilePane(parent: HTMLElement, lines: string[]): void {
    for (let index = 0; index < lines.length; index += 1) {
      const row = parent.createDiv({ cls: "file-diff-sbs-single-row" });
      row.createSpan({ cls: "file-diff-sbs-line-number", text: String(index + 1) });
      row.createSpan({ cls: "file-diff-sbs-code", text: lines[index] ?? " " });
    }
  }
  /** Builds toolbar, file headers and the aligned diff rows. */
  buildLayout(leftFile: TFile, rightFile: TFile, leftLines: string[], rightLines: string[]): void {
    const paneLabels = this.getPaneLabels();
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    const rows = indexDiffRows(alignSequences(leftLines, rightLines, (a, b) => a === b));
    const changedRows = rows.filter((row) => !row.equal);
    const dismissedCount = changedRows.filter((row) => this.dismissedRows.has(getDiffRowKey(row))).length;
    const visibleChangedCount = changedRows.length - dismissedCount;
    const summaryParts = [this.translate(
      visibleChangedCount === 1 ? "view.summary.changedOne" : "view.summary.changedMany",
      { count: visibleChangedCount }
    )];
    if (dismissedCount > 0) {
      summaryParts.push(this.translate("view.summary.ignored", { count: dismissedCount }));
    }
    const summary = summaryParts.join(" \xB7 ");
    const toolbar = root.createDiv({ cls: "file-diff-sbs-toolbar" });
    const title = toolbar.createDiv({ cls: "file-diff-sbs-title" });
    title.createSpan({
      text: this.translate("view.title.comparison", {
        leftLabel: paneLabels.left,
        leftName: leftFile.name,
        rightLabel: paneLabels.right,
        rightName: rightFile.name
      }),
      cls: "file-diff-sbs-title-main"
    });
    title.createEl("small", {
      text: this.state.editRight ? this.translate("view.hint.edit") : this.state.mode === "accept" ? this.translate("view.hint.accept") : this.translate("view.hint.compare")
    });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: summary });
    const actionToolbar = root.createDiv({ cls: "file-diff-sbs-action-toolbar" });
    const actions = actionToolbar.createDiv({ cls: "file-diff-sbs-actions" });
    if (!this.state.editRight) {
      const editButton = actions.createEl("button", { text: this.translate("actions.edit") });
      editButton.title = this.translate("actions.editTitle");
      editButton.addEventListener("click", () => { void this.enableRightEditMode(); });
      const swapButton = actions.createEl("button", { text: this.translate("actions.swap") });
      swapButton.title = this.translate("actions.swapTitle");
      swapButton.addEventListener("click", () => { void this.swapFiles(); });
      const saveButton = actions.createEl("button", {
        text: this.translate("actions.savePending"),
        cls: "mod-cta file-diff-sbs-save-action"
      });
      saveButton.title = this.translate("actions.savePendingTitle");
      saveButton.addEventListener("click", () => { void this.savePendingChanges(); });
      this.saveButton = saveButton;
    } else {
      const compareButton = actions.createEl("button", { text: this.translate("actions.compareMode") });
      compareButton.title = this.translate("actions.compareModeTitle");
      compareButton.addEventListener("click", () => { void this.disableRightEditMode(); });
      const saveButton = actions.createEl("button", {
        text: this.translate("actions.saveRight"),
        cls: "mod-cta file-diff-sbs-save-action"
      });
      saveButton.title = this.translate("actions.saveRightTitle");
      saveButton.addEventListener("click", () => { void this.saveRightEdits(); });
      this.saveButton = saveButton;
    }
    this.updateSaveButtonState();
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    this.buildFileHeader(header, leftFile, paneLabels.left);
    this.buildFileHeader(
      header,
      rightFile,
      this.state.editRight ? `${paneLabels.right} \xB7 ${this.translate("view.labels.edit")}` : paneLabels.right
    );
    const allChangesResolved = !this.state.editRight && visibleChangedCount === 0 && (changedRows.length > 0 || this.hasPendingChanges());
    if (allChangesResolved) {
      this.buildResolvedMessage(root);
    } else if (changedRows.length === 0) {
      this.buildIdenticalMessage(root, leftFile, rightFile);
    }
    const scroll = root.createDiv({ cls: "file-diff-sbs-scroll" });
    const grid = scroll.createDiv({
      cls: this.state.editRight ? "file-diff-sbs-edit-grid" : "file-diff-sbs-grid"
    });
    if (this.state.editRight) {
      this.buildEditableModeLayout(grid, rows);
      return;
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) {
        continue;
      }
      if (!row.equal && this.dismissedRows.has(getDiffRowKey(row))) {
        const ignoredRow = getIgnoredDiffRow(row);
        if (!ignoredRow) {
          continue;
        }
        this.buildRow(grid, ignoredRow, index);
        continue;
      }
      this.buildRow(grid, row, index);
    }
  }
  /** Builds the editable right document beside the read-only left diff pane. */
  buildEditableModeLayout(parent: HTMLElement, rows: IndexedDiffRow[]): void {
    const leftPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane" });
    for (const row of rows) {
      this.buildEditableLeftCell(leftPane, row);
    }
    const rightPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane file-diff-sbs-edit-right-pane" });
    const editor = rightPane.createDiv({ cls: "file-diff-sbs-document-editor" });
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", this.translate("editor.rightFileAria"));
    const editableRows: IndexedDiffRow[] = rows.length > 0 ? rows : [{ left: null, right: null, equal: true, leftIndex: 0, rightIndex: 0, leftLineNumber: null, rightLineNumber: null }];
    for (const row of editableRows) {
      this.buildEditableRightLine(editor, row);
    }
    this.synchronizeEditablePanes(editor);
    const windowRef = editor.ownerDocument.defaultView;
    if (!windowRef) {
      return;
    }
    const observer = new windowRef.MutationObserver(() => { this.scheduleEditablePaneSync(editor); });
    observer.observe(editor, { childList: true, subtree: true });
    this.rightEditorState = { editor, initialValue: this.serializeRightEditor(editor), observer };
    this.updateSaveButtonState();
  }
  /** Renders one read-only left-side row beside the document editor. */
  buildEditableLeftCell(parent: HTMLElement, row: IndexedDiffRow): void {
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = row.left === null ? "" : String(row.leftLineNumber);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, row.left, row.right, "left");
  }
  /** Renders one editable right-side line inside the shared document editor. */
  buildEditableRightLine(parent: HTMLElement, row: IndexedDiffRow): HTMLElement {
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    const line = parent.createDiv({ cls: `file-diff-sbs-edit-line file-diff-sbs-${rowType}` });
    line.dataset.rightPresent = row.right === null ? "false" : "true";
    const lineNumber = line.createSpan({ cls: "file-diff-sbs-line-number file-diff-sbs-edit-line-number" });
    lineNumber.textContent = row.right === null ? "" : String(row.rightLineNumber);
    lineNumber.setAttribute("contenteditable", "false");
    const code = line.createSpan({ cls: "file-diff-sbs-edit-code" });
    code.textContent = row.right === null ? "" : row.right;
    return line;
  }
  /** Serializes editable right-side lines without including the line-number gutter. */
  serializeRightEditor(editor: HTMLElement): string {
    const children = Array.from(editor.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    if (children.length === 0) {
      return (editor.innerText || editor.textContent || "").replace(/\r\n?/g, "\n");
    }
    return serializeEditableLines(children.map((line) => {
      const code = line.querySelector<HTMLElement>(".file-diff-sbs-edit-code");
      const value = code ? code.innerText : line.innerText || line.textContent || "";
      return {
        value,
        isAlignmentGap: line.classList.contains("file-diff-sbs-edit-gap") || line.classList.contains("file-diff-sbs-added") && value.trim() === "",
        rightPresent: line.dataset.rightPresent !== "false"
      };
    }));
  }
  /** Returns whether the editable right side differs from its saved snapshot. */
  hasRightEditorChanges(): boolean {
    return Boolean(
      this.state.editRight && this.rightEditorState && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue
    );
  }
  /** Enables or disables the visible save action based on current changes. */
  updateSaveButtonState(): void {
    if (!this.saveButton) {
      return;
    }
    const hasChanges = this.state.editRight ? this.hasRightEditorChanges() : this.hasPendingChanges();
    this.saveButton.disabled = !hasChanges;
    this.saveButton.setAttribute("aria-disabled", String(!hasChanges));
  }
  /** Shows the identical-file message and the actions available for the current mode. */
  buildIdenticalMessage(parent: HTMLElement, leftFile: TFile, rightFile: TFile): void {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.identical.title") });
    if (this.state.editRight) {
      message.createEl("span", { text: this.translate("messages.identical.edit") });
      return;
    }
    message.createEl("span", { text: this.translate("messages.identical.trash") });
    const actions = message.createDiv({ cls: "file-diff-sbs-identical-actions" });
    const deleteLeftButton = actions.createEl("button", { text: this.translate("messages.identical.deleteLeft") });
    deleteLeftButton.title = leftFile.path;
    deleteLeftButton.addEventListener("click", () => { this.confirmDeleteIdenticalFile(leftFile); });
    const deleteRightButton = actions.createEl("button", { text: this.translate("messages.identical.deleteRight") });
    deleteRightButton.title = rightFile.path;
    deleteRightButton.addEventListener("click", () => { this.confirmDeleteIdenticalFile(rightFile); });
  }
  /** Shows that every detected suggestion was accepted or dismissed. */
  buildResolvedMessage(parent: HTMLElement): void {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.resolved.title") });
    message.createEl("span", {
      text: this.hasPendingChanges() ? this.translate("messages.resolved.pending") : this.translate("messages.resolved.none")
    });
  }
  /** Adds a pane header with side label and vault-relative path. */
  buildFileHeader(parent: HTMLElement, file: TFile, sideLabel: string): void {
    const header = parent.createDiv({ cls: "file-diff-sbs-file-header" });
    header.createSpan({ text: sideLabel, cls: "file-diff-sbs-side-label" });
    header.createSpan({ text: file.name, cls: "file-diff-sbs-file-path" });
  }
  /** Confirms and performs moving an identical file to the system trash. */
  confirmDeleteIdenticalFile(file: TFile): void {
    new DeleteIdenticalFileModal(this.app, file, async () => {
      try {
        await this.app.fileManager.trashFile(file);
        new Notice(this.translate("notice.fileTrashed", { name: file.name }));
        this.leaf.detach();
      } catch (error) {
        console.error("Side-by-Side Diff konnte die identische Datei nicht verschieben.", error);
        new Notice(this.translate("notice.fileTrashFailed"));
      }
    }, this.translate.bind(this)).open();
  }
  /** Renders one aligned pair of lines with line numbers, actions and inline changes. */
  buildRow(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    const rowElement = parent.createDiv({ cls: "file-diff-sbs-row" });
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    this.buildCell(rowElement, row.left, row.right, row.leftLineNumber, "left", rowType);
    this.buildActionCell(rowElement, row, rowIndex);
    this.buildCell(rowElement, row.right, row.left, row.rightLineNumber, "right", rowType);
  }
  /** Adds centered buttons for copying or ignoring a changed row in read-only mode. */
  buildActionCell(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    const cell = parent.createDiv({ cls: "file-diff-sbs-action-cell" });
    if (row.equal || this.state.editRight) {
      return;
    }
    const leftToRight = cell.createEl("button", { text: "\u2192", cls: "file-diff-sbs-merge-button" });
    leftToRight.title = this.state.mode === "accept" ? this.translate("actions.acceptProposal") : this.translate("actions.copyLeftToRight");
    leftToRight.addEventListener("click", () => { void this.applyRowChange(rowIndex, "left-to-right"); });
    const dismissButton = cell.createEl("button", { text: "\xD7", cls: "file-diff-sbs-merge-button" });
    dismissButton.title = this.translate("actions.dismiss");
    dismissButton.addEventListener("click", () => { this.dismissRow(row); });
  }
  /** Ignores one left-side change while keeping the right-side content visible. */
  dismissRow(row: IndexedDiffRow): void {
    const scrollPosition = this.getScrollPosition();
    this.dismissedRows.add(getDiffRowKey(row));
    void this.renderDiff(scrollPosition);
  }
  /** Renders one side of a diff row. */
  buildCell(parent: HTMLElement, value: string | null, counterpart: string | null, lineNumberValue: number | null, side: EditableSide, rowType: EditableRowType): void {
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = value === null ? "" : String(lineNumberValue);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, side === "left" ? value : counterpart, side === "left" ? counterpart : value, side);
  }
  /** Swaps the files while keeping the current diff view open. */
  async swapFiles(): Promise<void> {
    this.dismissedRows.clear();
    const mode = this.state.mode === "accept" ? "proposal" : this.state.mode === "proposal" ? "accept" : "compare";
    const nextState = {
      leftPath: this.state.rightPath,
      rightPath: this.state.leftPath,
      editRight: false,
      mode
    };
    await this.setState(nextState, { history: false });
  }
}
class FileDiffSettingsTab extends PluginSettingTab {
  private readonly plugin: FileDiffSideBySidePlugin;

  /** Creates the settings tab for the file diff plugin. */
  constructor(app: App, plugin: FileDiffSideBySidePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /** Renders the language, ribbon visibility, and change-copy settings. */
  // Keep the legacy renderer because manifest.json supports Obsidian 1.5.0.
  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(this.plugin.translate("settings.language.name")).setDesc(this.plugin.translate("settings.language.description")).addDropdown((dropdown) => {
      dropdown.addOption("auto", this.plugin.translate("settings.language.auto")).addOption("de", this.plugin.translate("settings.language.de")).addOption("en", this.plugin.translate("settings.language.en")).setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.updateLanguage(value);
        await this.plugin.saveSettings();
        // Keep the legacy renderer because manifest.json supports Obsidian 1.5.0.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        this.display();
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
class FileDiffSideBySidePlugin extends Plugin {
  override settings: PluginSettings = DEFAULT_SETTINGS;
  language: Language = "en";
  translator: Translator = createTranslator("en");
  ribbonIconEl: HTMLElement | null = null;
  commandEntries: Command[] = [];

  /** Loads settings and registers the view, commands and ribbon action. */
  override async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new SideBySideDiffView(leaf, this));
    this.ribbonIconEl = this.addRibbonIcon(
      ICON_ID,
      this.translate("ribbon.compareTwoFiles"),
      () => void this.compareTwoFiles()
    );
    this.updateRibbonVisibility();
    this.addSettingTab(new FileDiffSettingsTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.path !== this.app.workspace.getActiveFile()?.path) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.compareActiveFile")).setIcon(ICON_ID).onClick(() => { void this.compareActiveFile(file); });
        });
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.proposeChanges")).setIcon(ICON_ID).onClick(() => { void this.proposeChanges(file); });
        });
        const changeCopy = this.findLatestChangeCopy(file);
        if (changeCopy) {
          menu.addItem((item) => {
            item.setTitle(this.translate("menu.acceptChanges")).setIcon(ICON_ID).onClick(() => { void this.openDiffView(changeCopy, file, false, "accept"); });
          });
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.refresh")).setIcon("refresh-cw").onClick(() => { this.refreshDiffViews(file); });
        });
      })
    );
    this.commandEntries = [
      this.addCommand({
        id: "compare-active-file",
        name: this.translate("commands.compareActiveFile"),
        callback: () => { void this.compareActiveFile(); }
      }),
      this.addCommand({
        id: "compare-two-files",
        name: this.translate("commands.compareTwoFiles"),
        callback: () => { void this.compareTwoFiles(); }
      }),
      this.addCommand({
        id: "propose-changes",
        name: this.translate("commands.proposeChanges"),
        callback: () => { void this.proposeChanges(); }
      })
    ];
  }
  /** Loads persisted plugin settings and applies defaults for new options. */
  async loadSettings(): Promise<void> {
    const storedData: unknown = await this.loadData();
    const storedSettings = typeof storedData === "object" && storedData !== null ? storedData as Record<string, unknown> : {};
    this.settings = {
      showRibbonIcon: typeof storedSettings.showRibbonIcon === "boolean" ? storedSettings.showRibbonIcon : DEFAULT_SETTINGS.showRibbonIcon,
      changeCopySuffix: typeof storedSettings.changeCopySuffix === "string" ? sanitizeCopySuffix(storedSettings.changeCopySuffix) : DEFAULT_SETTINGS.changeCopySuffix,
      language: storedSettings.language === "de" || storedSettings.language === "en" || storedSettings.language === "auto" ? storedSettings.language : DEFAULT_SETTINGS.language
    };
    if (!["auto", "de", "en"].includes(this.settings.language)) {
      this.settings.language = DEFAULT_SETTINGS.language;
    }
    this.language = resolveLanguage(this.settings.language, moment.locale());
    this.translator = createTranslator(this.language);
  }
  /** Translates one UI key using the currently selected language. */
  translate(key: string, variables: Record<string, string | number> = {}): string {
    return this.translator(key, variables);
  }
  /** Applies a language preference and refreshes safe open comparison views. */
  updateLanguage(preference: string): void {
    this.settings.language = isLanguagePreference(preference) ? preference : "auto";
    this.language = resolveLanguage(this.settings.language, moment.locale());
    this.translator = createTranslator(this.language);
    this.updateLocalizedLabels();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (!(view instanceof SideBySideDiffView) || view.hasUnsavedChanges()) {
        continue;
      }
      void view.renderDiff(view.getScrollPosition());
    }
  }
  /** Updates labels that Obsidian keeps outside the rendered comparison views. */
  updateLocalizedLabels(): void {
    const commandNames = [
      this.translate("commands.compareActiveFile"),
      this.translate("commands.compareTwoFiles"),
      this.translate("commands.proposeChanges")
    ];
    this.commandEntries.forEach((command, index) => {
      const commandName = commandNames[index];
      if (commandName !== undefined) {
        command.name = commandName;
      }
    });
    const ribbonLabel = this.translate("ribbon.compareTwoFiles");
    this.ribbonIconEl?.setAttribute("aria-label", ribbonLabel);
    this.ribbonIconEl?.setAttribute("title", ribbonLabel);
  }
  /** Persists the current plugin settings in the vault configuration. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
  /** Refreshes open comparison views for a file from the document context menu. */
  refreshDiffViews(file: TFile): void {
    let matchingViewFound = false;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (!(view instanceof SideBySideDiffView)) {
        continue;
      }
      if (view.state.leftPath !== file.path && view.state.rightPath !== file.path) {
        continue;
      }
      matchingViewFound = true;
      if (view.hasUnsavedChanges()) {
        new Notice(this.translate("notice.refreshUnsaved"));
        continue;
      }
      void view.renderDiff(view.getScrollPosition());
    }
    if (!matchingViewFound) {
      new Notice(this.translate("notice.noOpenView"));
    }
  }
  /** Shows or hides the plugin icon in Obsidian's left ribbon. */
  updateRibbonVisibility(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.toggleVisibility(this.settings.showRibbonIcon);
    }
  }
  /** Closes all open diff leaves when the plugin is disabled. */
  override onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  /** Starts a comparison with the currently active text file on the left. */
  async compareActiveFile(file: TFile | null = null): Promise<void> {
    const activeFile = file ?? this.app.workspace.getActiveFile();
    if (!isTextFile(activeFile)) {
      new Notice(this.translate("notice.openTextFirst"));
      return;
    }
    await this.openDiffView(activeFile);
  }
  /** Creates or reuses a timestamped change copy and opens it editable on the right. */
  async proposeChanges(file: TFile | null = null): Promise<void> {
    const sourceFile = file ?? this.app.workspace.getActiveFile();
    if (!isTextFile(sourceFile)) {
      new Notice(this.translate("notice.openTextFirst"));
      return;
    }
    try {
      const existingCopy = this.findLatestChangeCopy(sourceFile);
      if (existingCopy) {
        await this.openDiffView(sourceFile, existingCopy, true, "proposal");
        return;
      }
      const content = await this.app.vault.read(sourceFile);
      const copyFile = await this.app.vault.create(this.getChangeCopyPath(sourceFile), content);
      await this.openDiffView(sourceFile, copyFile, true, "proposal");
    } catch (error) {
      console.error("Side-by-Side Diff konnte keine \xC4nderungskopie anlegen.", error);
      new Notice(this.translate("notice.copyFailed"));
    }
  }
  /** Finds the newest existing change copy next to the source file. */
  findLatestChangeCopy(sourceFile: TFile): TFile | null {
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const prefix = `${sourceFile.basename}${suffix}`;
    const parentPath = sourceFile.parent?.path ?? "";
    return this.getTextFiles().filter(
      (file) => file.path !== sourceFile.path && (file.parent?.path ?? "") === parentPath && file.extension === sourceFile.extension && file.basename.startsWith(prefix)
    ).sort((a, b) => b.stat.mtime - a.stat.mtime || b.path.localeCompare(a.path, this.language))[0] ?? null;
  }
  /** Builds a unique vault path for a timestamped change copy. */
  getChangeCopyPath(sourceFile: TFile): string {
    const parentPath = sourceFile.parent?.path ?? "";
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const extension = sourceFile.extension.length > 0 ? `.${sourceFile.extension}` : "";
    const baseName = `${sourceFile.basename}${suffix}${formatCopyTimestamp(/* @__PURE__ */ new Date())}`;
    let counter = 0;
    let fileName = `${baseName}${extension}`;
    let path = parentPath.length > 0 ? `${parentPath}/${fileName}` : fileName;
    while (this.app.vault.getAbstractFileByPath(path)) {
      counter += 1;
      fileName = `${baseName}-${counter.toString()}${extension}`;
      path = parentPath.length > 0 ? `${parentPath}/${fileName}` : fileName;
    }
    return path;
  }
  /** Opens the active file immediately and lets the right file be selected in the view. */
  async compareTwoFiles(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (isTextFile(activeFile)) {
      await this.openDiffView(activeFile);
      return;
    }
    const files = this.getTextFiles();
    const leftFile = await this.pickFile(files, this.translate("picker.leftFile"));
    if (!leftFile) {
      return;
    }
    await this.openDiffView(leftFile);
  }
  /** Returns all non-binary vault files in stable path order. */
  getTextFiles(): TFile[] {
    return this.app.vault.getFiles().filter(isTextFile).sort((a, b) => a.path.localeCompare(b.path, this.language));
  }
  /** Opens a file picker and resolves with the selected file or null. */
  pickFile(files: TFile[], placeholder: string): Promise<TFile | null> {
    return new Promise<TFile | null>((resolve) => {
      const modal = new FilePickerModal(this.app, files, resolve, this.language);
      modal.setPlaceholder(placeholder);
      modal.open();
    });
  }
  /** Opens the comparison in a new split leaf, optionally awaiting the right file. */
  async openDiffView(leftFile: TFile, rightFile: TFile | null = null, editRight = false, mode: PaneMode = "compare"): Promise<void> {
    if (rightFile && leftFile.path === rightFile.path) {
      new Notice(this.translate("notice.differentFiles"));
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
        state: { leftPath: leftFile.path, rightPath: rightFile === null ? null : rightFile.path, editRight, mode }
      });
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Ansicht nicht \xF6ffnen.", error);
      new Notice(this.translate("notice.viewOpenFailed"));
    }
  }
}
export default FileDiffSideBySidePlugin;
