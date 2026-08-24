import {
	alignSequences,
	getDiffRowType,
	getInlineDiffTokens,
	indexDiffRows,
	splitLines,
	type DiffRowType,
	type IndexedDiffRow,
	type InlineDiffToken,
} from "./diff-core.ts";

/** Describes one aligned row as it is consumed by the comparison renderer. */
export interface ComparisonRowModel extends IndexedDiffRow {
	type: DiffRowType;
	leftInlineTokens: InlineDiffToken[];
	rightInlineTokens: InlineDiffToken[];
}

/** Contains the complete deterministic input needed to render a comparison. */
export interface ComparisonModel {
	rows: ComparisonRowModel[];
	changedCount: number;
}

/** Builds a comparison model from two document contents. */
export function createComparisonModel(leftContent: string, rightContent: string): ComparisonModel {
	return createComparisonModelFromLines(splitLines(leftContent), splitLines(rightContent));
}

/** Builds indexed diff rows without calculating inline token differences. */
export function createIndexedDiffRowsFromLines(leftLines: string[], rightLines: string[]): IndexedDiffRow[] {
	return indexDiffRows(alignSequences(leftLines, rightLines, (left, right) => left === right));
}

/** Builds a comparison model from already normalized document lines. */
export function createComparisonModelFromLines(leftLines: string[], rightLines: string[]): ComparisonModel {
	const rows = createIndexedDiffRowsFromLines(leftLines, rightLines);
	const modelRows = rows.map((row): ComparisonRowModel => {
		const inlineTokens = row.left !== null && row.right !== null
			? getInlineDiffTokens(row.left, row.right)
			: { left: [], right: [] };
		return {
			...row,
			type: getDiffRowType(row),
			leftInlineTokens: inlineTokens.left,
			rightInlineTokens: inlineTokens.right,
		};
	});
	return {
		rows: modelRows,
		changedCount: modelRows.filter((row) => row.type !== "equal").length,
	};
}
