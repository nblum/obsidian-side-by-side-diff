import { FileSystemAdapter, ItemView, Menu, Notice, TFile, setIcon, setTooltip } from "obsidian";
import { join, relative } from "node:path";
import type { TAbstractFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { applyAlignedRowChange, convertLineEndings, getDiffRowKey, getDiffRowType, getIgnoredDiffRow, getInlineDiffTokens, getLineSyncPlan, joinLines, serializeEditableLines, splitLines, swapDiffRowKey, type DiffDirection, type IndexedDiffRow, type InlineDiffToken } from "./diff-core";
import { createComparisonModelFromLines, createIndexedDiffRowsFromLines, type ComparisonOptions, type ComparisonRowModel } from "./diff-model";
import { clearChangeTargetMetadata, getAutoAdvanceTargetPosition, getChangeKeyboardAction, getNextChangeIndex, isUndoShortcut, type ChangeNavigationDirection } from "./diff-navigation";
import { DeleteChangeCopyModal, DeleteIdenticalFileModal, FilePickerModal, UnsavedChangesModal } from "./modals";
import { createGuardedSaveTransform, SaveConflictError } from "./save-guard";
import { isTextFile, VIEW_TYPE } from "./file-utils";
import { getRecentFiles } from "./recent-files";
import { parseDroppedVaultLink } from "./dropped-vault-link";
import { getDroppedFilePath, getDroppedFileHandle, getVaultRelativePath, readExternalMarkdown, processExternalMarkdown, type ExternalMarkdown, type ExternalFileHandle } from "./external-markdown";
import { hasEditableLineStructureChanged } from "./edit-sync";
import { shouldOfferProposalCleanup } from "./proposal-cleanup";
import { DiffSession, hasUnsavedComparisonChanges } from "./diff-session";
import { countGroupChangedRows, getActionableRowIndexes, groupChangeRows, GROUP_HEADER_THRESHOLD, type ChangeRowGroup } from "./diff-grouping";
import { parseDiffViewState, swapDiffViewState, type DiffViewState } from "./diff-view-state";
import { writePendingChanges, type FileSaveResult, type PendingSaveResult } from "./pending-save";
import { createPendingTargetPreview, type PendingTargetPreview } from "./pending-diff";
import type { Language } from "./i18n";

export type { PaneMode } from "./diff-view-state";
type ComparisonFile = TFile | ExternalMarkdown;

interface LoadedComparison {
  leftContent: string;
  rightContent: string | null;
}

type EditableSide = "left" | "right";
type EditableRowType = "equal" | "added" | "removed" | "changed";

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

/** Tracks the target editor; legacy right-side names refer to normalized editor data. */
interface RightEditorState {
  editor: HTMLElement;
  initialValue: string;
  observer: MutationObserver;
  resizeObserver: ResizeObserver;
}

interface ChangeActions {
  accept: () => void;
  reject: () => void;
}

interface DiffViewPlugin {
  readonly language: Language;
  readonly settings: { autoAdvanceAfterChange: boolean; defaultApplyDirection: DiffDirection; alignMarkdownByHeadings: boolean; changeCopySuffix: string; recentRightFilePaths: string[] };
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
  private readonly session = new DiffSession();
  private viewState: DiffViewState = { leftPath: null, rightPath: null, editRight: false, mode: "compare" };
  private externalMarkdown: ExternalMarkdown | null = null;
  private retainedExternalMarkdown: ExternalMarkdown | null = null;
  private dropToken = 0;
  private renderToken = 0;
  private comparisonOptions: ComparisonOptions = {};
  private readonly changeActions = new Map<number, ChangeActions>();
  private rightEditorState: RightEditorState | null = null;
  private rightEditorDirty = false;
  private saveButton: HTMLButtonElement | null = null;
  private editInputSnapshot: EditInputSnapshot | null = null;
  private editSyncFrame: number | null = null;
  private pendingEditSyncPreferredIndex: number | null = null;
  private saveRequestInProgress = false;
  private activeChangeRowIndex: number | null = null;
  private previousChangeButton: HTMLButtonElement | null = null;
  private nextChangeButton: HTMLButtonElement | null = null;
  private directionButton: HTMLButtonElement | null = null;
  private pendingTargetPreview: PendingTargetPreview | null = null;
  private renderedPendingDeletions = new Set<number>();

  /** Exposes the current comparison state without allowing external mutation. */
  get state(): Readonly<DiffViewState> {
    return { ...this.viewState };
  }

  /** Keeps proposal workflows fixed while allowing ordinary comparisons to merge either way. */
  get applyDirection(): DiffDirection {
    return this.state.mode === "compare" && this.state.direction === "right-to-left" ? "right-to-left" : "left-to-right";
  }

  /** Resolves the current target without changing either file's physical position. */
  get targetPath(): string | null {
    return this.applyDirection === "left-to-right" ? this.state.rightPath : this.state.leftPath;
  }

  /** Returns the only file eligible for merging or direct editing. */
  getTargetFile(): ComparisonFile | null {
    return this.targetPath === null ? null : this.getComparisonFile(this.targetPath);
  }

  /** Checks the actual merge target rather than assuming every external file is a target. */
  canApplyChange(): boolean {
    const file = this.getTargetFile();
    return file !== null && (file instanceof TFile || file.handle !== null);
  }

  /** Reverses merging without moving files; saved or discarded decisions start a fresh review. */
  async reverseApplyDirection(): Promise<void> {
    if (this.state.mode !== "compare" || this.state.editRight || this.state.rightPath === null) return;
    if (this.hasUnsavedChanges()) {
      new Notice(this.translate("notice.saveFirst"));
      return;
    }
    const scrollPosition = this.getScrollPosition();
    this.viewState = { ...this.viewState, direction: this.applyDirection === "left-to-right" ? "right-to-left" : "left-to-right" };
    this.session.replaceDismissedRows([]);
    this.session.clearUndoStack();
    this.activeChangeRowIndex = null;
    await this.renderDiff(scrollPosition);
  }

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
    this.registerDomEvent(this.contentEl, "dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files") === true) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    this.registerDomEvent(this.contentEl, "drop", (event) => {
      if (event.dataTransfer?.types.includes("Files") !== true) return;
      event.preventDefault();
      event.stopPropagation();
      const item = Array.from(event.dataTransfer.items).find((entry) => entry.kind === "file");
      void this.dropMarkdown(Array.from(event.dataTransfer.files), getDroppedFileHandle(item));
    });
    this.registerDomEvent(this.contentEl, "beforeinput", (event) => { this.handleBeforeInput(event); });
    this.registerDomEvent(this.contentEl, "input", (event) => { this.handleInput(event); });
    this.registerDomEvent(this.contentEl.ownerDocument, "copy", (event) => { this.handleCopy(event); });
    this.registerDomEvent(this.contentEl, "pointerdown", (event) => { this.handleSelectionStart(event); });
    this.registerEvent(this.app.vault.on("modify", (file) => { this.refreshForPath(file.path); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.handleRename(file, oldPath); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { this.refreshForPath(file.path); }));
  }
  /** Resolves the dragged vault link and opens a different text file in the right pane. */
  async dropVaultFile(leftFile: ComparisonFile, text: string): Promise<void> {
    const link = parseDroppedVaultLink(text, this.app.vault.getName());
    if (link === null) {
      new Notice(this.translate("notice.selectedFileLoadFailed"));
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(link)
      ?? this.app.metadataCache.getFirstLinkpathDest(link, leftFile.path);
    if (!isTextFile(file)) {
      new Notice(this.translate("notice.selectedFileLoadFailed"));
      return;
    }
    if (file.path === leftFile.path) {
      new Notice(this.translate("notice.differentFiles"));
      return;
    }
    const token = ++this.dropToken;
    if (!await this.prepareForTransition(this.translate("modal.unsaved.dropQuestion"), () => Promise.resolve(token === this.dropToken))) return;
    if (token !== this.dropToken) return;
    await this.applyRightFile(leftFile, file);
  }
  /** Replaces the right file with a dropped Markdown file, preserving the current left file. */
  async dropMarkdown(files: readonly File[], droppedHandle: Promise<ExternalFileHandle | null> = Promise.resolve(null)): Promise<void> {
    const file = files[0];
    if (files.length !== 1 || !file || !/\.md$/i.test(file.name)) {
      new Notice(this.translate("notice.dropMarkdownOnly"));
      return;
    }
    const token = ++this.dropToken;
    try {
      const [content, handle] = await Promise.all([file.text(), droppedHandle]);
      if (token !== this.dropToken) return;
      const leftPath = this.state.leftPath;
      const leftFile = leftPath === null ? null : this.getComparisonFile(leftPath);
      if (leftFile === null) return;
      const candidate: ExternalMarkdown = { path: `external-markdown:${token.toString()}`, name: file.name, extension: "md", content, handle, diskPath: getDroppedFilePath(file) };
      const rightFile = this.resolveDroppedFile(candidate);
      const sameFile = await this.isSameComparisonFile(leftFile, rightFile);
      if (token !== this.dropToken) return;
      if (sameFile) {
        new Notice(this.translate("notice.differentFiles"));
        return;
      }
      let loaded = await this.loadComparison(leftFile, rightFile);
      if (token !== this.dropToken) return;
      const hadUnsavedChanges = this.hasUnsavedChanges();
      const validateDrop = async (): Promise<boolean> => {
        if (token !== this.dropToken) return false;
        if (hadUnsavedChanges) {
          loaded = await this.loadComparison(leftFile, rightFile);
          const sameFileNow = await this.isSameComparisonFile(leftFile, rightFile);
          if (token !== this.dropToken) return false;
          if (sameFileNow) {
            new Notice(this.translate("notice.differentFiles"));
            return false;
          }
        }
        return token === this.dropToken;
      };
      if (!await this.prepareForTransition(this.translate("modal.unsaved.dropQuestion"), validateDrop)) return;
      if (token !== this.dropToken) return;
      // A confirmation/save may take time or update a compared file. Validate again
      // before replacing the session, keeping the old view on a failed native read.
      if (hadUnsavedChanges) loaded = await this.loadComparison(leftFile, rightFile);
      if (token !== this.dropToken) return;
      if (!(rightFile instanceof TFile)) rightFile.content = loaded.rightContent ?? content;
      this.session.reset();
      this.activeChangeRowIndex = null;
      this.retainedExternalMarkdown = leftFile instanceof TFile ? null : leftFile;
      this.externalMarkdown = rightFile instanceof TFile ? null : rightFile;
      this.viewState = parseDiffViewState({ leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" }, this.plugin.settings.defaultApplyDirection);
      await this.renderDiff(null, loaded);
    } catch (error) {
      if (token !== this.dropToken) return;
      console.error("Side-by-Side Diff could not read dropped Markdown", error);
      new Notice(this.translate("notice.dropReadFailed"));
    }
  }
  /** Converts drops within the desktop vault to the existing Obsidian file object. */
  resolveDroppedFile(file: ExternalMarkdown): ComparisonFile {
    const adapter = this.app.vault.adapter;
    if (file.diskPath !== null && adapter instanceof FileSystemAdapter) {
      const path = getVaultRelativePath(file.diskPath, adapter.getBasePath());
      const vaultFile = path === null ? null : this.app.vault.getAbstractFileByPath(path);
      if (isTextFile(vaultFile)) return vaultFile;
    }
    return file;
  }
  /** Returns a native path solely for matching a dropped file with a vault file. */
  getComparisonDiskPath(file: ComparisonFile): string | null {
    if (!(file instanceof TFile)) return file.diskPath;
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? join(adapter.getBasePath(), file.path) : null;
  }
  /** Rejects matching native paths and browser handles for the same entry. */
  async isSameComparisonFile(left: ComparisonFile, right: ComparisonFile): Promise<boolean> {
    if (left.path === right.path) return true;
    const leftPath = this.getComparisonDiskPath(left);
    const rightPath = this.getComparisonDiskPath(right);
    if (leftPath !== null && rightPath !== null && relative(leftPath, rightPath) === "") return true;
    if (!(left instanceof TFile) && !(right instanceof TFile) && left.handle !== null && right.handle !== null) {
      return left.handle.isSameEntry(right.handle);
    }
    return false;
  }
  /** Loads both inputs before committing a dropped comparison to the view. */
  async loadComparison(left: ComparisonFile, right: ComparisonFile | null): Promise<LoadedComparison> {
    const [leftContent, rightContent] = await Promise.all([
      this.readComparisonFile(left), right === null ? Promise.resolve(null) : this.readComparisonFile(right)
    ]);
    return { leftContent, rightContent };
  }
  /** Refuses stale actions rather than reinterpreting displayed row indexes against new disk content. */
  async readChangeContents(left: ComparisonFile, right: ComparisonFile): Promise<LoadedComparison | null> {
    const token = this.renderToken;
    const loaded = await this.loadComparison(left, right);
    if (token !== this.renderToken || this.state.leftPath !== left.path || this.state.rightPath !== right.path) return null;
    const changed = !(left instanceof TFile) && loaded.leftContent !== left.content ? left
      : !(right instanceof TFile) && loaded.rightContent !== right.content ? right : null;
    if (changed !== null) {
      new Notice(this.translate("notice.comparisonChanged", { name: changed.name }));
      await this.renderDiff(this.getScrollPosition());
      return null;
    }
    return loaded;
  }
  /** Resolves either pane without treating an external file as a vault file. */
  getComparisonFile(path: string): ComparisonFile | null {
    if (this.externalMarkdown?.path === path) return this.externalMarkdown;
    if (this.retainedExternalMarkdown?.path === path) return this.retainedExternalMarkdown;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }
  /** Reads dropped files through browser handles and vault files through Obsidian. */
  readComparisonFile(file: ComparisonFile): Promise<string> {
    return file instanceof TFile ? this.app.vault.cachedRead(file) : readExternalMarkdown(file);
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
      if (this.externalMarkdown?.path === path) return this.externalMarkdown.name;
      if (this.retainedExternalMarkdown?.path === path) return this.retainedExternalMarkdown.name;
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
    const externalPaths = [this.externalMarkdown?.path, this.retainedExternalMarkdown?.path];
    const hasExternal = externalPaths.some((path) => path !== undefined && (path === this.state.leftPath || path === this.state.rightPath));
    if (hasExternal) {
      const vaultPath = [this.state.leftPath, this.state.rightPath].find((path) => path !== null && !externalPaths.includes(path)) ?? null;
      return { leftPath: vaultPath, rightPath: null, editRight: false, mode: "compare" };
    }
    return { ...this.state };
  }
  /** Stores new paths and redraws the comparison. */
  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const nextState = parseDiffViewState(state, this.plugin.settings.defaultApplyDirection);
    if (nextState.leftPath !== this.externalMarkdown?.path && nextState.rightPath !== this.externalMarkdown?.path) this.externalMarkdown = null;
    if (nextState.leftPath !== this.retainedExternalMarkdown?.path && nextState.rightPath !== this.retainedExternalMarkdown?.path) this.retainedExternalMarkdown = null;
    this.dropToken += 1;
    this.viewState = nextState;
    await this.renderDiff();
  }
  /** Renders the initial comparison when the leaf opens. */
  override async onOpen(): Promise<void> {
    await this.renderDiff();
  }
  /** Clears the view when its leaf closes. */
  override async onClose(): Promise<void> {
    this.dropToken += 1;
    if (this.state.editRight && this.rightEditorState?.editor) {
      this.synchronizeEditablePanes(this.rightEditorState.editor);
    }
    if (this.hasUnsavedChanges()) {
      const choice = await new UnsavedChangesModal(this.app, this.translate.bind(this)).waitForChoice();
      if (choice === "save") {
        if (!await this.saveChangesBeforeClose()) {
          return;
        }
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
    this.rightEditorDirty = true;
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
    const leftCount = leftPane.children.length;
    const rightCount = editor.children.length;
    if (hasEditableLineStructureChanged(event.inputType, snapshot?.rightCount ?? null, rightCount) || leftCount !== rightCount) {
      this.scheduleEditablePaneSync(editor, snapshot?.preferredIndex ?? null);
    }
    this.updateSaveButtonState();
  }
  /** Schedules a post-edit alignment pass after the browser has finished changing the DOM. */
  scheduleEditablePaneSync(editor: HTMLElement, preferredIndex: number | null = null): void {
    if (preferredIndex !== null) {
      this.pendingEditSyncPreferredIndex = preferredIndex;
    }
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
      const requestedIndex = this.pendingEditSyncPreferredIndex;
      this.pendingEditSyncPreferredIndex = null;
      this.synchronizeEditablePanes(editor, requestedIndex ?? snapshot?.preferredIndex ?? null);
    });
  }
  /** Disconnects the observer used to keep the two editable panes aligned. */
  disposeRightEditorObserver(): void {
    this.rightEditorState?.observer.disconnect();
    this.rightEditorState?.resizeObserver.disconnect();
    this.rightEditorState = null;
    this.saveButton = null;
    if (this.editSyncFrame !== null) {
      this.contentEl.ownerDocument.defaultView?.cancelAnimationFrame(this.editSyncFrame);
      this.editSyncFrame = null;
    }
    this.editInputSnapshot = null;
    this.pendingEditSyncPreferredIndex = null;
    this.rightEditorDirty = false;
  }
  /** Keeps native text selection in the comparison pane where the pointer starts. */
  handleSelectionStart(event: PointerEvent): void {
    if (this.state.editRight || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const code = target.closest<HTMLElement>(".file-diff-sbs-code[data-diff-side]");
    const grid = code?.closest<HTMLElement>(".file-diff-sbs-grid");
    const side = code?.dataset.diffSide;
    if (!grid || (side !== "left" && side !== "right") || !this.contentEl.contains(grid)) return;
    if (grid.dataset.diffSelectionSide !== side) {
      this.contentEl.ownerDocument.getSelection()?.removeAllRanges();
      grid.dataset.diffSelectionSide = side;
    }
  }
  /** Copies a selection within one comparison side without the other file or alignment gaps. */
  handleCopy(event: ClipboardEvent): void {
    if (this.state.editRight || !event.clipboardData) return;
    const selection = this.contentEl.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
    const endElement = range.endContainer.nodeType === 1 ? range.endContainer as Element : range.endContainer.parentElement;
    const start = startElement?.closest<HTMLElement>(".file-diff-sbs-code");
    const end = endElement?.closest<HTMLElement>(".file-diff-sbs-code");
    const side = start?.dataset.diffSide;
    if (!start || !end || (side !== "left" && side !== "right") || end.dataset.diffSide !== side || !this.contentEl.contains(start) || !this.contentEl.contains(end)) return;
    const codes = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`.file-diff-sbs-code[data-diff-side='${side}']`));
    const startIndex = codes.indexOf(start);
    const endIndex = codes.indexOf(end);
    if (startIndex < 0 || endIndex < startIndex) return;
    const selectedCodes = codes.slice(startIndex, endIndex + 1);
    const lines = selectedCodes.filter((code) => code.dataset.diffPresent === "true").map((code) => {
      const part = range.cloneRange();
      part.selectNodeContents(code);
      if (code === start) part.setStart(range.startContainer, range.startOffset);
      if (code === end) part.setEnd(range.endContainer, range.endOffset);
      return part.toString();
    });
    if (lines.length === 0) {
      if (selectedCodes.some(code => code.dataset.diffPreview === "delete")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.clipboardData.setData("text/plain", lines.join("\n"));
    event.preventDefault();
    event.stopPropagation();
  }
  /** Handles keyboard editing actions inside the comparison view. */
  handleKeydown(event: KeyboardEvent): void {
    if (!this.state.editRight && isUndoShortcut(event.key, event.ctrlKey, event.metaKey, event.shiftKey) && this.session.canUndo()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.undoLastChange();
      return;
    }
    const changeAction = getChangeKeyboardAction(event.key, event.altKey, event.ctrlKey, event.metaKey, event.shiftKey);
    if (!this.state.editRight && (changeAction === "next" || changeAction === "previous")) {
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
    const nextState = { ...this.viewState };
    if (nextState.leftPath === oldPath) {
      nextState.leftPath = file.path;
      changed = true;
    }
    if (nextState.rightPath === oldPath) {
      nextState.rightPath = file.path;
      changed = true;
    }
    this.viewState = nextState;
    this.session.migratePath(oldPath, file.path);
    if (changed) {
      void this.renderDiff(this.getScrollPosition());
    }
  }
  /** Loads the active comparison or the initial left-hand file selection. */
  async renderDiff(scrollPosition: ScrollPosition | null = null, loaded: LoadedComparison | null = null): Promise<void> {
    this.disposeRightEditorObserver();
    const token = ++this.renderToken;
    this.previousChangeButton = null;
    this.nextChangeButton = null;
    this.directionButton = null;
    this.changeActions.clear();
    this.contentEl.empty();
    this.contentEl.addClass("file-diff-sbs-view");
    const leftPath = this.state.leftPath;
    if (leftPath === null) {
      this.renderMessage(this.translate("view.leftUnavailable"));
      return;
    }
    const leftFile = this.getComparisonFile(leftPath);
    if (leftFile === null) {
      this.renderMessage(this.translate("view.leftUnavailable"));
      return;
    }
    try {
      const storedLeftContent = loaded?.leftContent ?? await this.readComparisonFile(leftFile);
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      if (token !== this.renderToken) {
        return;
      }
      const rightPath = this.state.rightPath;
      if (rightPath === null) {
        if (!(leftFile instanceof TFile)) leftFile.content = storedLeftContent;
        this.buildSelectionLayout(leftFile, splitLines(leftContent));
        this.restoreScrollPosition(scrollPosition);
        return;
      }
      const rightFile = this.getComparisonFile(rightPath);
      if (rightFile === null) {
        this.renderMessage(this.translate("view.rightUnavailable"));
        return;
      }
      const storedRightContent = loaded?.rightContent ?? await this.readComparisonFile(rightFile);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      if (token !== this.renderToken) {
        return;
      }
      if (!(leftFile instanceof TFile)) leftFile.content = storedLeftContent;
      if (!(rightFile instanceof TFile)) rightFile.content = storedRightContent;
      const leftLines = splitLines(leftContent);
      const rightLines = splitLines(rightContent);
      if (this.state.editRight) {
        // Keep the first snapshot so a later rerender cannot hide an external edit.
        const targetFile = this.applyDirection === "left-to-right" ? rightFile : leftFile;
        this.session.captureSaveBaseline(targetFile.path, this.applyDirection === "left-to-right" ? storedRightContent : storedLeftContent);
        // Comparison rows omit the terminal empty line; the editor needs it to retain the final line break.
        const targetContent = this.applyDirection === "left-to-right" ? rightContent : leftContent;
        if (/(?:\r\n|\r|\n)$/.test(targetContent)) {
          (this.applyDirection === "left-to-right" ? rightLines : leftLines).push("");
        }
      }
      this.buildLayout(leftFile, rightFile, leftLines, rightLines);
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
    if (this.state.editRight) {
      return false;
    }
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
  /** Returns the ordered target position for a row before it is resolved. */
  getChangeTargetPosition(rowIndex: number): number | null {
    const position = [...this.getChangeTargets().keys()].indexOf(rowIndex);
    return position >= 0 ? position : null;
  }
  /** Opens a file picker for the right-hand pane. */
  selectRightFile(leftFile: ComparisonFile): void {
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
  async applyRightFile(leftFile: ComparisonFile, rightFile: TFile): Promise<void> {
    this.dropToken += 1;
    const nextState = parseDiffViewState({ leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" }, this.plugin.settings.defaultApplyDirection);
    this.viewState = nextState;
    this.activeChangeRowIndex = null;
    this.session.reset();
    void this.plugin.rememberRecentRightFile(rightFile);
    try {
      await this.renderDiff();
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Auswahl nicht anwenden.", error);
      new Notice(this.translate("notice.selectedFileLoadFailed"));
    }
  }
  /** Enables direct editing for the current target while keeping the source read-only. */
  async enableRightEditMode(): Promise<void> {
    if (this.targetPath === null || this.state.editRight) {
      return;
    }
    const rightFile = this.getTargetFile();
    if (rightFile === null || (!(rightFile instanceof TFile) && rightFile.handle === null)) return;
    if (!await this.prepareForTransition(this.translate("modal.unsaved.editQuestion"))) {
      return;
    }
    await this.setState({ ...this.state, editRight: true }, { history: false });
  }
  /** Leaves editing without discarding unsaved target changes. */
  async disableRightEditMode(): Promise<void> {
    if (!this.state.editRight) {
      return;
    }
    const hasUnsavedChanges = this.rightEditorState !== null && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    if (hasUnsavedChanges) {
      new Notice(this.translate("notice.saveFirst"));
      return;
    }
    if (this.targetPath !== null) {
      this.session.removeSaveBaseline(this.targetPath);
    }
    await this.setState({ ...this.state, editRight: false }, { history: false });
  }
  /** Returns whether editing or diff actions have produced unsaved changes. */
  hasUnsavedChanges(): boolean {
    const editorChanged = this.state.editRight && this.rightEditorState !== null && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    return hasUnsavedComparisonChanges(editorChanged, this.hasPendingChanges());
  }
  /** Writes all current changes without rebuilding the view during close. */
  async saveChangesBeforeClose(): Promise<boolean> {
    try {
      if (this.state.editRight && this.rightEditorState) {
        const editor = this.rightEditorState.editor;
        const rightPath = this.targetPath;
        if (rightPath === null) {
          new Notice(this.translate("view.targetUnavailable"));
          return false;
        }
        const rightFile = this.getComparisonFile(rightPath);
        if (rightFile === null) {
          new Notice(this.translate("view.targetUnavailable"));
          return false;
        }
        const saved = await this.processUnchangedFile(rightFile, (currentContent) => {
          return convertLineEndings(this.serializeRightEditor(editor), currentContent);
        });
        if (saved !== "saved") {
          return false;
        }
        this.session.removePendingChange(rightFile.path);
        this.rightEditorState.initialValue = this.serializeRightEditor(editor);
      }
      if (this.hasPendingChanges()) {
        const result = await this.writePendingChanges();
        if (result === "unavailable") {
          new Notice(this.translate("notice.pendingFileUnavailable"));
        }
        if (result !== "saved") {
          return false;
        }
      }
      this.session.clearUndoStack();
      return true;
    } catch (error) {
      console.error("Side-by-Side Diff konnte \xC4nderungen vor dem Schlie\xDFen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
      return false;
    }
  }
  /** Saves the editable target through its captured baseline, regardless of screen side. */
  async saveRightEdits(): Promise<boolean> {
    if (!this.hasRightEditorChanges()) {
      return true;
    }
    const scrollPosition = this.getScrollPosition();
    const rightPath = this.targetPath;
    if (rightPath === null) {
      new Notice(this.translate("view.targetUnavailable"));
      return false;
    }
    const rightFile = this.getComparisonFile(rightPath);
    if (rightFile === null) {
      new Notice(this.translate("view.targetUnavailable"));
      return false;
    }
    try {
      const editor = this.rightEditorState?.editor;
      if (!editor) {
        return false;
      }
      const saved = await this.processUnchangedFile(rightFile, (currentContent) => {
        return convertLineEndings(this.serializeRightEditor(editor), currentContent);
      });
      if (saved !== "saved") {
        return false;
      }
      this.session.removePendingChange(rightFile.path);
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
      return true;
    } catch (error) {
      console.error("Side-by-Side Diff konnte die rechten \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
      return false;
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
      this.scheduleEditablePaneSync(editor, newLineIndex);
    }
    this.rightEditorDirty = true;
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
  /** Finds the read-only source pane beside the editable target. */
  getEditableLeftPane(editor: HTMLElement): HTMLElement | null {
    const grid = editor.closest<HTMLElement>(".file-diff-sbs-edit-grid");
    return grid?.querySelector<HTMLElement>(".file-diff-sbs-edit-reference-pane") ?? null;
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
    this.observeEditableLineSizes(editor);
  }
  /** Matches paired line heights so wrapped content keeps following rows aligned. */
  synchronizeEditableLineHeights(editor: HTMLElement): void {
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
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
    // Measure every natural height before applying any paired minimums.
    const heights = Array.from({ length: lineCount }, (_, index) => Math.max(
      leftLines[index]?.getBoundingClientRect().height ?? 0,
      rightLines[index]?.getBoundingClientRect().height ?? 0
    ));
    for (let index = 0; index < lineCount; index += 1) {
      const leftLine = leftLines[index];
      const rightLine = rightLines[index];
      const height = heights[index] ?? 0;
      if (leftLine && rightLine && height > 0) {
        const heightValue = `${height.toString()}px`;
        leftLine.setCssProps({ "--file-diff-sbs-line-min-height": heightValue });
        rightLine.setCssProps({ "--file-diff-sbs-line-min-height": heightValue });
      }
    }
    // Clearing minimum heights temporarily collapses wrapped rows. Resolve the final
    // layout before restoring the viewport so scroll anchoring cannot accumulate jumps.
    editor.getBoundingClientRect();
    this.restoreScrollPosition(scrollPosition);
  }
  /** Observes editable rows so wrapped text realigns only after an actual size change. */
  observeEditableLineSizes(editor: HTMLElement): void {
    const resizeObserver = this.rightEditorState?.editor === editor ? this.rightEditorState.resizeObserver : null;
    if (!resizeObserver) {
      return;
    }
    for (const line of this.getEditableLines(editor)) {
      resizeObserver.observe(line);
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
  /** Creates a blank read-only line that preserves source-pane vertical alignment. */
  createEditableLeftGap(parent: HTMLElement): HTMLElement {
    const cell = parent.createDiv({ cls: "file-diff-sbs-cell file-diff-sbs-edit-gap" });
    cell.createSpan({ cls: "file-diff-sbs-line-number" });
    cell.createSpan({ cls: "file-diff-sbs-code", text: " " });
    return cell;
  }
  /** Creates a blank editable line that preserves target-pane vertical alignment. */
  createEditableRightGap(parent: HTMLElement): HTMLElement {
    const line = this.buildEditableRightLine(parent, { left: "", right: "", equal: true, leftIndex: 0, rightIndex: 0, leftLineNumber: null, rightLineNumber: null });
    line.dataset.rightPresent = "false";
    line.classList.add("file-diff-sbs-edit-gap");
    return line;
  }
  /** Updates target line numbers after a manual line insertion. */
  updateEditableLineNumbers(editor: HTMLElement): void {
    let lineNumber = 0;
    for (const line of this.getEditableLines(editor)) {
      const numberElement = line.querySelector(".file-diff-sbs-edit-line-number");
      if (!numberElement) {
        continue;
      }
      const isGap = line.dataset.rightPresent === "false";
      if (!isGap) {
        lineNumber += 1;
      }
      const label = isGap ? "" : String(lineNumber);
      // Replacing unchanged text retriggers the editor's childList observer indefinitely.
      if (numberElement.textContent !== label) {
        numberElement.textContent = label;
      }
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
    return this.session.getDisplayedContent(path, storedContent);
  }
  /** Processes a file only when its save snapshot still matches the process input. */
  async processUnchangedFile(file: ComparisonFile, transform: (currentContent: string) => string): Promise<FileSaveResult> {
    let observedContent: string | undefined;
    try {
      const guardedTransform = (currentContent: string): string => {
        observedContent = currentContent;
        return createGuardedSaveTransform(this.session.getSaveBaseline(file.path), transform)(currentContent);
      };
      if (file instanceof TFile) {
        await this.app.vault.process(file, guardedTransform);
      } else {
        await processExternalMarkdown(file, guardedTransform);
      }
    } catch (error) {
      if (!(error instanceof SaveConflictError)) {
        throw error;
      }
      if (observedContent !== undefined) {
        // A second explicit Save retries against the content the user was warned about.
        this.session.refreshSaveBaseline(file.path, observedContent);
      }
      new Notice(this.translate("notice.externalChange", { name: file.name }));
      return "conflict";
    }
    this.session.removeSaveBaseline(file.path);
    return "saved";
  }
  /** Returns whether the comparison contains changes waiting to be saved. */
  hasPendingChanges(): boolean {
    return this.session.hasPendingChanges();
  }
  /** Writes pending comparison changes and clears them after all files succeed. */
  async writePendingChanges(): Promise<PendingSaveResult> {
    return writePendingChanges(
      this.session.getPendingChanges(),
      (path) => {
        return this.getComparisonFile(path);
      },
      (file, content) => this.processUnchangedFile(file, () => content),
      (path) => { this.session.removePendingChange(path); }
    );
  }
  /** Saves all changes staged through the comparison controls. */
  async savePendingChanges(promptForProposalCleanup = true): Promise<boolean> {
    if (!this.hasPendingChanges()) {
      return true;
    }
    const scrollPosition = this.getScrollPosition();
    try {
      const result = await this.writePendingChanges();
      if (result === "unavailable") {
        new Notice(this.translate("notice.pendingFileUnavailable"));
      }
      if (result !== "saved") {
        return false;
      }
      this.session.clearUndoStack();
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
      if (promptForProposalCleanup) {
        this.maybePromptDeleteChangeCopy();
      }
      return true;
    } catch (error) {
      console.error("Side-by-Side Diff konnte vorgemerkte \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
      return false;
    }
  }
  /** Stages one changed aligned row for saving instead of modifying a file immediately. */
  async applyRowChange(rowIndex: number, direction: DiffDirection): Promise<void> {
    if (this.state.mode !== "compare" && direction !== "left-to-right") return;
    const scrollPosition = this.getScrollPosition();
    const targetPosition = this.getChangeTargetPosition(rowIndex);
    const leftPath = this.state.leftPath;
    const rightPath = this.state.rightPath;
    if (leftPath === null || rightPath === null) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    const leftFile = this.getComparisonFile(leftPath);
    const rightFile = this.getComparisonFile(rightPath);
    if (leftFile === null || rightFile === null) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    try {
      const loaded = await this.readChangeContents(leftFile, rightFile);
      if (loaded === null || loaded.rightContent === null) return;
      const { leftContent: storedLeftContent, rightContent: storedRightContent } = loaded;
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      const rows = createIndexedDiffRowsFromLines(splitLines(leftContent), splitLines(rightContent), this.comparisonOptions);
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
      if (!(targetFile instanceof TFile) && targetFile.handle === null) return;
      const targetContent = leftToRight ? rightContent : leftContent;
      const targetLines = leftToRight ? nextRightLines : nextLeftLines;
      const targetBaseline = leftToRight ? storedRightContent : storedLeftContent;
      this.session.stageChange(targetFile.path, joinLines(targetLines, targetContent), targetBaseline);
      new Notice(this.translate("notice.staged"));
      await this.renderDiff(scrollPosition);
      if (this.state.mode === "accept" && direction === "left-to-right") {
        this.session.markProposalChangeAccepted();
      }
      this.advanceAfterResolvedChange(targetPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die \xC4nderung nicht \xFCbernehmen.", error);
      new Notice(this.translate("notice.changeFailed"));
    }
  }
  /** Stages every changed row inside a bridged block at once, in the same direction. */
  async applyGroupChange(startIndex: number, endIndex: number, direction: DiffDirection): Promise<void> {
    if (this.state.mode !== "compare" && direction !== "left-to-right") return;
    const scrollPosition = this.getScrollPosition();
    const targetPosition = this.getChangeTargetPosition(startIndex);
    const leftPath = this.state.leftPath;
    const rightPath = this.state.rightPath;
    if (leftPath === null || rightPath === null) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    const leftFile = this.getComparisonFile(leftPath);
    const rightFile = this.getComparisonFile(rightPath);
    if (leftFile === null || rightFile === null) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    try {
      const loaded = await this.readChangeContents(leftFile, rightFile);
      if (loaded === null || loaded.rightContent === null) return;
      const { leftContent: storedLeftContent, rightContent: storedRightContent } = loaded;
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      const rows = createIndexedDiffRowsFromLines(splitLines(leftContent), splitLines(rightContent), this.comparisonOptions);
      // Skip rows the user already resolved individually - "Accept all" must not silently
      // reverse a change they explicitly dismissed.
      const actionableIndexes = getActionableRowIndexes(rows, startIndex, endIndex, (row) => this.session.hasDismissedRow(getDiffRowKey(row)));
      if (actionableIndexes.length === 0) {
        return;
      }
      // Apply from the last row to the first so earlier, not-yet-processed row indexes stay valid
      // while splices from later rows shift everything after them.
      let leftLines = splitLines(leftContent);
      let rightLines = splitLines(rightContent);
      for (let position = actionableIndexes.length - 1; position >= 0; position -= 1) {
        const rowIndex = actionableIndexes[position];
        const row = rowIndex === undefined ? undefined : rows[rowIndex];
        if (!row) {
          continue;
        }
        ({ leftLines, rightLines } = applyAlignedRowChange(leftLines, rightLines, row, direction));
      }
      const leftToRight = direction === "left-to-right";
      const targetFile = leftToRight ? rightFile : leftFile;
      if (!(targetFile instanceof TFile) && targetFile.handle === null) return;
      const targetContent = leftToRight ? rightContent : leftContent;
      const targetLines = leftToRight ? rightLines : leftLines;
      const targetBaseline = leftToRight ? storedRightContent : storedLeftContent;
      this.session.stageChange(targetFile.path, joinLines(targetLines, targetContent), targetBaseline);
      new Notice(this.translate("notice.staged"));
      await this.renderDiff(scrollPosition);
      if (this.state.mode === "accept" && direction === "left-to-right") {
        this.session.markProposalChangeAccepted();
      }
      this.advanceAfterResolvedChange(targetPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte den Block nicht \xFCbernehmen.", error);
      new Notice(this.translate("notice.changeFailed"));
    }
  }
  /** Shows a short error message inside the view. */
  renderMessage(message: string): void {
    this.contentEl.createDiv({ cls: "file-diff-sbs-message", text: message });
  }
  /** Shows the left file and an inline picker before a right file is selected. */
  buildSelectionLayout(leftFile: ComparisonFile, leftLines: string[]): void {
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    const toolbar = root.createDiv({ cls: "file-diff-sbs-toolbar" });
    const title = toolbar.createDiv({ cls: "file-diff-sbs-title" });
    title.createSpan({
      text: this.translate("view.title.selection", {
        label: this.translate("view.labels.original"),
        name: leftFile.name
      }),
      cls: "file-diff-sbs-title-main"
    });
    title.createEl("small", { text: this.translate("view.selection.leftFixed") });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: this.translate("view.selection.none") });
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    this.buildFileHeader(header, leftFile, this.translate("view.labels.original"));
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
    const dropCard = rightPane.createDiv({ cls: "file-diff-sbs-picker-card file-diff-sbs-drop-card" });
    dropCard.createEl("h3", { text: this.translate("view.selection.dropFiles") });
    dropCard.createEl("p", { text: this.translate("view.dropMarkdown") });
    dropCard.addEventListener("dragover", (event) => {
      if (event.dataTransfer && ["text/plain", "text/uri-list"].some((type) => event.dataTransfer?.types.includes(type) === true)) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }
    });
    dropCard.addEventListener("drop", (event) => {
      if (!event.dataTransfer || event.dataTransfer.types.includes("Files")) return;
      const text = event.dataTransfer.getData("text/uri-list").split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith("#")).join("\n")
        || event.dataTransfer.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      void this.dropVaultFile(leftFile, text);
    });
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
      left: this.translate(this.state.originalSide === "right" ? "view.labels.comparison" : "view.labels.original"),
      right: this.translate(this.state.originalSide === "right" ? "view.labels.original" : "view.labels.comparison")
    };
  }
  /** Renders one file without diff decorations while the other pane is pending. */
  buildSingleFilePane(parent: HTMLElement, lines: string[]): void {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      this.buildCell(parent, line, line, index + 1, "left", "equal");
    }
  }
  /** Builds toolbar, file headers and the aligned diff rows. */
  buildLayout(leftFile: ComparisonFile, rightFile: ComparisonFile, leftLines: string[], rightLines: string[]): void {
    const targetPath = this.targetPath;
    const pending = this.session.getPendingChanges().find(change => change.path === targetPath);
    const savedTarget = targetPath === null ? undefined : this.session.getSaveBaseline(targetPath);
    this.pendingTargetPreview = !this.state.editRight && pending && savedTarget !== undefined
      ? createPendingTargetPreview(savedTarget, pending.content) : null;
    this.renderedPendingDeletions = new Set();
    const paneLabels = this.getPaneLabels();
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    // Actions reuse these rendered options even if the setting changes before a refresh.
    this.comparisonOptions = {
      alignMarkdownByHeadings: this.plugin.settings.alignMarkdownByHeadings && leftFile.extension.toLowerCase() === "md" && rightFile.extension.toLowerCase() === "md"
    };
    const rows = createComparisonModelFromLines(leftLines, rightLines, this.comparisonOptions).rows;
    const changedRows = rows.filter((row) => !row.equal);
    const dismissedCount = changedRows.filter((row) => this.session.hasDismissedRow(getDiffRowKey(row))).length;
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
    title.createSpan({ text: this.translate("commands.compareTwoFiles"), cls: "file-diff-sbs-title-main" });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: summary });
    toolbar.addClass("file-diff-sbs-comparison-toolbar");
    const actions = toolbar.createDiv({ cls: "file-diff-sbs-toolbar-actions" });
    const saveButton = actions.createEl("button", {
      text: this.translate(this.state.editRight ? "actions.saveRight" : "actions.savePending"),
      cls: "mod-cta file-diff-sbs-save-action"
    });
    saveButton.title = this.translate(this.state.editRight ? "actions.saveRightTitle" : "actions.savePendingTitle");
    saveButton.addEventListener("click", () => {
      if (this.state.editRight) void this.saveRightEdits();
      else void this.savePendingChanges();
    });
    this.saveButton = saveButton;
    const menuButton = actions.createEl("button", { cls: "clickable-icon" });
    menuButton.setAttribute("aria-label", this.translate("actions.fileMenu"));
    setTooltip(menuButton, this.translate("actions.fileMenu"));
    setIcon(menuButton, "ellipsis");
    menuButton.addEventListener("click", (event) => {
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle(this.translate("menu.refresh")).setIcon("refresh-cw").setDisabled(this.hasUnsavedChanges()).onClick(() => {
          if (!this.hasUnsavedChanges()) void this.renderDiff(this.getScrollPosition());
        });
      });
      menu.showAtMouseEvent(event);
    });
    this.updateSaveButtonState();
    if (!(rightFile instanceof TFile) && rightFile.handle === null) {
      root.createDiv({ cls: "file-diff-sbs-message", text: this.translate("view.externalReadOnly") });
    }
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    header.addClass("file-diff-sbs-comparison-header");
    const leftToRight = this.applyDirection === "left-to-right";
    const leftHeader = header.createDiv({ cls: "file-diff-sbs-header-file file-diff-sbs-left-file" });
    this.buildFileHeader(leftHeader, leftFile, paneLabels.left, this.state.editRight ? leftToRight ? "reference" : "edit" : leftToRight ? "source" : "target");
    const directionControl = header.createDiv({ cls: "file-diff-sbs-direction" });
    if (!this.state.editRight) {
      const swapButton = directionControl.createEl("button", { cls: "clickable-icon file-diff-sbs-swap-button" });
      swapButton.setAttribute("aria-label", this.translate("actions.swap"));
      setTooltip(swapButton, this.translate("actions.swapTitle"));
      setIcon(swapButton, "arrow-left-right");
      swapButton.disabled = this.externalMarkdown != null && this.externalMarkdown.handle === null;
      swapButton.addEventListener("click", () => { void this.swapFiles(); });
    }
    if (this.state.mode === "compare") {
      const button = directionControl.createEl("button", { cls: "clickable-icon file-diff-sbs-direction-button" });
      const label = this.translate("actions.reverseDirection");
      button.setAttribute("aria-label", label);
      setTooltip(button, label);
      setIcon(button, leftToRight ? "arrow-right" : "arrow-left");
      button.addEventListener("click", () => { void this.reverseApplyDirection(); });
      this.directionButton = button;
    }
    const rightHeader = header.createDiv({ cls: "file-diff-sbs-header-file file-diff-sbs-right-file" });
    this.buildFileHeader(rightHeader, rightFile, paneLabels.right, this.state.editRight ? leftToRight ? "edit" : "reference" : leftToRight ? "target" : "source");
    const targetHeader = leftToRight ? rightHeader : leftHeader;
    const editButton = targetHeader.createEl("button", { cls: "clickable-icon file-diff-sbs-file-edit-button" });
    editButton.setAttribute("aria-label", this.translate(this.state.editRight ? "actions.compareMode" : "actions.edit"));
    setTooltip(editButton, this.translate(this.state.editRight ? "actions.compareModeTitle" : "actions.editTitle"));
    setIcon(editButton, this.state.editRight ? "columns-2" : "pencil");
    editButton.disabled = !this.canApplyChange();
    editButton.addEventListener("click", () => {
      if (this.state.editRight) void this.disableRightEditMode();
      else void this.enableRightEditMode();
    });
    this.updateSaveButtonState();
    if (this.state.editRight) {
      root.createDiv({ cls: "file-diff-sbs-hint", text: this.translate("view.hint.edit") });
    }
    const allChangesResolved = !this.state.editRight && visibleChangedCount === 0 && (changedRows.length > 0 || this.hasPendingChanges());
    if (allChangesResolved) {
      this.buildResolvedMessage(root);
    } else if (changedRows.length === 0) {
      this.buildIdenticalMessage(root, leftFile, rightFile);
    }
    const reviewToolbar = root.createDiv({ cls: "file-diff-sbs-review-toolbar" });
    const reviewActions = reviewToolbar.createDiv({ cls: "file-diff-sbs-actions" });
    if (!this.state.editRight) {
      const undoButton = reviewActions.createEl("button", { cls: "clickable-icon" });
      undoButton.setAttribute("aria-label", this.translate("actions.undo"));
      setTooltip(undoButton, this.translate("actions.undoTitle"));
      setIcon(undoButton, "undo-2");
      undoButton.setAttribute("aria-keyshortcuts", "Ctrl+Z");
      undoButton.disabled = !this.session.canUndo();
      undoButton.addEventListener("click", () => { void this.undoLastChange(); });
    }
    const navigation = reviewActions.createDiv({ cls: "file-diff-sbs-navigation" });
    const previousChangeButton = navigation.createEl("button", { cls: "clickable-icon" });
    previousChangeButton.setAttribute("aria-label", this.translate("actions.previousChange"));
    setTooltip(previousChangeButton, this.translate("actions.previousChangeTitle"));
    setIcon(previousChangeButton, "arrow-up");
    previousChangeButton.setAttribute("aria-keyshortcuts", "Alt+ArrowUp");
    previousChangeButton.addEventListener("click", () => { this.navigateChange("previous"); });
    this.previousChangeButton = previousChangeButton;
    const nextChangeButton = navigation.createEl("button", { cls: "clickable-icon" });
    nextChangeButton.setAttribute("aria-label", this.translate("actions.nextChange"));
    setTooltip(nextChangeButton, this.translate("actions.nextChangeTitle"));
    setIcon(nextChangeButton, "arrow-down");
    nextChangeButton.setAttribute("aria-keyshortcuts", "Alt+ArrowDown");
    nextChangeButton.addEventListener("click", () => { this.navigateChange("next"); });
    this.nextChangeButton = nextChangeButton;
    const scroll = root.createDiv({ cls: "file-diff-sbs-scroll" });
    const grid = scroll.createDiv({
      cls: this.state.editRight ? "file-diff-sbs-edit-grid" : "file-diff-sbs-grid"
    });
    if (this.state.editRight) {
      this.buildEditableModeLayout(grid, rows);
      this.updateChangeNavigationState();
      return;
    }
    const changeGroups = new Map(groupChangeRows(rows).map((group) => [group.startIndex, group]));
    let index = 0;
    while (index < rows.length) {
      const group = changeGroups.get(index);
      if (group) {
        const unresolvedRowCount = countGroupChangedRows(rows, group, (row) => this.session.hasDismissedRow(getDiffRowKey(row)));
        // Once every row in the block is resolved (e.g. via "Ignore all"), stop wrapping it in a
        // group box - the underlying rows are still !equal, but there is nothing left to act on.
        const groupParent = unresolvedRowCount > 0 ? grid.createDiv({ cls: "file-diff-sbs-group" }) : grid;
        if (unresolvedRowCount > GROUP_HEADER_THRESHOLD) {
          this.buildGroupHeader(groupParent, rows, group, unresolvedRowCount);
        }
        for (let groupIndex = group.startIndex; groupIndex <= group.endIndex; groupIndex += 1) {
          this.renderDiffRow(groupParent, rows[groupIndex] ?? null, groupIndex);
        }
        index = group.endIndex + 1;
        continue;
      }
      this.renderDiffRow(grid, rows[index] ?? null, index);
      index += 1;
    }
    this.buildPendingDeletions(grid, this.applyDirection === "left-to-right" ? rightLines.length : leftLines.length);
    this.updateChangeNavigationState();
  }
  /** Shows removed saved target lines as non-copyable preview rows, outside unresolved-change navigation. */
  buildPendingDeletions(parent: HTMLElement, beforeLineIndex: number): void {
    const deletions = this.pendingTargetPreview?.deletions.get(beforeLineIndex);
    if (!deletions || this.renderedPendingDeletions.has(beforeLineIndex)) return;
    this.renderedPendingDeletions.add(beforeLineIndex);
    const targetSide = this.applyDirection === "left-to-right" ? "right" : "left";
    for (const deletion of deletions) {
      const row = parent.createDiv({ cls: "file-diff-sbs-row file-diff-sbs-pending-deletion" });
      for (const side of ["left", "right"] as const) {
        if (side === "right") row.createDiv({ cls: "file-diff-sbs-action-cell" });
        const isTarget = side === targetSide;
        const cell = this.buildCell(row, isTarget ? deletion.value : null, null, isTarget ? deletion.lineNumber : null, side, "equal");
        if (isTarget) {
          cell.dataset.diffPending = "delete";
          cell.title = this.translate("view.pending.deletion");
          const code = cell.querySelector<HTMLElement>(".file-diff-sbs-code");
          if (code) {
            code.dataset.diffPresent = "false";
            code.dataset.diffPreview = "delete";
          }
        }
      }
    }
  }
  /** Renders one aligned row, substituting a dismissed change with its ignored, neutral form. */
  renderDiffRow(parent: HTMLElement, row: ComparisonRowModel | null, rowIndex: number): void {
    if (!row) {
      return;
    }
    const targetValue = this.applyDirection === "left-to-right" ? row.right : row.left;
    if (targetValue !== null) this.buildPendingDeletions(parent, this.applyDirection === "left-to-right" ? row.rightIndex : row.leftIndex);
    if (!row.equal && this.session.hasDismissedRow(getDiffRowKey(row))) {
      const ignoredRow = getIgnoredDiffRow(row);
      this.buildRow(parent, ignoredRow, rowIndex, false);
      return;
    }
    this.buildRow(parent, row, rowIndex, !row.equal);
  }
  /** Adds a header with block-wide accept/ignore controls above a large change group. */
  buildGroupHeader(parent: HTMLElement, rows: ComparisonRowModel[], group: ChangeRowGroup, changedRowCount: number): void {
    const header = parent.createDiv({ cls: "file-diff-sbs-group-header" });
    header.createSpan({
      cls: "file-diff-sbs-group-summary",
      text: this.translate(changedRowCount === 1 ? "view.summary.changedOne" : "view.summary.changedMany", { count: changedRowCount })
    });
    const actions = header.createDiv({ cls: "file-diff-sbs-group-actions" });
    const acceptButton = actions.createEl("button", { text: `${this.applyDirection === "left-to-right" ? "→" : "←"} ${this.translate("actions.acceptGroup")}`, cls: "file-diff-sbs-group-button" });
    acceptButton.disabled = !this.canApplyChange();
    acceptButton.title = this.translate("actions.acceptGroupTarget", { name: this.getApplyTargetName() });
    acceptButton.addEventListener("click", () => { void this.applyGroupChange(group.startIndex, group.endIndex, this.applyDirection); });
    const dismissButton = actions.createEl("button", { text: this.translate("actions.dismissGroup"), cls: "file-diff-sbs-group-button" });
    dismissButton.title = this.translate("actions.dismissGroupTarget", { name: this.getApplyTargetName() });
    const groupRows = rows.slice(group.startIndex, group.endIndex + 1);
    dismissButton.addEventListener("click", () => { void this.dismissGroup(groupRows, group.startIndex); });
  }
  /** Builds a read-only source beside the editable target without swapping physical panes. */
  buildEditableModeLayout(parent: HTMLElement, rows: IndexedDiffRow[]): void {
    const leftPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane" });
    const rightPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane" });
    const targetOnRight = this.applyDirection === "left-to-right";
    const referencePane = targetOnRight ? leftPane : rightPane;
    const targetPane = targetOnRight ? rightPane : leftPane;
    referencePane.addClass("file-diff-sbs-edit-reference-pane");
    targetPane.addClass("file-diff-sbs-edit-target-pane");
    // The existing editor engine uses logical left=reference/right=editable fields.
    // Normalize only its row input; file paths, physical panes and merge state stay unchanged.
    const editorRows = targetOnRight ? rows : rows.map((row): IndexedDiffRow => ({
      left: row.right, right: row.left, equal: row.equal,
      leftIndex: row.rightIndex, rightIndex: row.leftIndex,
      leftLineNumber: row.rightLineNumber, rightLineNumber: row.leftLineNumber
    }));
    for (let index = 0; index < editorRows.length; index += 1) {
      const row = editorRows[index];
      if (row) this.buildEditableLeftCell(referencePane, row, index);
    }
    const editor = targetPane.createDiv({ cls: "file-diff-sbs-document-editor" });
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", this.translate("editor.rightFileAria"));
    const editableRows: IndexedDiffRow[] = editorRows.length > 0 ? editorRows : [{ left: null, right: null, equal: true, leftIndex: 0, rightIndex: 0, leftLineNumber: null, rightLineNumber: null }];
    for (let index = 0; index < editableRows.length; index += 1) {
      const row = editableRows[index];
      if (row) this.buildEditableRightLine(editor, row, index);
    }
    this.synchronizeEditablePanes(editor);
    const windowRef = editor.ownerDocument.defaultView;
    if (!windowRef) {
      return;
    }
    const observer = new windowRef.MutationObserver(() => { this.scheduleEditablePaneSync(editor); });
    observer.observe(editor, { childList: true, subtree: true });
    const resizeObserver = new windowRef.ResizeObserver(() => {
      if (this.state.editRight && editor.isConnected) {
        this.scheduleEditablePaneSync(editor);
      }
    });
    this.rightEditorState = { editor, initialValue: this.serializeRightEditor(editor), observer, resizeObserver };
    this.observeEditableLineSizes(editor);
    this.rightEditorDirty = false;
    this.updateSaveButtonState();
  }
  /** Renders one read-only source row beside the document editor. */
  buildEditableLeftCell(parent: HTMLElement, row: IndexedDiffRow, rowIndex: number): void {
    const rowType = getDiffRowType(row);
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    this.markChangeTarget(cell, row, rowIndex);
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = row.left === null ? "" : String(row.leftLineNumber);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, row.left, row.right, "left");
  }
  /** Renders one target line using the editor engine's logical right-side fields. */
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
  /** Serializes editable target lines without including the line-number gutter. */
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
        isAlignmentGap: line.classList.contains("file-diff-sbs-edit-gap"),
        rightPresent: line.dataset.rightPresent !== "false"
      };
    }));
  }
  /** Returns whether the editable target differs from its saved snapshot. */
  hasRightEditorChanges(): boolean {
    const changed = Boolean(
      this.state.editRight && this.rightEditorState && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue
    );
    if (!changed) {
      this.rightEditorDirty = false;
    }
    return changed;
  }
  /** Enables or disables the visible save action based on current changes. */
  updateSaveButtonState(): void {
    if (this.directionButton) {
      this.directionButton.disabled = this.state.editRight || this.hasPendingChanges();
    }
    if (!this.saveButton) {
      return;
    }
    const hasChanges = this.state.editRight ? this.rightEditorDirty : this.hasPendingChanges();
    this.saveButton.disabled = !hasChanges;
    this.saveButton.setAttribute("aria-disabled", String(!hasChanges));
  }
  /** Enables navigation buttons only when the rendered comparison has a change. */
  updateChangeNavigationState(): void {
    const hasChanges = !this.state.editRight && this.contentEl.querySelector("[data-diff-change='true']") !== null;
    if (this.previousChangeButton) {
      this.previousChangeButton.disabled = !hasChanges;
    }
    if (this.nextChangeButton) {
      this.nextChangeButton.disabled = !hasChanges;
    }
  }
  /** Shows the identical-file message and the actions available for the current mode. */
  buildIdenticalMessage(parent: HTMLElement, leftFile: ComparisonFile, rightFile: ComparisonFile): void {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.identical.title") });
    if (this.state.editRight) {
      message.createSpan({ text: this.translate("messages.identical.edit") });
      return;
    }
    message.createSpan({ text: this.translate("messages.identical.trash") });
    const actions = message.createDiv({ cls: "file-diff-sbs-identical-actions" });
    const deleteLeftButton = actions.createEl("button", { text: this.translate("messages.identical.deleteLeft") });
    deleteLeftButton.disabled = !(leftFile instanceof TFile);
    deleteLeftButton.title = leftFile.path;
    deleteLeftButton.addEventListener("click", () => { if (leftFile instanceof TFile) this.confirmDeleteIdenticalFile(leftFile); });
    const deleteRightButton = actions.createEl("button", { text: this.translate("messages.identical.deleteRight") });
    deleteRightButton.disabled = !(rightFile instanceof TFile);
    deleteRightButton.title = rightFile.path;
    deleteRightButton.addEventListener("click", () => { if (rightFile instanceof TFile) this.confirmDeleteIdenticalFile(rightFile); });
  }
  /** Shows that every detected suggestion was accepted or dismissed. */
  buildResolvedMessage(parent: HTMLElement): void {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.resolved.title") });
    message.createSpan({
      text: this.hasPendingChanges() ? this.translate("messages.resolved.pending") : this.translate("messages.resolved.none")
    });
  }
  /** Opens the proposal-copy cleanup prompt after all accepted changes are saved. */
  maybePromptDeleteChangeCopy(): void {
    if (this.session.hasShownProposalCleanupPrompt() || !shouldOfferProposalCleanup(this.state.mode, this.session.hasAcceptedProposalChanges(), this.session.getDismissedRowCount(), this.hasPendingChanges())) {
      return;
    }
    const leftPath = this.state.leftPath;
    const rightPath = this.state.rightPath;
    if (leftPath === null || rightPath === null) {
      return;
    }
    const leftFile = this.getComparisonFile(leftPath);
    const rightFile = this.getComparisonFile(rightPath);
    if (!(leftFile instanceof TFile) || !(rightFile instanceof TFile) || !this.isChangeCopyFile(leftFile, rightFile)) {
      return;
    }
    this.session.markProposalCleanupPromptShown();
    this.confirmDeleteChangeCopy(leftFile);
  }
  /** Checks whether the left file is the configured suffix copy of the original. */
  isChangeCopyFile(file: TFile, originalFile: TFile): boolean {
    const expectedPrefix = `${originalFile.basename}${this.plugin.settings.changeCopySuffix}`;
    return file.path !== originalFile.path
      && file.parent?.path === originalFile.parent?.path
      && file.extension === originalFile.extension
      && file.basename.startsWith(expectedPrefix);
  }
  /** Adds a pane header with side label and vault-relative path. */
  buildFileHeader(parent: HTMLElement, file: ComparisonFile, sideLabel: string, role?: "source" | "target" | "reference" | "edit"): void {
    const header = parent.createDiv({ cls: "file-diff-sbs-file-header" });
    const labels = header.createDiv({ cls: "file-diff-sbs-file-labels" });
    labels.createSpan({ text: sideLabel, cls: "file-diff-sbs-side-label" });
    if (role !== undefined) {
      labels.createSpan({ text: this.translate(`view.roles.${role}`), cls: `file-diff-sbs-role file-diff-sbs-role-${role}` });
    }
    header.createSpan({ text: file.name, cls: "file-diff-sbs-file-name" });
    header.createSpan({ text: file instanceof TFile ? file.path : file.name, cls: "file-diff-sbs-file-path" });
  }

  /** Names the target in action hints even when identical filenames appear in different folders. */
  getApplyTargetName(): string {
    const path = this.applyDirection === "left-to-right" ? this.state.rightPath : this.state.leftPath;
    const file = path === null ? null : this.getComparisonFile(path);
    return file instanceof TFile ? file.path : file?.name ?? this.translate("fileFallback");
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
  /** Confirms and performs moving a processed change copy to the system trash. */
  confirmDeleteChangeCopy(file: TFile): void {
    new DeleteChangeCopyModal(this.app, file, async () => {
      try {
        await this.app.fileManager.trashFile(file);
        new Notice(this.translate("notice.changeCopyTrashed", { name: file.name }));
        this.leaf.detach();
      } catch (error) {
        console.error("Side-by-Side Diff konnte die Änderungskopie nicht verschieben.", error);
        new Notice(this.translate("notice.changeCopyTrashFailed"));
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
    const leftCell = this.buildCell(rowElement, row.left, row.right, row.leftLineNumber, "left", rowType, modelRow?.leftInlineTokens);
    this.buildActionCell(rowElement, row, rowIndex);
    const rightCell = this.buildCell(rowElement, row.right, row.left, row.rightLineNumber, "right", rowType, modelRow?.rightInlineTokens);
    const targetOnRight = this.applyDirection === "left-to-right";
    const targetValue = targetOnRight ? row.right : row.left;
    const targetIndex = targetOnRight ? row.rightIndex : row.leftIndex;
    if (targetValue !== null && this.pendingTargetPreview?.changedLines.has(targetIndex) === true) {
      const targetCell = targetOnRight ? rightCell : leftCell;
      targetCell.dataset.diffOperation = "none";
      targetCell.dataset.diffPending = "insert";
      targetCell.title = this.translate("view.pending.change");
      const code = targetCell.querySelector<HTMLElement>(".file-diff-sbs-code");
      if (code) code.textContent = targetValue;
    }
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
    const acceptButton = cell.createEl("button", { text: this.applyDirection === "left-to-right" ? "→" : "←", cls: "file-diff-sbs-merge-button" });
    acceptButton.disabled = !this.canApplyChange();
    acceptButton.title = this.translate("actions.acceptTarget", { name: this.getApplyTargetName() });
    acceptButton.setAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    acceptButton.addEventListener("click", () => { void this.applyRowChange(rowIndex, this.applyDirection); });
    const dismissButton = cell.createEl("button", { text: "\xD7", cls: "file-diff-sbs-merge-button" });
    dismissButton.title = this.translate("actions.dismissTarget", { name: this.getApplyTargetName() });
    dismissButton.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    dismissButton.addEventListener("click", () => { void this.dismissRow(row, rowIndex); });
    this.changeActions.set(rowIndex, {
      accept: () => { void this.applyRowChange(rowIndex, this.applyDirection); },
      reject: () => { void this.dismissRow(row, rowIndex); }
    });
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
    const rowIndex = Number(activeRow.dataset.diffRowIndex);
    const rowActions = this.changeActions.get(rowIndex);
    const actionHandler = rowActions?.[action];
    if (!actionHandler) {
      return false;
    }
    actionHandler();
    return true;
  }
  /** Resolves a change without altering either file or its displayed text. */
  async dismissRow(row: IndexedDiffRow, rowIndex: number): Promise<void> {
    const scrollPosition = this.getScrollPosition();
    const targetPosition = this.getChangeTargetPosition(rowIndex);
    this.session.dismissRow(getDiffRowKey(row));
    await this.renderDiff(scrollPosition);
    this.advanceAfterResolvedChange(targetPosition);
  }
  /** Ignores every changed row inside a bridged block at once. */
  async dismissGroup(rows: readonly IndexedDiffRow[], startIndex: number): Promise<void> {
    const scrollPosition = this.getScrollPosition();
    const targetPosition = this.getChangeTargetPosition(startIndex);
    const rowKeys = rows.filter((row) => !row.equal).map((row) => getDiffRowKey(row));
    this.session.dismissRows(rowKeys);
    await this.renderDiff(scrollPosition);
    this.advanceAfterResolvedChange(targetPosition);
  }
  /** Reverses the most recent accept or ignore action, restoring the state right before it. */
  async undoLastChange(): Promise<void> {
    if (!this.session.canUndo()) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
    this.session.undo();
    await this.renderDiff(scrollPosition);
    new Notice(this.translate("notice.undone"));
  }
  /** Moves to the next open change after accepting or ignoring one when enabled. */
  advanceAfterResolvedChange(resolvedPosition: number | null): void {
    const targetIndexes = [...this.getChangeTargets().keys()];
    const nextPosition = getAutoAdvanceTargetPosition(
      targetIndexes.length,
      resolvedPosition,
      this.plugin.settings.autoAdvanceAfterChange,
    );
    if (nextPosition === null) {
      return;
    }
    const nextIndex = targetIndexes[nextPosition];
    if (nextIndex !== undefined) {
      this.focusChange(nextIndex);
    }
  }
  /** Renders one side of a diff row. */
  buildCell(parent: HTMLElement, value: string | null, counterpart: string | null, lineNumberValue: number | null, side: EditableSide, rowType: EditableRowType, inlineTokens?: InlineDiffToken[]): HTMLElement {
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    // Structural row types stay positional; review colors describe the planned merge instead.
    const sourceSide = this.applyDirection === "left-to-right" ? "left" : "right";
    cell.dataset.diffOperation = rowType === "equal" || value === null ? "none" : side === sourceSide ? "insert" : "delete";
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = value === null ? "" : String(lineNumberValue);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    code.dataset.diffSide = side;
    code.dataset.diffPresent = String(value !== null);
    if (rowType === "equal") {
      code.textContent = value ?? " ";
    } else {
      appendInlineDiff(code, value, counterpart, side, inlineTokens);
    }
    return cell;
  }
  /** Swaps the files while keeping the current diff view open. */
  async swapFiles(): Promise<void> {
    if (this.externalMarkdown != null && this.externalMarkdown.handle === null) return;
    if (!await this.prepareForSwap()) {
      return;
    }
    const swappedDismissedRows = this.session.getDismissedRowKeys().map(swapDiffRowKey);
    this.session.replaceDismissedRows(swappedDismissedRows);
    // Keep dismiss-undo entries valid instead of discarding them: their row keys must follow
    // the same left/right swap as the dismissed-row set itself.
    this.session.remapUndoDismissKeys(swapDiffRowKey);
    this.activeChangeRowIndex = null;
    this.session.clearSaveBaselines();
    const nextState = swapDiffViewState(this.viewState);
    await this.setState(nextState, { history: false });
  }
  /** Confirms how transient comparison changes should be handled before swapping the panes. */
  async prepareForSwap(): Promise<boolean> {
    return this.prepareForTransition(this.translate("modal.unsaved.swapQuestion"));
  }
  /** Confirms how transient comparison changes should be handled before a view transition. */
  async prepareForTransition(question: string, validate?: () => Promise<boolean>): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return validate === undefined || await validate();
    }
    const choice = await new UnsavedChangesModal(this.app, this.translate.bind(this), question).waitForChoice();
    // An asynchronous drop may have failed or been superseded while the dialog was open.
    // Validate before a discard can erase the current session or a save can write it.
    if (validate !== undefined && !await validate()) return false;
    if (choice === "discard") {
      this.session.clearTransientChanges();
      return true;
    }
    if (this.state.editRight) {
      return this.saveRightEdits();
    } else {
      return this.savePendingChanges(false);
    }
  }
}
