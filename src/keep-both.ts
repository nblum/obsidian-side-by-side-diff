import type { DiffDirection, IndexedDiffRow } from "./diff-core.ts";

/** Describes an uninterrupted open fragment, bounded by unchanged or previously resolved rows. */
export interface KeepBothRun {
	readonly rowIndexes: readonly number[];
	readonly targetLines: readonly string[];
	readonly sourceLines: readonly string[];
}

/** Groups selected open rows without duplicating unchanged separators or resolved content. */
export function createKeepBothPlan(rows: readonly IndexedDiffRow[], indexes: readonly number[], direction: DiffDirection): KeepBothRun[] {
	const selected = [...new Set(indexes)].sort((left, right) => left - right);
	const runs: { rowIndexes: number[]; targetLines: string[]; sourceLines: string[] }[] = [];
	let run: typeof runs[number] | null = null;
	let previous = -2;
	// Visit only selected rows so rendering many small block headers stays linear in their total size.
	for (const index of selected) {
		const row = rows[index];
		if (!row || row.equal) { run = null; previous = index; continue; }
		if (run === null || index !== previous + 1) {
			run = { rowIndexes: [], targetLines: [], sourceLines: [] };
			runs.push(run);
		}
		run.rowIndexes.push(index);
		const target = direction === "left-to-right" ? row.right : row.left;
		const source = direction === "left-to-right" ? row.left : row.right;
		if (target !== null) run.targetLines.push(target);
		if (source !== null) run.sourceLines.push(source);
		previous = index;
	}
	return runs;
}

/** Offers Keep both only when the selected differences contain content from both versions. */
export function canKeepBoth(runs: readonly KeepBothRun[]): boolean {
	return runs.some(run => run.targetLines.length > 0) && runs.some(run => run.sourceLines.length > 0);
}
