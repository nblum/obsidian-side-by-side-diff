const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
	alignSequences,
	applyAlignedRowChange,
	convertLineEndings,
	getIgnoredDiffRow,
	getLineSyncPlan,
	indexDiffRows,
	serializeEditableLines,
	splitLines,
} = require("../diff-core");

/** Builds indexed rows for a pair of test documents. */
function getRows(leftContent, rightContent) {
	const leftLines = splitLines(leftContent);
	const rightLines = splitLines(rightContent);
	return indexDiffRows(alignSequences(leftLines, rightLines, (left, right) => left === right));
}

test("left-only arrow changes are inserted without overwriting the following right line", () => {
	const rows = getRows("A\nB\nC", "A\nC");
	const changedRow = rows.find((row) => row.left === "B");

	const result = applyAlignedRowChange(["A", "B", "C"], ["A", "C"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "B", "C"]);
});

test("right-only arrow changes remove only the right-side row", () => {
	const rows = getRows("A\nC", "A\nB\nC");
	const changedRow = rows.find((row) => row.right === "B");

	const result = applyAlignedRowChange(["A", "C"], ["A", "B", "C"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "C"]);
});

test("changed rows replace the target line instead of inserting a duplicate", () => {
	const rows = getRows("A\nB", "A\nX");
	const changedRow = rows.find((row) => row.left === "B" && row.right === "X");

	const result = applyAlignedRowChange(["A", "B"], ["A", "X"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "B"]);
});

test("ignoring a diff keeps a right-only line visible", () => {
	const rows = getRows("A", "A\nB");
	const ignoredRow = getIgnoredDiffRow(rows.find((row) => row.right === "B"));

	assert.equal(ignoredRow.left, null);
	assert.equal(ignoredRow.right, "B");
	assert.equal(ignoredRow.equal, true);
});

test("line synchronization plans gaps on the shorter right pane at the edit position", () => {
	const plan = getLineSyncPlan(5, 3, 2);

	assert.deepEqual(plan, {
		targetCount: 5,
		insertionIndex: 2,
		leftGapCount: 0,
		rightGapCount: 2,
	});
});

test("line synchronization plans gaps on the shorter left pane for inserted right lines", () => {
	const plan = getLineSyncPlan(3, 5, 1);

	assert.deepEqual(plan, {
		targetCount: 5,
		insertionIndex: 1,
		leftGapCount: 2,
		rightGapCount: 0,
	});
});

test("editor line endings preserve trailing blank lines", () => {
	assert.equal(convertLineEndings("A\n\n", "A\r\n"), "A\r\n\r\n");
});

test("visual alignment gaps are not written as additional file lines", () => {
	assert.equal(serializeEditableLines([
		{ value: "A", rightPresent: true },
		{ value: " \n", isAlignmentGap: true, rightPresent: true },
		{ value: "B", rightPresent: true },
	]), "A\nB");
});

test("text entered into an alignment gap is kept when serialized", () => {
	assert.equal(serializeEditableLines([
		{ value: "A", rightPresent: true },
		{ value: "neu", rightPresent: false },
	]), "A\nneu");
});
