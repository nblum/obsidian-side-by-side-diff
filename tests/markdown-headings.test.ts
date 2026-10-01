import { test } from "node:test";
import assert from "node:assert/strict";
import { alignSequences, applyAlignedRowChange, indexDiffRows, joinLines } from "../src/diff-core.ts";
import { createComparisonModel, createComparisonModelFromLines, createIndexedDiffRowsFromLines } from "../src/diff-model.ts";
import { findMarkdownHeadings } from "../src/markdown-headings.ts";
import { getActionableRowIndexes, groupChangeRows } from "../src/diff-grouping.ts";
import { DiffSession } from "../src/diff-session.ts";

const options = { alignMarkdownByHeadings: true };

/** Generates synthetic lines without using private document material. */
function lines(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${String(index)}`);
}

/** Builds the ordinary indexed diff for exact compatibility comparisons. */
function ordinaryRows(left: string[], right: string[]) {
	return indexDiffRows(alignSequences(left, right, (a, b) => a === b));
}

test("recovers later sections in large Markdown while disabled mode preserves index fallback", () => {
	const right = ["prefix", "## First", ...lines("first", 400), "## Second", ...lines("second", 400), "## Third", ...lines("third", 400), "suffix"];
	const left = [...right.slice(0, 2), ...lines("inserted", 250), ...right.slice(2)];
	assert.ok(left.length * right.length > 1_000_000);
	const disabled = createIndexedDiffRowsFromLines(left, right, { alignMarkdownByHeadings: false });
	assert.deepEqual(disabled, ordinaryRows(left, right));
	assert.deepEqual(createIndexedDiffRowsFromLines(left, right), disabled);
	assert.equal(disabled.length, left.length);
	assert.equal(disabled.find((row) => row.left === "## Second")?.equal, false);
	const enabled = createIndexedDiffRowsFromLines(left, right, options);
	for (const heading of ["## Second", "## Third"]) {
		const row = enabled.find((candidate) => candidate.left === heading);
		assert.ok(row);
		assert.equal(row.right, heading);
		assert.equal(row.equal, true);
		assert.equal(row.leftIndex - row.rightIndex, 250);
	}
	assert.equal(enabled.filter((row) => !row.equal).length, 250);
	assert.ok(enabled.filter((row) => row.left?.startsWith("second-") || row.left?.startsWith("third-")).every((row) => row.equal));
	assert.deepEqual(enabled.filter((row) => row.left !== null).map((row) => row.left), left);
	assert.deepEqual(enabled.filter((row) => row.right !== null).map((row) => row.right), right);
});

test("hard heading boundaries prevent identical content from aligning across sections", () => {
	const left = ["repeat", "repeat", "## Shared", "tail"];
	const right = ["prefix", "## Shared", "repeat", "repeat", "tail"];
	const rows = createIndexedDiffRowsFromLines(left, right, options);
	const anchor = rows.findIndex((row) => row.left === "## Shared");
	assert.equal(rows[anchor]?.right, "## Shared");
	assert.ok(rows.slice(0, anchor).every((row) => row.left !== "repeat" || row.right !== "repeat"));
	assert.ok(rows.slice(anchor + 1).every((row) => row.right !== "repeat" || row.left === null));
	assert.equal(rows.at(-1)?.equal, true);
});

test("inserted and removed headings remain changed content before a later shared anchor", () => {
	const shorter = ["## One", "body", "## Two", "tail"];
	const longer = ["## One", "body", "## Added", "extra", "## Two", "tail"];
	for (const [left, right] of [[longer, shorter], [shorter, longer]] as const) {
		const rows = createIndexedDiffRowsFromLines(left, right, options);
		const added = rows.find((row) => row.left === "## Added" || row.right === "## Added");
		assert.ok(added);
		assert.equal(added.equal, false);
		assert.ok(added.left === null || added.right === null);
		const later = rows.find((row) => row.left === "## Two");
		assert.equal(later?.right, "## Two");
		assert.equal(later?.equal, true);
		assert.equal(rows.at(-1)?.equal, true);
	}
});

test("renamed, different-level, case-different and internally spaced headings are not anchors", () => {
	for (const other of ["## Sections", "### Section", "## section", "## Section  Name"]) {
		const heading = other.includes("Name") ? "## Section Name" : "## Section";
		const left = [heading, "same", "same", "## Later", "tail"];
		const right = ["same", "same", other, "## Later", "tail"];
		const rows = createIndexedDiffRowsFromLines(left, right, options);
		// The shared ordinary lines can align through an unmatched heading.
		assert.equal(rows.filter((row) => row.left === "same" && row.equal).length, 2);
		assert.equal(rows.find((row) => row.left === heading)?.right, null);
		assert.equal(rows.find((row) => row.left === "## Later")?.right, "## Later");
	}
});

test("duplicate headings align deterministically in sequence without losing occurrences", () => {
	const left = ["## Repeat", "one", "## Inserted", "extra", "## Repeat", "two", "## Repeat", "three"];
	const right = ["## Repeat", "one", "## Repeat", "two", "## Repeat", "three"];
	const expected = createIndexedDiffRowsFromLines(left, right, options);
	assert.deepEqual(createIndexedDiffRowsFromLines(left, right, options), expected);
	assert.deepEqual(expected.filter((row) => row.left === "## Repeat").map((row) => [row.leftIndex, row.rightIndex, row.equal]), [[0, 0, true], [4, 2, true], [6, 4, true]]);
	const uneven = createIndexedDiffRowsFromLines(["## Repeat", "a", "## Repeat", "b"], ["## Repeat", "a"], options);
	assert.equal(uneven.filter((row) => row.left === "## Repeat").length, 2);
	assert.equal(uneven.filter((row) => row.left === "## Repeat" && row.equal).length, 1);
});

test("recognizes all ATX levels and normalizes only allowed surrounding syntax", () => {
	assert.deepEqual(findMarkdownHeadings([
		"# One", "##\tTwo ###\t", "   ### Three   ", "#### Four", "##### Five", "###### Six",
		"####### Too deep", "#No separator", "    ## Indented code", "\t## Indented code", "Setext", "---", "##", "## ###", "## Hash#", "## Case  Sensitive"
	]).map(({ level, text }) => [level, text]), [
		[1, "One"], [2, "Two"], [3, "Three"], [4, "Four"], [5, "Five"], [6, "Six"], [2, ""], [2, ""], [2, "Hash#"], [2, "Case  Sensitive"]
	]);
	const rows = createIndexedDiffRowsFromLines(["prefix", "   ##\tShared ### ", "tail"], ["prefix", "extra", "## Shared", "tail"], options);
	const anchor = rows.find((row) => row.left === "   ##\tShared ### ");
	assert.equal(anchor?.right, "## Shared");
	assert.equal(anchor?.equal, false, "Literal heading syntax edits must remain reviewable");
	assert.equal(rows.at(-1)?.equal, true);
});

test("ignores headings inside both fence types, including longer and unclosed fences", () => {
	for (const marker of ["`", "~"]) {
		const document = ["## Before", `${marker.repeat(4)}text`, "## Hidden", marker.repeat(3), "## Still hidden", marker === "`" ? "~~~" : "```", "## Also hidden", `${marker.repeat(5)} trailing`, "## Not closed", `  ${marker.repeat(5)}\t`, "## After", marker.repeat(3), "## Unclosed"];
		assert.deepEqual(findMarkdownHeadings(document).map((heading) => heading.text), ["Before", "After"]);
		const left = [marker.repeat(3), "## Fake", "same", "same", marker.repeat(3), "## Real", "tail"];
		const right = [marker.repeat(3), "same", "same", "## Fake", marker.repeat(3), "## Real", "tail"];
		const rows = createIndexedDiffRowsFromLines(left, right, options);
		assert.equal(rows.filter((row) => row.left === "same" && row.equal).length, 2);
		assert.equal(rows.find((row) => row.left === "## Fake")?.right, null);
	}
	assert.deepEqual(findMarkdownHeadings(["```invalid`info", "## Real"]).map((heading) => heading.text), ["Real"]);
});

test("prefix and suffix retain ordinary diffs and no usable headings retain full fallback", () => {
	const left = ["prefix", "inserted", "## Shared", "tail", "removed"];
	const right = ["prefix", "## Shared", "tail", "added"];
	const rows = createIndexedDiffRowsFromLines(left, right, options);
	assert.equal(rows[1]?.left, "inserted");
	assert.equal(rows[1]?.right, null);
	assert.equal(rows.at(-1)?.left, "removed");
	assert.equal(rows.at(-1)?.right, "added");
	for (const [a, b] of [
		[lines("left", 1_001), lines("right", 1_001)],
		[["## Left", "same"], ["## Right", "same"]],
		[["## Left", "same"], ["same"]],
		[[], []]
	]) {
		assert.ok(a && b);
		assert.deepEqual(createIndexedDiffRowsFromLines(a, b, options), ordinaryRows(a, b));
	}
});

test("an oversized individual range retains index fallback and the next heading resynchronizes", () => {
	const rightSection = lines("body", 1_001);
	const leftSection = ["inserted", ...rightSection];
	assert.ok(leftSection.length * rightSection.length > 1_000_000);
	const rows = createIndexedDiffRowsFromLines(["## Start", ...leftSection, "## End", "tail"], ["## Start", ...rightSection, "## End", "tail"], options);
	assert.deepEqual(rows.slice(1, -2).map(({ left, right, equal }) => ({ left, right, equal })), alignSequences(leftSection, rightSection, (a, b) => a === b));
	assert.equal(rows[1]?.right, "body-0");
	assert.ok(rows.slice(1, -2).every((row) => !row.equal));
	assert.equal(rows.at(-2)?.left, "## End");
	assert.equal(rows.at(-2)?.right, "## End");
	assert.equal(rows.at(-1)?.equal, true);
});

test("rendered and action rows agree for single and grouped staged changes with undo", () => {
	const right = ["## First", ...lines("first", 500), "## Second", "old-a", "old-b", "old-c", "old-d", ...lines("tail", 500)];
	const left = ["## First", ...lines("insert", 100), ...lines("first", 500), "## Second", "new-a", "new-b", "new-c", "new-d", ...lines("tail", 500)];
	const model = createComparisonModelFromLines(left, right, options);
	const actionRows = createIndexedDiffRowsFromLines(left, right, options);
	assert.deepEqual(model.rows.map((row) => ({ left: row.left, right: row.right, equal: row.equal, leftIndex: row.leftIndex, rightIndex: row.rightIndex, leftLineNumber: row.leftLineNumber, rightLineNumber: row.rightLineNumber })), actionRows);
	assert.deepEqual(createComparisonModel(left.join("\n"), right.join("\n"), options), model);
	const index = model.rows.findIndex((row) => row.left === "new-b");
	const row = actionRows[index];
	assert.ok(row);
	const single = applyAlignedRowChange(left, right, row, "left-to-right");
	assert.equal(single.rightLines[right.indexOf("old-b")], "new-b");
	assert.equal(single.rightLines[right.indexOf("old-a")], "old-a");
	const group = groupChangeRows(model.rows).find((candidate) => index >= candidate.startIndex && index <= candidate.endIndex);
	assert.ok(group);
	let grouped = { leftLines: left, rightLines: right };
	for (const rowIndex of getActionableRowIndexes(actionRows, group.startIndex, group.endIndex).reverse()) {
		const changedRow = actionRows[rowIndex];
		assert.ok(changedRow);
		grouped = applyAlignedRowChange(grouped.leftLines, grouped.rightLines, changedRow, "left-to-right");
	}
	assert.deepEqual(grouped.rightLines, right.map((line) => line.replace(/^old-/, "new-")));
	const original = right.join("\r\n") + "\r\n";
	const session = new DiffSession();
	session.stageChange("synthetic.md", joinLines(grouped.rightLines, original), original);
	assert.equal(session.getDisplayedContent("synthetic.md", original), joinLines(grouped.rightLines, original));
	assert.equal(session.undo(), true);
	assert.equal(session.getDisplayedContent("synthetic.md", original), original);
});
