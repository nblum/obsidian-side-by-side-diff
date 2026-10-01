import { alignSequences, indexDiffRows, type DiffRow } from "./diff-core.ts";

/** Identifies one ATX heading and its original document position. */
export interface MarkdownHeading {
	lineIndex: number;
	level: number;
	text: string;
}

/** Finds ATX headings outside backtick and tilde fences without interpreting inline markup. */
export function findMarkdownHeadings(lines: string[]): MarkdownHeading[] {
	const headings: MarkdownHeading[] = [];
	let fence: { marker: string; length: number } | null = null;
	for (const [lineIndex, line] of lines.entries()) {
		const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		const markers = fenceMatch?.[1];
		const remainder = fenceMatch?.[2] ?? "";
		if (fence !== null) {
			if (markers !== undefined && markers[0] === fence.marker && markers.length >= fence.length && /^[ \t]*$/.test(remainder)) {
				fence = null;
			}
			continue;
		}
		if (markers !== undefined && (markers[0] !== "`" || !remainder.includes("`"))) {
			fence = { marker: markers.charAt(0), length: markers.length };
			continue;
		}
		const headingMatch = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/.exec(line);
		const headingMarkers = headingMatch?.[1];
		if (headingMarkers !== undefined) {
			const text = (headingMatch?.[2] ?? "")
				.replace(/[ \t]+#+[ \t]*$/, "")
				.replace(/^[ \t]+|[ \t]+$/g, "");
			headings.push({ lineIndex, level: headingMarkers.length, text });
		}
	}
	return headings;
}

/** Appends an ordinary line diff, retaining its existing per-range performance safeguard. */
function appendAlignedRange(rows: DiffRow[], left: string[], right: string[]): void {
	for (const row of alignSequences(left, right, (leftLine, rightLine) => leftLine === rightLine)) {
		rows.push(row);
	}
}

/** Aligns ordered matching headings directly and diffs each intervening range independently. */
export function alignMarkdownLinesByHeadings(left: string[], right: string[]): DiffRow[] {
	const leftHeadings = findMarkdownHeadings(left);
	const rightHeadings = findMarkdownHeadings(right);
	const headingKey = (heading: MarkdownHeading): string => JSON.stringify([heading.level, heading.text]);
	const headingRows = indexDiffRows(alignSequences(leftHeadings.map(headingKey), rightHeadings.map(headingKey), (a, b) => a === b));
	const anchors = headingRows.filter((row) => row.equal);
	if (anchors.length === 0) {
		return alignSequences(left, right, (leftLine, rightLine) => leftLine === rightLine);
	}
	const rows: DiffRow[] = [];
	let leftStart = 0;
	let rightStart = 0;
	for (const anchor of anchors) {
		const leftHeading = leftHeadings[anchor.leftIndex];
		const rightHeading = rightHeadings[anchor.rightIndex];
		if (leftHeading === undefined || rightHeading === undefined) {
			throw new Error("Missing Markdown heading anchor.");
		}
		appendAlignedRange(rows, left.slice(leftStart, leftHeading.lineIndex), right.slice(rightStart, rightHeading.lineIndex));
		const leftLine = left[leftHeading.lineIndex] ?? "";
		const rightLine = right[rightHeading.lineIndex] ?? "";
		// Syntax-equivalent headings anchor together, but literal edits remain reviewable.
		rows.push({ left: leftLine, right: rightLine, equal: leftLine === rightLine });
		leftStart = leftHeading.lineIndex + 1;
		rightStart = rightHeading.lineIndex + 1;
	}
	appendAlignedRange(rows, left.slice(leftStart), right.slice(rightStart));
	return rows;
}
