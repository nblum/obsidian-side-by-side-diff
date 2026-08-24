import { ItemView, Notice, TFile, requireApiVersion } from "obsidian";
import type { TAbstractFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { applyAlignedRowChange, convertLineEndings, getDiffRowKey, getDiffRowType, getIgnoredDiffRow, getInlineDiffTokens, getLineSyncPlan, joinLines, serializeEditableLines, splitLines, type DiffDirection, type IndexedDiffRow, type InlineDiffToken } from "./diff-core";
import { createComparisonModelFromLines, createIndexedDiffRowsFromLines, type ComparisonRowModel } from "./diff-model";
import { clearChangeTargetMetadata, getAutoAdvanceChangeIndex, getChangeKeyboardAction, getNextChangeIndex, type ChangeNavigationDirection } from "./diff-navigation";
import { DeleteIdenticalFileModal, FilePickerModal, UnsavedChangesModal } from "./modals";
import { captureSaveBaseline, createGuardedSaveTransform, SaveConflictError } from "./save-guard";
import { isTextFile, VIEW_TYPE } from "./file-utils";
import { getRecentFiles } from "./recent-files";
import type { Language } from "./i18n";

export type PaneMode = "compare" | "proposal" | "accept";
type EditableSide = "left" | "right";
type EditableRowType = "equal" | "added" | "removed" | "changed";

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

interface DiffViewPlugin {
  readonly language: Language;
  readonly settings: { autoAdvanceAfterChange: boolean; recentRightFilePaths: string[] };
  translate(key: string, variables?: Record<string, string | number>): string;
  rememberRecentRightFile(file: TFile): Promise<void>;
}

/** Renders token-level differences without injecting HTML strings. */
function appendInlineDiff(parent: HTMLElement, value: string | null, counterpart: string | null, side: EditableSide, inlineTokens?: InlineDiffToken[]): void {
	if (value === null || counterpart === null) {
		parent.textContent = value ?? " ";
		return;
	}
	const tokens = inlineTokens ?? getInlineDiffTokens(value, counterpart)[side];
  for (const token of tokens) {
    const span = parent.createSpan({ text: token.value });
    if (token.changed) {
      span.addClass(`file-diff-sbs-inline-${side}`);
    }
  }
}

/** Renders and manages one synchronized side-by-side comparison view. */
export class SideBySideDiffView extends ItemView {
  private readonly plugin: DiffViewPlugin;
  state: DiffViewState = { leftPath: null, rightPath: null, editRight: false, mode: "compare" };
  private renderToken = 0;
  private readonly dismissedRows = new Set<string>();
  private readonly pendingFileContents = new Map<string, string>();
  private readonly saveBaselines = new Map<string, string>();
  private rightEditorState: RightEditorState | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private editInputSnapshot: EditInputSnapshot | null = null;
  private editSyncFrame: number | null = null;
  private saveRequestInProgress = false;
  private activeChangeRowIndex: number | null = null;
  private previousChangeButton: HTMLButtonElement | null = null;
  private nextChangeButton: HTMLButtonElement | null = null;

  /** Initializes the view and subscribes to relevant vault changes. */
  constructor(leaf: WorkspaceLeaf, plugin: DiffViewPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", (event) => { this.handleGlobalKeydown(event); }, { capture: true });
    const windowRef = this.contentEl.ownerDocument.defaultView;
    if (windowRef) {
      this.registerDomEvent(windowRef, "keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          const comparisonViewActive = this.app.workspace.getActiveViewOfType(SideBySideDiffView) === this;
          if (!comparisonViewActive) {
            return;
          }
          if (this.saveChanges()) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }
      }, { capture: true });
    }
    this.registerDomEvent(this.contentEl, "beforeinput", (event) => { this.handleBeforeInput(event); });
    this.registerDomEvent(this.contentEl, "input", (event) => { this.handleInput(event); });
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
    if (this.app.workspace.getActiveViewOfType(SideBySideDiffView) !== this) {
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
  handleInput(event: Event): void {
    if (!this.state.editRight || !("inputType" in event) || typeof event.inputType !== "string") {
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
  /** Handles keyboard editing actions inside the comparison view. */
  handleKeydown(event: KeyboardEvent): void {
    const changeAction = getChangeKeyboardAction(event.key, event.altKey, event.ctrlKey, event.metaKey, event.shiftKey);
    if (changeAction === "next" || changeAction === "previous") {
      if (this.navigateChange(changeAction)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (changeAction === "accept" || changeAction === "reject") {
      if (this.handleActiveChangeAction(changeAction)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
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
  }
  /** Saves the current comparison changes from the toolbar or a command shortcut. */
  saveChanges(): boolean {
    if (this.saveRequestInProgress) {
      return false;
    }
    let canSave = false;
    try {
      canSave = this.state.editRight ? this.hasRightEditorChanges() : this.hasPendingChanges();
    } catch (error) {
      console.error("[Side-by-Side Diff] change detection failed", error);
      return false;
    }
    if (!canSave) {
      return false;
    }
    this.saveRequestInProgress = true;
    const saveOperation = this.state.editRight ? this.saveRightEdits() : this.savePendingChanges();
    void saveOperation.finally(() => { this.saveRequestInProgress = false; });
    return true;
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
    this.previousChangeButton = null;
    this.nextChangeButton = null;
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
      if (this.state.editRight) {
        // Keep the first snapshot so a later rerender cannot hide an external edit.
        captureSaveBaseline(this.saveBaselines, rightFile.path, storedRightContent);
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
  /** Navigates to a changed row and scrolls that row into the visible comparison area. */
  navigateChange(direction: ChangeNavigationDirection): boolean {
    const targets = this.getChangeTargets();
    const nextIndex = getNextChangeIndex(
      [...targets.keys()],
      this.activeChangeRowIndex,
      direction,
    );
    if (nextIndex === null) {
      return false;
    }
    return this.focusChange(nextIndex);
  }
  /** Activates and scrolls to a specific currently open change. */
  focusChange(rowIndex: number): boolean {
    const targets = this.getChangeTargets();
    if (!targets.has(rowIndex)) {
      return false;
    }
    this.activeChangeRowIndex = rowIndex;
    for (const [rowIndex, rowTargets] of targets) {
      const isActive = rowIndex === this.activeChangeRowIndex;
      for (const element of rowTargets) {
        element.toggleClass("file-diff-sbs-active-change", isActive);
        if (isActive) {
          element.setAttribute("aria-current", "true");
        } else {
          element.removeAttribute("aria-current");
        }
      }
    }
    const target = targets.get(rowIndex)?.[0];
    if (!target) {
      return false;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return true;
  }
  /** Collects rendered change targets once per aligned row. */
  getChangeTargets(): Map<number, HTMLElement[]> {
    const targets = new Map<number, HTMLElement[]>();
    for (const element of Array.from(this.contentEl.querySelectorAll<HTMLElement>("[data-diff-change='true']"))) {
      const rowIndex = Number(element.dataset.diffRowIndex);
      if (Number.isInteger(rowIndex)) {
        const rowTargets = targets.get(rowIndex) ?? [];
        rowTargets.push(element);
        targets.set(rowIndex, rowTargets);
      }
    }
    return new Map([...targets.entries()].sort(([left], [right]) => left - right));
  }
  /** Opens a file picker for the right-hand pane. */
  selectRightFile(leftFile: TFile): void {
    const files = this.app.vault.getFiles().filter((file) => isTextFile(file) && file.path !== leftFile.path).sort((a, b) => a.path.localeCompare(b.path, this.plugin.language));
    const recentFiles = getRecentFiles(files, this.plugin.settings.recentRightFilePaths);
    const modal = new FilePickerModal(this.app, files, (rightFile) => {
      if (rightFile) {
        void this.applyRightFile(leftFile, rightFile);
      }
    }, this.plugin.language, {
      recentFiles,
      recentLabel: this.translate("picker.recentFiles"),
      allFilesLabel: this.translate("picker.allFiles")
    });
    modal.setPlaceholder(this.translate("picker.rightFile"));
    modal.open();
  }
  /** Applies the selected right file and redraws the comparison view. */
  async applyRightFile(leftFile: TFile, rightFile: TFile): Promise<void> {
    const nextState: DiffViewState = { leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" };
    this.state = nextState;
    this.activeChangeRowIndex = null;
    this.pendingFileContents.clear();
    this.saveBaselines.clear();
    this.dismissedRows.clear();
    void this.plugin.rememberRecentRightFile(rightFile);
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
    if (!await this.prepareForTransition(this.translate("modal.unsaved.editQuestion"))) {
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
    if (this.state.rightPath !== null) {
      this.saveBaselines.delete(this.state.rightPath);
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
        const editor = this.rightEditorState.editor;
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
        const saved = await this.processUnchangedFile(rightFile, (currentContent) => {
          return convertLineEndings(this.serializeRightEditor(editor), currentContent);
        });
        if (!saved) {
          return;
        }
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
      const editor = this.rightEditorState?.editor;
      if (!editor) {
        return;
      }
      const saved = await this.processUnchangedFile(rightFile, (currentContent) => {
        return convertLineEndings(this.serializeRightEditor(editor), currentContent);
      });
      if (!saved) {
        return;
      }
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
    // Navigation metadata belongs to the original aligned row, not the inserted line.
    clearChangeTargetMetadata(newLine);
    newLine.dataset.rightPresent = "true";
    newLine.textContent = "";
    const lineNumber = newLine.createSpan({ cls: "file-diff-sbs-line-number file-diff-sbs-edit-line-number" });
    lineNumber.setAttribute("contenteditable", "false");
    const newCode = newLine.createSpan({ cls: "file-diff-sbs-edit-code" });
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
    return Array.from(parent.children).filter((child): child is HTMLElement => child.instanceOf(HTMLElement) && (child.classList.contains("file-diff-sbs-cell") || child.classList.contains("file-diff-sbs-edit-line")));
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
      if (node.instanceOf(HTMLElement) && node.classList.contains("file-diff-sbs-edit-line")) {
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
  /** Processes a file only when its save snapshot still matches the process input. */
  async processUnchangedFile(file: TFile, transform: (currentContent: string) => string): Promise<boolean> {
    try {
      await this.app.vault.process(
        file,
        createGuardedSaveTransform(this.saveBaselines.get(file.path), transform),
      );
    } catch (error) {
      if (!(error instanceof SaveConflictError)) {
        throw error;
      }
      new Notice(this.translate("notice.externalChange", { name: file.name }));
      return false;
    }
    this.saveBaselines.delete(file.path);
    return true;
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
    for (const pendingFile of pendingFiles) {
      if (!(pendingFile.file instanceof TFile)) {
        return false;
      }
      const saved = await this.processUnchangedFile(pendingFile.file, () => pendingFile.content);
      if (!saved) {
        return false;
      }
      // Remove each successful entry immediately so a later failure remains retryable.
      this.pendingFileContents.delete(pendingFile.file.path);
    }
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
      const rows = createIndexedDiffRowsFromLines(splitLines(leftContent), splitLines(rightContent));
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
      const targetBaseline = leftToRight ? storedRightContent : storedLeftContent;
      captureSaveBaseline(this.saveBaselines, targetFile.path, targetBaseline);
      this.pendingFileContents.set(targetFile.path, joinLines(targetLines, targetContent));
      new Notice(this.translate("notice.staged"));
      await this.renderDiff(scrollPosition);
      this.advanceAfterResolvedChange(rowIndex);
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
    const rows = createComparisonModelFromLines(leftLines, rightLines).rows;
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
    const navigation = actions.createDiv({ cls: "file-diff-sbs-navigation" });
    const previousChangeButton = navigation.createEl("button", { text: this.translate("actions.previousChange") });
    previousChangeButton.title = this.translate("actions.previousChangeTitle");
    previousChangeButton.setAttribute("aria-keyshortcuts", "Alt+ArrowUp");
    previousChangeButton.addEventListener("click", () => { this.navigateChange("previous"); });
    this.previousChangeButton = previousChangeButton;
    const nextChangeButton = navigation.createEl("button", { text: this.translate("actions.nextChange") });
    nextChangeButton.title = this.translate("actions.nextChangeTitle");
    nextChangeButton.setAttribute("aria-keyshortcuts", "Alt+ArrowDown");
    nextChangeButton.addEventListener("click", () => { this.navigateChange("next"); });
    this.nextChangeButton = nextChangeButton;
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
      this.updateChangeNavigationState();
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
        this.buildRow(grid, ignoredRow, index, false);
        continue;
      }
      this.buildRow(grid, row, index, !row.equal);
    }
    this.updateChangeNavigationState();
  }
  /** Builds the editable right document beside the read-only left diff pane. */
  buildEditableModeLayout(parent: HTMLElement, rows: IndexedDiffRow[]): void {
    const leftPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane" });
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row) {
        this.buildEditableLeftCell(leftPane, row, index);
      }
    }
    const rightPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane file-diff-sbs-edit-right-pane" });
    const editor = rightPane.createDiv({ cls: "file-diff-sbs-document-editor" });
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", this.translate("editor.rightFileAria"));
    const editableRows: IndexedDiffRow[] = rows.length > 0 ? rows : [{ left: null, right: null, equal: true, leftIndex: 0, rightIndex: 0, leftLineNumber: null, rightLineNumber: null }];
    for (let index = 0; index < editableRows.length; index += 1) {
      const row = editableRows[index];
      if (row) {
        this.buildEditableRightLine(editor, row, index);
      }
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
  buildEditableLeftCell(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    const rowType = getDiffRowType(row);
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    this.markChangeTarget(cell, row, rowIndex);
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = row.left === null ? "" : String(row.leftLineNumber);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, row.left, row.right, "left");
  }
  /** Renders one editable right-side line inside the shared document editor. */
  buildEditableRightLine(parent: HTMLElement, row: IndexedDiffRow, rowIndex = -1): HTMLElement {
    const rowType = getDiffRowType(row);
    const line = parent.createDiv({ cls: `file-diff-sbs-edit-line file-diff-sbs-${rowType}` });
    this.markChangeTarget(line, row, rowIndex);
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
    const children = Array.from(editor.children).filter((child): child is HTMLElement => child.instanceOf(HTMLElement));
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
  /** Enables navigation buttons only when the rendered comparison has a change. */
  updateChangeNavigationState(): void {
    const hasChanges = this.contentEl.querySelector("[data-diff-change='true']") !== null;
    if (this.previousChangeButton) {
      this.previousChangeButton.disabled = !hasChanges;
    }
    if (this.nextChangeButton) {
      this.nextChangeButton.disabled = !hasChanges;
    }
  }
  /** Shows the identical-file message and the actions available for the current mode. */
  buildIdenticalMessage(parent: HTMLElement, leftFile: TFile, rightFile: TFile): void {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.identical.title") });
    if (this.state.editRight) {
      message.createSpan({ text: this.translate("messages.identical.edit") });
      return;
    }
    message.createSpan({ text: this.translate("messages.identical.trash") });
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
    message.createSpan({
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
        // Use the newer API where available and retain compatibility with Obsidian 1.5.
        const trashOperation = requireApiVersion("1.6.6")
          ? this.app.fileManager.trashFile(file)
          : this.app.vault.trash(file, true);
        await trashOperation;
        new Notice(this.translate("notice.fileTrashed", { name: file.name }));
        this.leaf.detach();
      } catch (error) {
        console.error("Side-by-Side Diff konnte die identische Datei nicht verschieben.", error);
        new Notice(this.translate("notice.fileTrashFailed"));
      }
    }, this.translate.bind(this)).open();
  }
  /** Renders one aligned pair of lines with line numbers, actions and inline changes. */
  buildRow(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number, isChange = !row.equal): void {
    const rowElement = parent.createDiv({ cls: "file-diff-sbs-row" });
    rowElement.dataset.diffRowIndex = String(rowIndex);
    if (isChange) {
      rowElement.dataset.diffChange = "true";
    }
    if (rowIndex === this.activeChangeRowIndex && isChange) {
      rowElement.addClass("file-diff-sbs-active-change");
      rowElement.setAttribute("aria-current", "true");
    }
    const modelRow = "leftInlineTokens" in row ? row as ComparisonRowModel : null;
    const rowType = getDiffRowType(row);
    this.buildCell(rowElement, row.left, row.right, row.leftLineNumber, "left", rowType, modelRow?.leftInlineTokens);
    this.buildActionCell(rowElement, row, rowIndex);
    this.buildCell(rowElement, row.right, row.left, row.rightLineNumber, "right", rowType, modelRow?.rightInlineTokens);
  }
  /** Adds the row metadata used by keyboard and button navigation. */
  markChangeTarget(element: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    element.dataset.diffRowIndex = String(rowIndex);
    if (!row.equal) {
      element.dataset.diffChange = "true";
      if (rowIndex === this.activeChangeRowIndex) {
        element.addClass("file-diff-sbs-active-change");
        element.setAttribute("aria-current", "true");
      }
    }
  }
  /** Adds centered buttons for copying or ignoring a changed row in read-only mode. */
  buildActionCell(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    const cell = parent.createDiv({ cls: "file-diff-sbs-action-cell" });
    if (row.equal || this.state.editRight) {
      return;
    }
    const leftToRight = cell.createEl("button", { text: "\u2192", cls: "file-diff-sbs-merge-button" });
    leftToRight.title = this.state.mode === "accept" ? this.translate("actions.acceptProposal") : this.translate("actions.copyLeftToRight");
    leftToRight.setAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    leftToRight.addEventListener("click", () => { void this.applyRowChange(rowIndex, "left-to-right"); });
    const dismissButton = cell.createEl("button", { text: "\xD7", cls: "file-diff-sbs-merge-button" });
    dismissButton.title = this.translate("actions.dismiss");
    dismissButton.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    dismissButton.addEventListener("click", () => { void this.dismissRow(row, rowIndex); });
  }
  /** Triggers the existing accept or ignore action for the highlighted row. */
  handleActiveChangeAction(action: "accept" | "reject"): boolean {
    if (this.state.editRight) {
      return false;
    }
    const activeRow = this.contentEl.querySelector<HTMLElement>(".file-diff-sbs-row.file-diff-sbs-active-change[data-diff-change='true']");
    if (!activeRow) {
      return false;
    }
    const buttons = activeRow.querySelectorAll<HTMLButtonElement>(".file-diff-sbs-merge-button");
    const button = buttons[action === "accept" ? 0 : 1];
    if (!button) {
      return false;
    }
    button.click();
    return true;
  }
  /** Ignores one left-side change while keeping the right-side content visible. */
  async dismissRow(row: IndexedDiffRow, rowIndex: number): Promise<void> {
    const scrollPosition = this.getScrollPosition();
    this.dismissedRows.add(getDiffRowKey(row));
    await this.renderDiff(scrollPosition);
    this.advanceAfterResolvedChange(rowIndex);
  }
  /** Moves to the next open change after accepting or ignoring one when enabled. */
  advanceAfterResolvedChange(rowIndex: number): void {
    const nextIndex = getAutoAdvanceChangeIndex(
      [...this.getChangeTargets().keys()],
      rowIndex,
      this.plugin.settings.autoAdvanceAfterChange,
    );
    if (nextIndex === null) {
      return;
    }
    this.focusChange(nextIndex);
  }
  /** Renders one side of a diff row. */
  buildCell(parent: HTMLElement, value: string | null, counterpart: string | null, lineNumberValue: number | null, side: EditableSide, rowType: EditableRowType, inlineTokens?: InlineDiffToken[]): void {
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = value === null ? "" : String(lineNumberValue);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, value, counterpart, side, inlineTokens);
  }
  /** Swaps the files while keeping the current diff view open. */
  async swapFiles(): Promise<void> {
    if (!await this.prepareForSwap()) {
      return;
    }
    this.dismissedRows.clear();
    this.activeChangeRowIndex = null;
    this.saveBaselines.clear();
    const mode = this.state.mode === "accept" ? "proposal" : this.state.mode === "proposal" ? "accept" : "compare";
    const nextState = {
      leftPath: this.state.rightPath,
      rightPath: this.state.leftPath,
      editRight: false,
      mode
    };
    await this.setState(nextState, { history: false });
  }
  /** Confirms how transient comparison changes should be handled before swapping the panes. */
  async prepareForSwap(): Promise<boolean> {
    return this.prepareForTransition(this.translate("modal.unsaved.swapQuestion"));
  }
  /** Confirms how transient comparison changes should be handled before a view transition. */
  async prepareForTransition(question: string): Promise<boolean> {
    if (!this.hasUnsavedChanges() && this.dismissedRows.size === 0) {
      return true;
    }
    const choice = await new UnsavedChangesModal(this.app, this.translate.bind(this), question).waitForChoice();
    if (choice === "discard") {
      this.pendingFileContents.clear();
      this.saveBaselines.clear();
      return true;
    }
    if (this.state.editRight) {
      await this.saveRightEdits();
    } else {
      await this.savePendingChanges();
    }
    return !this.hasUnsavedChanges();
  }
}
