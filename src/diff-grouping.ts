import type { DiffRow } from "./diff-core.ts";

/** Describes one contiguous span of aligned rows that should render as one visual block. */
export interface ChangeRowGroup {
	readonly startIndex: number;
	readonly endIndex: number;
	readonly bridgesBlankLines: boolean;
}

/** Returns whether a value is empty or contains only whitespace. */
function isBlankValue(value: string | null): boolean {
	return value !== null && value.trim() === "";
}

/** Returns whether an aligned row is an identical blank line on both sides. */
function isBlankEqualRow(row: DiffRow): boolean {
	return row.equal && isBlankValue(row.left) && isBlankValue(row.right);
}

/**
 * Groups contiguous runs of changed rows into spans, bridging blank-line pairs in between so a
 * paragraph rewritten across several lines reads as one block instead of disconnected
 * single-line edits interrupted by lonely blank rows. A single isolated changed row stays
 * ungrouped; callers typically only render a visual wrapper for `bridgesBlankLines` spans, since
 * a plain contiguous run already reads as one block without extra styling.
 */
export function groupChangeRows(rows: readonly DiffRow[]): ChangeRowGroup[] {
	const groups: ChangeRowGroup[] = [];
	let start: number | null = null;
	let end: number | null = null;
	let bridgesBlankLines = false;
	let pendingBlankCount = 0;

	const flush = (): void => {
		if (start !== null && end !== null) {
			groups.push({ startIndex: start, endIndex: end, bridgesBlankLines });
		}
		start = null;
		end = null;
		bridgesBlankLines = false;
		pendingBlankCount = 0;
	};

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (!row) {
			continue;
		}
		if (!row.equal) {
			start = start ?? index;
			end = index;
			if (pendingBlankCount > 0) {
				bridgesBlankLines = true;
				pendingBlankCount = 0;
			}
			continue;
		}
		if (isBlankEqualRow(row) && start !== null) {
			pendingBlankCount += 1;
			continue;
		}
		flush();
	}
	flush();

	return groups.filter((group) => group.endIndex > group.startIndex);
}

/** Minimum number of real (non-blank) changed rows before a block gets header controls. */
export const GROUP_HEADER_THRESHOLD = 3;

/**
 * Returns the indexes of changed rows within [startIndex, endIndex] that still need action, i.e.
 * excluding rows already resolved - e.g. individually dismissed - so a block-wide accept/ignore
 * cannot silently re-touch a row the user already decided on. Without `isResolved`, every changed
 * row is included. Indexes come back in ascending order.
 */
export function getActionableRowIndexes<T extends DiffRow>(
	rows: readonly T[],
	startIndex: number,
	endIndex: number,
	isResolved: (row: T, index: number) => boolean = () => false,
): number[] {
	const indexes: number[] = [];
	for (let index = startIndex; index <= endIndex; index += 1) {
		const row = rows[index];
		if (row && !row.equal && !isResolved(row, index)) {
			indexes.push(index);
		}
	}
	return indexes;
}

/**
 * Counts the changed (non-equal) rows inside a group span that are not already resolved, e.g.
 * dismissed in the current session. Without `isResolved`, every changed row counts.
 */
export function countGroupChangedRows<T extends DiffRow>(
	rows: readonly T[],
	group: ChangeRowGroup,
	isResolved: (row: T, index: number) => boolean = () => false,
): number {
	return getActionableRowIndexes(rows, group.startIndex, group.endIndex, isResolved).length;
}
