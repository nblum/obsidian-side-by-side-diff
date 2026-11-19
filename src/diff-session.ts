import { ReviewState, type ReviewCounts, type ReviewStatus, type ReviewStateSnapshot } from "./review-state.ts";
import { joinLines, type DiffDirection } from "./diff-core.ts";
import type { ComparisonOptions, ComparisonRowModel } from "./diff-model.ts";
import { captureSaveBaseline, migrateSaveEntry, refreshSaveBaseline } from "./save-guard.ts";

/** Describes one staged file content snapshot without exposing session storage. */
export interface PendingChange {
	readonly path: string;
	readonly content: string;
}

/** Captures review decisions with the alignment to which they belong. */
interface ReviewSnapshot {
	readonly review: ReviewState;
	readonly state: ReviewStateSnapshot;
}

/** Records how to reverse one accept or ignore action, however many rows it touched. */
type UndoEntry = (
	| { readonly type: "stage"; readonly path: string; readonly previousContent: string | undefined }
	| { readonly type: "dismiss"; readonly rowKeys: readonly string[] }) & { readonly reviewSnapshot: ReviewSnapshot | null };

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
	private review: ReviewState | null = null;
	private readonly dismissedRowKeys = new Set<string>();
	private readonly pendingContents = new Map<string, string>();
	private readonly saveBaselines = new Map<string, string>();
	private readonly undoStack: UndoEntry[] = [];
	private proposalChangesAccepted = false;
	private proposalCleanupPromptShown = false;

	/** Reuses stable review rows until actual comparison content or direction changes. */
	public getReviewRows(left: string[], right: string[], options: ComparisonOptions, direction: DiffDirection): ComparisonRowModel[] {
		if (this.review === null || !this.review.matches(left, right, options, direction)) {
			const ignored = this.getDismissedRowKeys();
			this.review = new ReviewState(left, right, options, direction);
			this.review.ignore(ignored);
		}
		return this.review.getRows();
	}

	/** Exposes row-based progress independently of pending file writes. */
	public getReviewCounts(): ReviewCounts { return this.review?.getCounts() ?? { open: 0, accepted: 0, ignored: 0 }; }

	/** Supplies accessible status markers for original changed rows. */
	public getReviewStatus(index: number): ReviewStatus | null { return this.review?.getStatus(index) ?? null; }

	/** Clears saved acceptance markers while keeping the remaining review identities intact. */
	public commitReview(): void { this.review?.commit(); }

	/** Starts a fresh alignment on explicit refresh while retaining matching ignored decisions. */
	public resetReview(): void {
		const keys = this.getDismissedRowKeys();
		this.review = null;
		this.dismissedRowKeys.clear();
		for (const key of keys) this.dismissedRowKeys.add(key);
	}

	/** Captures statuses alongside the existing atomic undo action. */
	private snapshotReview(): ReviewSnapshot | null {
		return this.review === null ? null : { review: this.review, state: this.review.snapshot() };
	}

	/** Returns whether a diff row has been dismissed in the current session. */
	public hasDismissedRow(rowKey: string): boolean {
		return this.review !== null ? this.review.hasIgnoredKey(rowKey) : this.dismissedRowKeys.has(rowKey);
	}

	/** Returns all dismissed row keys as a defensive copy. */
	public getDismissedRowKeys(): string[] {
		return this.review?.getIgnoredKeys() ?? [...this.dismissedRowKeys];
	}

	/** Returns the number of dismissed rows without exposing the backing set. */
	public getDismissedRowCount(): number {
		return this.review?.getCounts().ignored ?? this.dismissedRowKeys.size;
	}

	/** Marks one diff row as dismissed until the comparison is reset. */
	public dismissRow(rowKey: string): void {
		this.dismissRows([rowKey]);
	}

	/** Marks several diff rows as dismissed in one undoable step, e.g. for a whole block. */
	public dismissRows(rowKeys: readonly string[]): void {
		const reviewSnapshot = this.snapshotReview();
		const newKeys = [...new Set(rowKeys)].filter((rowKey) => !this.hasDismissedRow(rowKey));
		for (const rowKey of newKeys) {
			this.dismissedRowKeys.add(rowKey);
		}
		if (newKeys.length > 0) {
			this.review?.ignore(newKeys);
			this.undoStack.push({ type: "dismiss", rowKeys: newKeys, reviewSnapshot });
		}
	}

	/** Replaces dismissed rows after the comparison panes have been exchanged. */
	public replaceDismissedRows(rowKeys: readonly string[]): void {
		this.review = null;
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
	public stageChange(path: string, content: string, baseline: string, acceptedIndexes: readonly number[] = []): void {
		captureSaveBaseline(this.saveBaselines, path, baseline);
		this.undoStack.push({ type: "stage", path, previousContent: this.pendingContents.get(path), reviewSnapshot: this.snapshotReview() });
		this.review?.accept(acceptedIndexes);
		this.pendingContents.set(path, content);
	}

	/** Stages both variants with the target first, preserving the review ledger and existing undo stack. */
	public stageKeepBoth(path: string, currentContent: string, baseline: string, indexes: readonly number[]): boolean {
		if (this.review === null) return false;
		const reviewSnapshot = this.snapshotReview();
		if (!this.review.keepBoth(indexes)) return false;
		const lines = this.review.getTargetLines();
		let content = joinLines(lines, currentContent);
		// A literal final blank line needs its own terminator, even in a previously unterminated target.
		if (lines.at(-1) === "" && !/(?:\r\n|\r|\n)$/.test(currentContent)) {
			content += currentContent.match(/\r\n|\r|\n/)?.[0] ?? "\n";
		}
		captureSaveBaseline(this.saveBaselines, path, baseline);
		this.undoStack.push({ type: "stage", path, previousContent: this.pendingContents.get(path), reviewSnapshot });
		this.pendingContents.set(path, content);
		return true;
	}

	/** Prevents cleanup or identical-file actions from confusing resolved differences with equality. */
	public hasEqualContents(): boolean { return this.review?.hasEqualContents() ?? false; }

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
		if (entry.reviewSnapshot !== null && entry.reviewSnapshot.review === this.review) {
			this.review.restore(entry.reviewSnapshot.state);
		} else if (entry.type === "dismiss") {
			this.review?.reopen(entry.rowKeys);
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
				this.undoStack[index] = { ...entry, rowKeys: entry.rowKeys.map(swapRowKey), reviewSnapshot: null };
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
		this.review = null;
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
