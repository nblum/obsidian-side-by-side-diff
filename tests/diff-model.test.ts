import { test } from "node:test";
import assert from "node:assert/strict";
import { createComparisonModel, createIndexedDiffRowsFromLines } from "../src/diff-model.ts";

interface ExpectedRow {
	type: string;
	left: string | null;
	right: string | null;
	leftLineNumber: number | null;
	rightLineNumber: number | null;
}

/** Projects the renderer contract to stable values suitable for assertions. */
function summarizeRows(leftContent: string, rightContent: string): ExpectedRow[] {
	return createComparisonModel(leftContent, rightContent).rows.map((row) => ({
		type: row.type,
		left: row.left,
		right: row.right,
		leftLineNumber: row.leftLineNumber,
		rightLineNumber: row.rightLineNumber,
	}));
}

test("creates stable rows for identical, changed, inserted, and removed lines", () => {
	const cases: Array<{ name: string; left: string; right: string; expected: ExpectedRow[] }> = [
		{
			name: "identical lines",
			left: "A\nB",
			right: "A\nB",
			expected: [
				{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
				{ type: "equal", left: "B", right: "B", leftLineNumber: 2, rightLineNumber: 2 },
			],
		},
		{
			name: "changed line",
			left: "A\nold\nC",
			right: "A\nnew\nC",
			expected: [
				{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
				{ type: "changed", left: "old", right: "new", leftLineNumber: 2, rightLineNumber: 2 },
				{ type: "equal", left: "C", right: "C", leftLineNumber: 3, rightLineNumber: 3 },
			],
		},
		{
			name: "inserted line",
			left: "A\nC",
			right: "A\nB\nC",
			expected: [
				{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
				{ type: "added", left: null, right: "B", leftLineNumber: null, rightLineNumber: 2 },
				{ type: "equal", left: "C", right: "C", leftLineNumber: 2, rightLineNumber: 3 },
			],
		},
		{
			name: "removed line",
			left: "A\nB\nC",
			right: "A\nC",
			expected: [
				{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
				{ type: "removed", left: "B", right: null, leftLineNumber: 2, rightLineNumber: null },
				{ type: "equal", left: "C", right: "C", leftLineNumber: 3, rightLineNumber: 2 },
			],
		},
	];

	for (const comparisonCase of cases) {
		assert.deepEqual(summarizeRows(comparisonCase.left, comparisonCase.right), comparisonCase.expected, comparisonCase.name);
	}
});

test("keeps blank lines and line-ending normalization visible in the row model", () => {
	assert.deepEqual(summarizeRows("A\r\n\r\nC", "A\nC"), [
		{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
		{ type: "removed", left: "", right: null, leftLineNumber: 2, rightLineNumber: null },
		{ type: "equal", left: "C", right: "C", leftLineNumber: 3, rightLineNumber: 2 },
	]);
});

test("does not create a synthetic row for a final line ending", () => {
	assert.deepEqual(summarizeRows("A\n", "A"), [
		{ type: "equal", left: "A", right: "A", leftLineNumber: 1, rightLineNumber: 1 },
	]);
});

test("exposes inline tokens only for paired changed lines", () => {
	const model = createComparisonModel("Status: draft\nOnly left", "Status: final\n");

	assert.equal(model.changedCount, 2);
	assert.deepEqual(model.rows[0]?.leftInlineTokens, [
		{ value: "Status:", changed: false },
		{ value: " ", changed: false },
		{ value: "draft", changed: true },
	]);
	assert.deepEqual(model.rows[0]?.rightInlineTokens, [
		{ value: "Status:", changed: false },
		{ value: " ", changed: false },
		{ value: "final", changed: true },
	]);
	assert.deepEqual(model.rows[1]?.leftInlineTokens, []);
	assert.deepEqual(model.rows[1]?.rightInlineTokens, []);
});

test("can build indexed rows without inline token work", () => {
	const rows = createIndexedDiffRowsFromLines(["A", "old"], ["A", "new"]);

	assert.deepEqual(rows[1], {
		left: "old",
		right: "new",
		equal: false,
		leftIndex: 1,
		rightIndex: 1,
		leftLineNumber: 2,
		rightLineNumber: 2,
	});
});

test("uses deterministic index alignment for very large comparisons", () => {
	const left = Array.from({ length: 1_001 }, (_, index) => `left-${String(index)}`).join("\n");
	const right = Array.from({ length: 1_001 }, (_, index) => `right-${String(index)}`).join("\n");
	const model = createComparisonModel(left, right);

	assert.equal(model.rows.length, 1_001);
	assert.equal(model.changedCount, 1_001);
	assert.equal(model.rows[0]?.leftLineNumber, 1);
	assert.equal(model.rows[1_000]?.rightLineNumber, 1_001);
});
