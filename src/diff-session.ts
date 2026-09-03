import { captureSaveBaseline, migrateSaveEntry, refreshSaveBaseline } from "./save-guard.ts";

/** Describes one staged file content snapshot without exposing session storage. */
export interface PendingChange {
	readonly path: string;
	readonly content: string;
}

/** Records how to reverse one accept or ignore action, however many rows it touched. */
type UndoEntry =
	| { readonly type: "stage"; readonly path: string; readonly previousContent: string | undefined }
	| { readonly type: "dismiss"; readonly rowKeys: readonly string[] };

/**
 * Returns whether leaving the comparison would discard real, unwritten data.
 * Dismissed rows never touch a file, so they must not count as unsaved on their own -
 * otherwise closing the view keeps prompting to save even after every pending change was written.
 */
export function hasUnsavedComparisonChanges(rightEditorChanged: boolean, hasPendingChanges: boolean): boolean {
	return rightEditorChanged || hasPendingChanges;
}

/** Encapsulates transient comparison state independently from the Obsidian view. */
export class DiffSession {
	private readonly dismissedRowKeys = new Set<string>();
	private readonly pendingContents = new Map<string, string>();
	private readonly saveBaselines = new Map<string, string>();
	private readonly undoStack: UndoEntry[] = [];
	private proposalChangesAccepted = false;
	private proposalCleanupPromptShown = false;

	/** Returns whether a diff row has been dismissed in the current session. */
	public hasDismissedRow(rowKey: string): boolean {
		return this.dismissedRowKeys.has(rowKey);
	}

	/** Returns all dismissed row keys as a defensive copy. */
	public getDismissedRowKeys(): string[] {
		return [...this.dismissedRowKeys];
	}

	/** Returns the number of dismissed rows without exposing the backing set. */
	public getDismissedRowCount(): number {
		return this.dismissedRowKeys.size;
	}

	/** Marks one diff row as dismissed until the comparison is reset. */
	public dismissRow(rowKey: string): void {
		this.dismissRows([rowKey]);
	}

	/** Marks several diff rows as dismissed in one undoable step, e.g. for a whole block. */
	public dismissRows(rowKeys: readonly string[]): void {
		const newKeys = rowKeys.filter((rowKey) => !this.dismissedRowKeys.has(rowKey));
		for (const rowKey of newKeys) {
			this.dismissedRowKeys.add(rowKey);
		}
		if (newKeys.length > 0) {
			this.undoStack.push({ type: "dismiss", rowKeys: newKeys });
		}
	}

	/** Replaces dismissed rows after the comparison panes have been exchanged. */
	public replaceDismissedRows(rowKeys: readonly string[]): void {
		this.dismissedRowKeys.clear();
		for (const rowKey of rowKeys) {
			this.dismissedRowKeys.add(rowKey);
		}
	}

	/** Returns whether staged file content exists. */
	public hasPendingChanges(): boolean {
		return this.pendingContents.size > 0;
	}

	/** Returns staged file contents without exposing the backing map. */
	public getPendingChanges(): readonly PendingChange[] {
		return Array.from(this.pendingContents, ([path, content]) => ({ path, content }));
	}

	/** Returns staged content when present, otherwise the current vault content. */
	public getDisplayedContent(path: string, storedContent: string): string {
		return this.pendingContents.get(path) ?? storedContent;
	}

	/** Stages content and records the first observed target baseline. */
	public stageChange(path: string, content: string, baseline: string): void {
		captureSaveBaseline(this.saveBaselines, path, baseline);
		this.undoStack.push({ type: "stage", path, previousContent: this.pendingContents.get(path) });
		this.pendingContents.set(path, content);
	}

	/** Returns whether an accept or ignore action can be undone. */
	public canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/** Reverses the most recent accept or ignore action, if any. */
	public undo(): boolean {
		const entry = this.undoStack.pop();
		if (!entry) {
			return false;
		}
		if (entry.type === "stage") {
			if (entry.previousContent === undefined) {
				this.pendingContents.delete(entry.path);
				this.saveBaselines.delete(entry.path);
			} else {
				this.pendingContents.set(entry.path, entry.previousContent);
			}
		} else {
			for (const rowKey of entry.rowKeys) {
				this.dismissedRowKeys.delete(rowKey);
			}
		}
		return true;
	}

	/** Discards the undo history, e.g. once its actions have been written to disk. */
	public clearUndoStack(): void {
		this.undoStack.length = 0;
	}

	/** Remaps dismiss-entry row keys after the comparison panes are exchanged, keeping undo valid. */
	public remapUndoDismissKeys(swapRowKey: (rowKey: string) => string): void {
		for (let index = 0; index < this.undoStack.length; index += 1) {
			const entry = this.undoStack[index];
			if (entry?.type === "dismiss") {
				this.undoStack[index] = { ...entry, rowKeys: entry.rowKeys.map(swapRowKey) };
			}
		}
	}

	/** Removes one successfully saved staged change. */
	public removePendingChange(path: string): void {
		this.pendingContents.delete(path);
	}

	/** Records the first baseline observed for a file during editing. */
	public captureSaveBaseline(path: string, content: string): void {
		captureSaveBaseline(this.saveBaselines, path, content);
	}

	/** Returns the baseline used to detect external changes before saving. */
	public getSaveBaseline(path: string): string | undefined {
		return this.saveBaselines.get(path);
	}

	/** Updates a baseline after the user has been warned about an external change. */
	public refreshSaveBaseline(path: string, content: string): void {
		refreshSaveBaseline(this.saveBaselines, path, content);
	}

	/** Removes the baseline after a successful save or leaving edit mode. */
	public removeSaveBaseline(path: string): void {
		this.saveBaselines.delete(path);
	}

	/** Removes all save baselines while keeping comparison decisions intact. */
	public clearSaveBaselines(): void {
		this.saveBaselines.clear();
	}

	/** Migrates all path-keyed state when a compared file is renamed. */
	public migratePath(oldPath: string, newPath: string): void {
		migrateSaveEntry(this.saveBaselines, oldPath, newPath);
		migrateSaveEntry(this.pendingContents, oldPath, newPath);
		for (let index = 0; index < this.undoStack.length; index += 1) {
			const entry = this.undoStack[index];
			if (entry?.type === "stage" && entry.path === oldPath) {
				this.undoStack[index] = { ...entry, path: newPath };
			}
		}
	}

	/** Clears staged changes, baselines, dismissed rows, and undo history after a discard. */
	public clearTransientChanges(): void {
		this.pendingContents.clear();
		this.saveBaselines.clear();
		this.dismissedRowKeys.clear();
		this.clearUndoStack();
	}

	/** Marks that a proposal change was accepted in the current session. */
	public markProposalChangeAccepted(): void {
		this.proposalChangesAccepted = true;
	}

	/** Returns whether at least one proposal change was accepted. */
	public hasAcceptedProposalChanges(): boolean {
		return this.proposalChangesAccepted;
	}

	/** Returns whether the proposal cleanup prompt has already been shown. */
	public hasShownProposalCleanupPrompt(): boolean {
		return this.proposalCleanupPromptShown;
	}

	/** Marks the proposal cleanup prompt as shown to prevent duplicate prompts. */
	public markProposalCleanupPromptShown(): void {
		this.proposalCleanupPromptShown = true;
	}

	/** Resets all transient state when a different comparison is selected. */
	public reset(): void {
		this.clearTransientChanges();
		this.proposalChangesAccepted = false;
		this.proposalCleanupPromptShown = false;
	}
}
