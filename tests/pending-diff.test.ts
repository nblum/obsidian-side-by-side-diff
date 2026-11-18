import { test } from "node:test";
import assert from "node:assert/strict";
import { createPendingTargetPreview } from "../src/pending-diff.ts";

test("pending insertions and replacements mark current target indexes and retain removed saved lines", () => {
	const preview = createPendingTargetPreview("A\nold\nZ", "A\nnew\ninserted\nZ");
	assert.deepEqual([...preview.changedLines], [1, 2]);
	assert.deepEqual([...preview.deletions], [[1, [{ value: "old", lineNumber: 2 }]]]);
});

test("multiple removed lines share the next current line's position in saved order", () => {
	const preview = createPendingTargetPreview("A\none\ntwo\nZ\ntail", "A\nZ");
	assert.deepEqual([...preview.changedLines], []);
	assert.deepEqual([...preview.deletions], [
		[1, [{ value: "one", lineNumber: 2 }, { value: "two", lineNumber: 3 }]],
		[2, [{ value: "tail", lineNumber: 5 }]]
	]);
});

test("pending previews cover an empty target and preserve blank and whitespace-only deleted lines", () => {
	const preview = createPendingTargetPreview("\r\n  \r\nlast\r\n", "");
	assert.deepEqual([...preview.deletions], [[0, [
		{ value: "", lineNumber: 1 }, { value: "  ", lineNumber: 2 }, { value: "last", lineNumber: 3 }
	]]]);
	assert.deepEqual([...preview.changedLines], []);
	const added = createPendingTargetPreview("", "\n  \n");
	assert.deepEqual([...added.changedLines], [0, 1]);
	assert.deepEqual([...added.deletions], []);
});

test("unchanged content and line ending differences produce no pending text markers", () => {
	const preview = createPendingTargetPreview("A\r\n\r\nZ\r\n", "A\n\nZ\n");
	assert.deepEqual([...preview.changedLines], []);
	assert.deepEqual([...preview.deletions], []);
});

test("repeated anchor lines preserve each pending edit at its current target index", () => {
	const preview = createPendingTargetPreview("same\nold\nsame\nend", "same\nnew\nsame\nextra\nend");
	assert.deepEqual([...preview.changedLines], [1, 3]);
	assert.deepEqual([...preview.deletions], [[1, [{ value: "old", lineNumber: 2 }]]]);
});
