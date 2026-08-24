export type DiffValue = string | null;
export type DiffDirection = "left-to-right" | "right-to-left";

export interface DiffRow {
	left: DiffValue;
	right: DiffValue;
	equal: boolean;
}

export type DiffRowType = "equal" | "added" | "removed" | "changed";

export interface InlineDiffToken {
	value: string;
	changed: boolean;
}

export interface InlineDiffTokens {
	left: InlineDiffToken[];
	right: InlineDiffToken[];
}

export interface IndexedDiffRow extends DiffRow {
	leftIndex: number;
	rightIndex: number;
	leftLineNumber: number | null;
	rightLineNumber: number | null;
}

export interface AlignmentPlan {
	targetCount: number;
	insertionIndex: number;
	leftGapCount: number;
	rightGapCount: number;
}

export interface EditableLine {
	value: string;
	isAlignmentGap?: boolean;
	rightPresent?: boolean;
}

const MAX_DIFF_CELLS = 1_000_000;

/** Splits one line into whitespace and non-whitespace tokens for inline diffing. */
function tokenizeLine(line: string): string[] {
	return line.match(/\s+|[^\s]+/g) || [];
}

/** Returns an indexed value and fails explicitly when an invariant is broken. */
function getRequired<T>(values: ArrayLike<T>, index: number): T {
	const value = values[index];
	if (value === undefined) {
		throw new Error(`Missing diff value at index ${String(index)}.`);
	}
	return value;
}

/** Splits normalized text into displayable lines without a synthetic final line. */
export function splitLines(content: string): string[] {
	if (content.length === 0) {
		return [];
	}
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines.length > 0 ? lines : [""];
}

/** Reassembles edited lines while preserving the target file's line ending style. */
export function joinLines(lines: string[], originalContent: string): string {
	if (lines.length === 0) {
		return "";
	}
	const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] ?? "\n";
	const hasFinalLineEnding = /(?:\r\n|\r|\n)$/.test(originalContent);
	return lines.join(lineEnding) + (hasFinalLineEnding ? lineEnding : "");
}

/** Converts normalized editor line breaks to the target file's line ending style. */
export function convertLineEndings(content: string, originalContent: string): string {
	const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] ?? "\n";
	return content.replace(/\r\n?/g, "\n").replace(/\n/g, lineEnding);
}

/** Adds source indexes and display line numbers to aligned diff rows. */
export function indexDiffRows(rows: DiffRow[]): IndexedDiffRow[] {
	let leftIndex = 0;
	let rightIndex = 0;
	return rows.map((row) => {
		const indexedRow: IndexedDiffRow = {
			...row,
			leftIndex,
			rightIndex,
			leftLineNumber: row.left === null ? null : leftIndex + 1,
			rightLineNumber: row.right === null ? null : rightIndex + 1,
		};
		if (row.left !== null) {
			leftIndex += 1;
		}
		if (row.right !== null) {
			rightIndex += 1;
		}
		return indexedRow;
	});
}

/** Creates a stable key for dismissing one visible diff row. */
export function getDiffRowKey(row: IndexedDiffRow): string {
	return JSON.stringify([row.leftIndex, row.rightIndex, row.left, row.right]);
}

/** Classifies an aligned row using the same CSS category as the comparison view. */
export function getDiffRowType(row: DiffRow): DiffRowType {
	if (row.equal) {
		return "equal";
	}
	if (row.left === null) {
		return "added";
	}
	if (row.right === null) {
		return "removed";
	}
	return "changed";
}

/** Aligns two sequences using a compact longest-common-subsequence diff. */
export function alignSequences(left: string[], right: string[], equals: (left: string, right: string) => boolean): DiffRow[] {
	if (left.length * right.length > MAX_DIFF_CELLS) {
		return alignByIndex(left, right, equals);
	}

	const table = Array.from(
		{ length: left.length + 1 },
		() => new Uint32Array(right.length + 1),
	);

	for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
		for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
			const currentRow = getRequired(table, leftIndex);
			const nextRow = getRequired(table, leftIndex + 1);
			const leftValue = getRequired(left, leftIndex);
			const rightValue = getRequired(right, rightIndex);
			currentRow[rightIndex] = equals(leftValue, rightValue)
				? getRequired(nextRow, rightIndex + 1) + 1
				: Math.max(getRequired(nextRow, rightIndex), getRequired(currentRow, rightIndex + 1));
		}
	}

	const operations: DiffOperation[] = [];
	let leftIndex = 0;
	let rightIndex = 0;
	while (leftIndex < left.length || rightIndex < right.length) {
		if (
			leftIndex < left.length &&
			rightIndex < right.length &&
			equals(getRequired(left, leftIndex), getRequired(right, rightIndex))
		) {
			operations.push({ kind: "equal", left: getRequired(left, leftIndex), right: getRequired(right, rightIndex) });
			leftIndex += 1;
			rightIndex += 1;
		} else if (
			leftIndex < left.length &&
			(rightIndex >= right.length || getRequired(getRequired(table, leftIndex + 1), rightIndex) >= getRequired(getRequired(table, leftIndex), rightIndex + 1))
		) {
			operations.push({ kind: "left", left: getRequired(left, leftIndex), right: null });
			leftIndex += 1;
		} else {
			operations.push({ kind: "right", left: null, right: getRequired(right, rightIndex) });
			rightIndex += 1;
		}
	}

	return groupOperations(operations);
}

/** Splits two changed lines into aligned token lists and flags tokens that differ. */
export function getInlineDiffTokens(left: string, right: string): InlineDiffTokens {
	const rows = alignSequences(tokenizeLine(left), tokenizeLine(right), (leftToken, rightToken) => leftToken === rightToken);
	return {
		left: rows.flatMap((row) => row.left === null ? [] : [{ value: row.left, changed: !row.equal }]),
		right: rows.flatMap((row) => row.right === null ? [] : [{ value: row.right, changed: !row.equal }]),
	};
}

type DiffOperation = { kind: "equal" | "left" | "right"; left: DiffValue; right: DiffValue };

/** Provides a predictable index-based fallback for very large files. */
function alignByIndex(left: string[], right: string[], equals: (left: string, right: string) => boolean): DiffRow[] {
	const rows: DiffRow[] = [];
	const rowCount = Math.max(left.length, right.length);
	for (let index = 0; index < rowCount; index += 1) {
		const leftValue = index < left.length ? getRequired(left, index) : null;
		const rightValue = index < right.length ? getRequired(right, index) : null;
		rows.push({
			left: leftValue,
			right: rightValue,
			equal: leftValue !== null && rightValue !== null && equals(leftValue, rightValue),
		});
	}
	return rows;
}

/** Groups raw insert/delete operations into aligned rows for the two panes. */
function groupOperations(operations: DiffOperation[]): DiffRow[] {
	const rows: DiffRow[] = [];
	let index = 0;
	while (index < operations.length) {
		const operation = operations[index];
		if (!operation) {
			break;
		}
		if (operation.kind === "equal") {
			rows.push({ left: operation.left, right: operation.right, equal: true });
			index += 1;
			continue;
		}

		const removed: string[] = [];
		const added: string[] = [];
		while (index < operations.length) {
			const pendingOperation = operations[index];
			if (!pendingOperation || pendingOperation.kind === "equal") {
				break;
			}
			if (pendingOperation.kind === "left") {
				removed.push(pendingOperation.left ?? "");
			} else {
				added.push(pendingOperation.right ?? "");
			}
			index += 1;
		}

		const rowCount = Math.max(removed.length, added.length);
		for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
			rows.push({
				left: rowIndex < removed.length ? getRequired(removed, rowIndex) : null,
				right: rowIndex < added.length ? getRequired(added, rowIndex) : null,
				equal: false,
			});
		}
	}
	return rows;
}

/** Applies one aligned row change to line arrays without overwriting a following line. */
export function applyAlignedRowChange(
	leftLines: string[],
	rightLines: string[],
	row: IndexedDiffRow,
	direction: DiffDirection,
): { leftLines: string[]; rightLines: string[] } {
	const nextLeftLines = [...leftLines];
	const nextRightLines = [...rightLines];
	const leftToRight = direction === "left-to-right";
	const sourceValue = leftToRight ? row.left : row.right;
	const targetValue = leftToRight ? row.right : row.left;
	const targetLines = leftToRight ? nextRightLines : nextLeftLines;
	const targetIndex = leftToRight ? row.rightIndex : row.leftIndex;

	if (sourceValue === null) {
		targetLines.splice(targetIndex, 1);
	} else if (targetValue === null) {
		targetLines.splice(targetIndex, 0, sourceValue);
	} else if (targetIndex >= targetLines.length) {
		targetLines.push(sourceValue);
	} else {
		targetLines[targetIndex] = sourceValue;
	}

	return { leftLines: nextLeftLines, rightLines: nextRightLines };
}

/** Turns a dismissed row into a neutral row that keeps the right-side content visible. */
export function getIgnoredDiffRow(row: IndexedDiffRow): IndexedDiffRow | null {
	if (row.right === null) {
		return null;
	}
	return {
		left: null,
		right: row.right,
		equal: true,
		leftIndex: row.leftIndex,
		rightIndex: row.rightIndex,
		leftLineNumber: null,
		rightLineNumber: row.rightLineNumber,
	};
}

/** Calculates where compensating blank lines belong when one pane changes length. */
export function getLineSyncPlan(leftCount: number, rightCount: number, preferredIndex: number | null = null): AlignmentPlan {
	const targetCount = Math.max(leftCount, rightCount);
	const requestedIndex = preferredIndex !== null && Number.isInteger(preferredIndex)
		? preferredIndex
		: Math.min(leftCount, rightCount);
	return {
		targetCount,
		insertionIndex: Math.max(0, Math.min(requestedIndex, targetCount)),
		leftGapCount: Math.max(0, rightCount - leftCount),
		rightGapCount: Math.max(0, leftCount - rightCount),
	};
}

/** Serializes editable lines while excluding visual-only alignment gaps. */
export function serializeEditableLines(lines: EditableLine[]): string {
	return lines
		.filter((line) => !(line.isAlignmentGap === true && line.value.trim() === ""))
		.filter((line) => line.value !== "" || line.rightPresent !== false)
		.map((line) => line.value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " "))
		.join("\n");
}
