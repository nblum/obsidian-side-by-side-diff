const MAX_DIFF_CELLS = 1000000;

/** Splits normalized text into displayable lines without a synthetic final line. */
function splitLines(content) {
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
function joinLines(lines, originalContent) {
	if (lines.length === 0) {
		return "";
	}
	const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] || "\n";
	const hasFinalLineEnding = /(?:\r\n|\r|\n)$/.test(originalContent);
	return lines.join(lineEnding) + (hasFinalLineEnding ? lineEnding : "");
}

/** Converts normalized editor line breaks to the target file's line ending style. */
function convertLineEndings(content, originalContent) {
	const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] || "\n";
	return content.replace(/\r\n?/g, "\n").replace(/\n/g, lineEnding);
}

/** Adds source indexes and display line numbers to aligned diff rows. */
function indexDiffRows(rows) {
	let leftIndex = 0;
	let rightIndex = 0;
	return rows.map((row) => {
		const indexedRow = {
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
function getDiffRowKey(row) {
	return JSON.stringify([row.leftIndex, row.rightIndex, row.left, row.right]);
}

/** Aligns two sequences using a compact longest-common-subsequence diff. */
function alignSequences(left, right, equals) {
	if (left.length * right.length > MAX_DIFF_CELLS) {
		return alignByIndex(left, right, equals);
	}

	const table = Array.from(
		{ length: left.length + 1 },
		() => new Uint32Array(right.length + 1),
	);

	for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
		for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
			table[leftIndex][rightIndex] = equals(left[leftIndex], right[rightIndex])
				? table[leftIndex + 1][rightIndex + 1] + 1
				: Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
		}
	}

	const operations = [];
	let leftIndex = 0;
	let rightIndex = 0;
	while (leftIndex < left.length || rightIndex < right.length) {
		if (
			leftIndex < left.length &&
			rightIndex < right.length &&
			equals(left[leftIndex], right[rightIndex])
		) {
			operations.push({ kind: "equal", left: left[leftIndex], right: right[rightIndex] });
			leftIndex += 1;
			rightIndex += 1;
		} else if (
			leftIndex < left.length &&
			(rightIndex >= right.length || table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1])
		) {
			operations.push({ kind: "left", left: left[leftIndex], right: null });
			leftIndex += 1;
		} else {
			operations.push({ kind: "right", left: null, right: right[rightIndex] });
			rightIndex += 1;
		}
	}

	return groupOperations(operations);
}

/** Provides a predictable index-based fallback for very large files. */
function alignByIndex(left, right, equals) {
	const rows = [];
	const rowCount = Math.max(left.length, right.length);
	for (let index = 0; index < rowCount; index += 1) {
		const leftValue = index < left.length ? left[index] : null;
		const rightValue = index < right.length ? right[index] : null;
		rows.push({
			left: leftValue,
			right: rightValue,
			equal: leftValue !== null && rightValue !== null && equals(leftValue, rightValue),
		});
	}
	return rows;
}

/** Groups raw insert/delete operations into aligned rows for the two panes. */
function groupOperations(operations) {
	const rows = [];
	let index = 0;
	while (index < operations.length) {
		const operation = operations[index];
		if (operation.kind === "equal") {
			rows.push({ left: operation.left, right: operation.right, equal: true });
			index += 1;
			continue;
		}

		const removed = [];
		const added = [];
		while (index < operations.length && operations[index].kind !== "equal") {
			if (operations[index].kind === "left") {
				removed.push(operations[index].left);
			} else {
				added.push(operations[index].right);
			}
			index += 1;
		}

		const rowCount = Math.max(removed.length, added.length);
		for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
			const leftValue = rowIndex < removed.length ? removed[rowIndex] : null;
			const rightValue = rowIndex < added.length ? added[rowIndex] : null;
			rows.push({ left: leftValue, right: rightValue, equal: false });
		}
	}
	return rows;
}

/** Applies one aligned row change to line arrays without overwriting a following line. */
function applyAlignedRowChange(leftLines, rightLines, row, direction) {
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
function getIgnoredDiffRow(row) {
	if (row.right === null) {
		return null;
	}
	return { ...row, left: null, leftLineNumber: null, equal: true };
}

/** Calculates where compensating blank lines belong when one pane changes length. */
function getLineSyncPlan(leftCount, rightCount, preferredIndex = null) {
	const targetCount = Math.max(leftCount, rightCount);
	const requestedIndex = Number.isInteger(preferredIndex)
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
function serializeEditableLines(lines) {
	return lines
		.filter((line) => !(line.isAlignmentGap && line.value.trim() === ""))
		.filter((line) => line.value !== "" || line.rightPresent !== false)
		.map((line) => line.value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " "))
		.join("\n");
}

module.exports = {
	alignSequences,
	applyAlignedRowChange,
	convertLineEndings,
	getDiffRowKey,
	getIgnoredDiffRow,
	getLineSyncPlan,
	indexDiffRows,
	joinLines,
	serializeEditableLines,
	splitLines,
};
