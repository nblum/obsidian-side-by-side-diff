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
import { alignMarkdownLinesByHeadings } from "./markdown-headings.ts";

/** Selects structural alignment after the caller has determined both files are Markdown. */
export interface ComparisonOptions {
	readonly alignMarkdownByHeadings?: boolean;
}

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
export function createComparisonModel(leftContent: string, rightContent: string, options: ComparisonOptions = {}): ComparisonModel {
	return createComparisonModelFromLines(splitLines(leftContent), splitLines(rightContent), options);
}

/** Builds indexed diff rows without calculating inline token differences. */
export function createIndexedDiffRowsFromLines(leftLines: string[], rightLines: string[], options: ComparisonOptions = {}): IndexedDiffRow[] {
	return indexDiffRows(options.alignMarkdownByHeadings === true
		? alignMarkdownLinesByHeadings(leftLines, rightLines)
		: alignSequences(leftLines, rightLines, (left, right) => left === right));
}

/** Builds a comparison model from already normalized document lines. */
export function createComparisonModelFromLines(leftLines: string[], rightLines: string[], options: ComparisonOptions = {}): ComparisonModel {
	const rows = createIndexedDiffRowsFromLines(leftLines, rightLines, options);
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
