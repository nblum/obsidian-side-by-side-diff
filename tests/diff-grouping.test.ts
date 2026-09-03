import { test } from "node:test";
import assert from "node:assert/strict";
import { countGroupChangedRows, getActionableRowIndexes, groupChangeRows } from "../src/diff-grouping.ts";
import type { DiffRow } from "../src/diff-core.ts";

function row(left: string | null, right: string | null, equal: boolean): DiffRow {
	return { left, right, equal };
}

test("returns no group for a single isolated changed row", () => {
	const rows = [row("a", "a", true), row("x", "y", false), row("b", "b", true)];

	assert.deepEqual(groupChangeRows(rows), []);
});

test("reports adjacent changed rows as an unbridged group", () => {
	const rows = [row("x1", "y1", false), row("x2", "y2", false)];

	assert.deepEqual(groupChangeRows(rows), [{ startIndex: 0, endIndex: 1, bridgesBlankLines: false }]);
});

test("bridges a single blank line between two changed rows", () => {
	const rows = [row("x1", "y1", false), row("", "", true), row("x2", "y2", false)];

	assert.deepEqual(groupChangeRows(rows), [{ startIndex: 0, endIndex: 2, bridgesBlankLines: true }]);
});

test("bridges several changed paragraphs separated by blank lines", () => {
	const rows = [
		row("heading", "heading", true),
		row("p1-old", "p1-new", false),
		row("", "", true),
		row("p2-old", "p2-new", false),
		row("", "", true),
		row("p3-old", "p3-new", false),
		row("", "", true),
		row("next heading", "next heading", true),
	];

	assert.deepEqual(groupChangeRows(rows), [{ startIndex: 1, endIndex: 5, bridgesBlankLines: true }]);
});

test("does not extend a group into trailing blank lines with no further change", () => {
	const rows = [row("x1", "y1", false), row("", "", true), row("", "", true), row("same", "same", true)];

	assert.deepEqual(groupChangeRows(rows), []);
});

test("treats a blank line differing between the panes as a regular changed row, not a bridge", () => {
	const rows = [row("x1", "y1", false), row("", "  ", false), row("x2", "y2", false)];

	assert.deepEqual(groupChangeRows(rows), [{ startIndex: 0, endIndex: 2, bridgesBlankLines: false }]);
});

test("ignores a blank-line bridge before any changed row has opened a group", () => {
	const rows = [row("", "", true), row("x1", "y1", false)];

	assert.deepEqual(groupChangeRows(rows), []);
});

test("counts only the non-equal rows inside a group span", () => {
	const rows = [
		row("p1-old", "p1-new", false),
		row("", "", true),
		row("p2-old", "p2-new", false),
		row("", "", true),
		row("p3-old", "p3-new", false),
	];

	assert.equal(countGroupChangedRows(rows, { startIndex: 0, endIndex: 4, bridgesBlankLines: true }), 3);
});

test("ignores changed rows outside the given group span", () => {
	const rows = [row("outside", "outside", false), row("a", "b", false), row("c", "d", false)];

	assert.equal(countGroupChangedRows(rows, { startIndex: 1, endIndex: 2, bridgesBlankLines: false }), 2);
});

test("excludes rows the caller reports as already resolved", () => {
	const rows = [row("a", "b", false), row("c", "d", false), row("e", "f", false)];
	const group = { startIndex: 0, endIndex: 2, bridgesBlankLines: false };

	assert.equal(countGroupChangedRows(rows, group, (_row, index) => index === 1), 2);
	assert.equal(countGroupChangedRows(rows, group, () => true), 0);
});

test("getActionableRowIndexes returns every changed index in range by default", () => {
	const rows = [row("a", "a", true), row("x1", "y1", false), row("x2", "y2", false), row("b", "b", true)];

	assert.deepEqual(getActionableRowIndexes(rows, 0, 3), [1, 2]);
});

test("getActionableRowIndexes excludes an individually dismissed row from a block-wide action", () => {
	// Mirrors "Accept all"/"Ignore all": a row the user already resolved on its own must not be
	// re-touched when the surrounding block is actioned as a whole.
	const rows = [row("x1", "y1", false), row("x2", "y2", false), row("x3", "y3", false)];

	const actionable = getActionableRowIndexes(rows, 0, 2, (_row, index) => index === 1);

	assert.deepEqual(actionable, [0, 2]);
});

test("getActionableRowIndexes returns an empty list once every row in range is resolved", () => {
	const rows = [row("x1", "y1", false), row("x2", "y2", false)];

	assert.deepEqual(getActionableRowIndexes(rows, 0, 1, () => true), []);
});
