import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	alignSequences,
	applyAlignedRowChange,
	convertLineEndings,
	getIgnoredDiffRow,
	getDiffRowType,
	getInlineDiffTokens,
	getLineSyncPlan,
	indexDiffRows,
	joinLines,
	serializeEditableLines,
	splitLines,
	type IndexedDiffRow,
} from "../src/diff-core.ts";

/** Builds indexed rows for a pair of test documents. */
function getRows(leftContent: string, rightContent: string): IndexedDiffRow[] {
	const leftLines = splitLines(leftContent);
	const rightLines = splitLines(rightContent);
	return indexDiffRows(alignSequences(leftLines, rightLines, (left, right) => left === right));
}

test("left-only arrow changes are inserted without overwriting the following right line", () => {
	const rows = getRows("A\nB\nC", "A\nC");
	const changedRow = rows.find((row) => row.left === "B");
	assert.ok(changedRow);

	const result = applyAlignedRowChange(["A", "B", "C"], ["A", "C"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "B", "C"]);
});

test("right-only arrow changes remove only the right-side row", () => {
	const rows = getRows("A\nC", "A\nB\nC");
	const changedRow = rows.find((row) => row.right === "B");
	assert.ok(changedRow);

	const result = applyAlignedRowChange(["A", "C"], ["A", "B", "C"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "C"]);
});

test("changed rows replace the target line instead of inserting a duplicate", () => {
	const rows = getRows("A\nB", "A\nX");
	const changedRow = rows.find((row) => row.left === "B" && row.right === "X");
	assert.ok(changedRow);

	const result = applyAlignedRowChange(["A", "B"], ["A", "X"], changedRow, "left-to-right");

	assert.deepEqual(result.rightLines, ["A", "B"]);
});

test("changed rows can be applied from right to left", () => {
	const rows = getRows("A\nold\nC", "A\nnew\nC");
	const changedRow = rows.find((row) => row.left === "old" && row.right === "new");
	assert.ok(changedRow);

	const result = applyAlignedRowChange(["A", "old", "C"], ["A", "new", "C"], changedRow, "right-to-left");

	assert.deepEqual(result.leftLines, ["A", "new", "C"]);
	assert.deepEqual(result.rightLines, ["A", "new", "C"]);
});

test("keeps duplicate anchors deterministic when a block changes between them", () => {
	const rows = getRows("start\nsame\nold\nsame\nend", "start\nsame\nnew\nend");

	assert.deepEqual(rows.map((row) => ({ left: row.left, right: row.right, equal: row.equal })), [
		{ left: "start", right: "start", equal: true },
		{ left: "same", right: "same", equal: true },
		{ left: "old", right: "new", equal: false },
		{ left: "same", right: null, equal: false },
		{ left: "end", right: "end", equal: true },
	]);
});

test("ignoring a diff keeps a right-only line visible", () => {
	const rows = getRows("A", "A\nB");
	const changedRow = rows.find((row) => row.right === "B");
	assert.ok(changedRow);
	const ignoredRow = getIgnoredDiffRow(changedRow);
	assert.ok(ignoredRow);

	assert.equal(ignoredRow.left, null);
	assert.equal(ignoredRow.right, "B");
	assert.equal(ignoredRow.equal, true);
});

test("ignoring a model row does not retain stale rendering metadata", () => {
	const rows = getRows("A\nold", "A\nnew");
	const changedRow = rows.find((row) => row.left === "old");
	assert.ok(changedRow);
	const modelRow = Object.assign(changedRow, {
		type: "changed",
		leftInlineTokens: [],
		rightInlineTokens: [],
	});
	const ignoredRow = getIgnoredDiffRow(modelRow);
	assert.ok(ignoredRow);
	assert.equal(getDiffRowType(ignoredRow), "equal");
	assert.equal("type" in ignoredRow, false);
	assert.equal("leftInlineTokens" in ignoredRow, false);
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

test("joining normalized lines preserves the target line-ending style", () => {
	assert.equal(joinLines(["A", "B"], "A\r\nB\r\n"), "A\r\nB\r\n");
	assert.equal(joinLines(["A", "B"], "A\rB"), "A\rB");
	assert.equal(joinLines(["A", "B"], "A\nB"), "A\nB");
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

test("an intentional empty line remains distinct from a visual alignment gap", () => {
	assert.equal(serializeEditableLines([
		{ value: "A", rightPresent: true },
		{ value: "", rightPresent: true },
		{ value: "B", rightPresent: true },
	]), "A\n\nB");
});

/** Reads a pair of comparison fixtures and returns their aligned rows. */
async function getFixtureRows(leftFixture = "comparison-left.md", rightFixture = "comparison-right.md"): Promise<IndexedDiffRow[]> {
	const [leftContent, rightContent] = await Promise.all([
		readFile(new URL(`./fixtures/${leftFixture}`, import.meta.url), "utf8"),
		readFile(new URL(`./fixtures/${rightFixture}`, import.meta.url), "utf8"),
	]);
	return getRows(leftContent, rightContent);
}

test("comparison fixture assigns the expected line-marking categories", async () => {
	const rows = await getFixtureRows();

	assert.deepEqual(rows.map((row) => ({
		type: getDiffRowType(row),
		left: row.left,
		right: row.right,
	})), [
		{ type: "equal", left: "Fixture header", right: "Fixture header" },
		{ type: "equal", left: "Unchanged line", right: "Unchanged line" },
		{ type: "changed", left: "Status: draft", right: "Status: final" },
		{ type: "removed", left: "Only on the left", right: null },
		{ type: "equal", left: "Unchanged middle line", right: "Unchanged middle line" },
		{ type: "added", left: null, right: "Only on the right" },
		{ type: "equal", left: "Unchanged final line", right: "Unchanged final line" },
	]);
});

test("comparison fixture flags only changed inline tokens", async () => {
	const rows = await getFixtureRows();
	const changedRow = rows.find((row) => getDiffRowType(row) === "changed");
	assert.ok(changedRow);
	assert.equal(changedRow.left, "Status: draft");
	assert.equal(changedRow.right, "Status: final");

	const inlineTokens = getInlineDiffTokens(changedRow.left, changedRow.right);
	assert.deepEqual(inlineTokens.left, [
		{ value: "Status:", changed: false },
		{ value: " ", changed: false },
		{ value: "draft", changed: true },
	]);
	assert.deepEqual(inlineTokens.right, [
		{ value: "Status:", changed: false },
		{ value: " ", changed: false },
		{ value: "final", changed: true },
	]);
});

test("fixture1 assigns the expected line-marking categories", async () => {
	const rows = await getFixtureRows("fixture1-left.md", "fixture1-right.md");

	assert.equal(rows.length, 40);
	assert.deepEqual(rows.filter((row) => getDiffRowType(row) !== "equal").map((row) => ({
		type: getDiffRowType(row),
		left: row.left,
		right: row.right,
	})), [
		{
			type: "changed",
			left: "Local Obsidian plugin for a clear left/right comparison of two text files, with a synchronized view,",
			right: "Local Obsidian plugin for a clear right/left comparison of two text files, with a scroll synchronized view,",
		},
		{
			type: "changed",
			left: "inline-highlighted changes, and controlled change acceptance.",
			right: "inline-highlighted changes and controlled change acceptance.",
		},
		{
			type: "removed",
			left: "![Side-by-Side Diff comparison view](assets/compare-mode.webp)",
			right: null,
		},
		{ type: "removed", left: "", right: null },
		{ type: "changed", left: "- [Three workflows](#three-workflows)", right: "- [Summary](#summary)" },
		{ type: "removed", left: "- [Edit and save](#edit-and-save)", right: null },
		{ type: "removed", left: "- [Installation](#installation)", right: null },
		{ type: "removed", left: "- [Privacy and permissions](#privacy-and-permissions)", right: null },
		{ type: "removed", left: "- [Releases](#releases)", right: null },
		{ type: "removed", left: "- [Development](#development)", right: null },
		{ type: "removed", left: "- [Documentation](#documentation)", right: null },
		{ type: "removed", left: "- [Tests](#tests)", right: null },
		{ type: "added", left: null, right: "" },
		{ type: "added", left: null, right: "## Summary" },
		{ type: "added", left: null, right: "" },
		{ type: "added", left: null, right: "Thats the summary" },
	]);
});
