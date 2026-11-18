import { splitLines } from "./diff-core.ts";
import { createIndexedDiffRowsFromLines } from "./diff-model.ts";

/** Keeps a removed saved line for display without adding it to the pending file content. */
export interface PendingDeletion {
	readonly value: string;
	readonly lineNumber: number;
}

/** Maps pending target changes to current line indexes, independently of source alignment. */
export interface PendingTargetPreview {
	readonly changedLines: ReadonlySet<number>;
	readonly deletions: ReadonlyMap<number, readonly PendingDeletion[]>;
}

/** Compares the saved target with its pending version; deletion keys are positions before current lines. */
export function createPendingTargetPreview(savedContent: string, pendingContent: string): PendingTargetPreview {
	const changedLines = new Set<number>();
	const deletions = new Map<number, PendingDeletion[]>();
	for (const row of createIndexedDiffRowsFromLines(splitLines(savedContent), splitLines(pendingContent))) {
		if (row.equal) continue;
		if (row.right !== null) changedLines.add(row.rightIndex);
		if (row.left !== null && row.leftLineNumber !== null) {
			const removed = deletions.get(row.rightIndex) ?? [];
			removed.push({ value: row.left, lineNumber: row.leftLineNumber });
			deletions.set(row.rightIndex, removed);
		}
	}
	return { changedLines, deletions };
}
