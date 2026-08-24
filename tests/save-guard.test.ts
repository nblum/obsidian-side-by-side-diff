import { test } from "node:test";
import assert from "node:assert/strict";
import { captureSaveBaseline, createGuardedSaveTransform, SaveConflictError, hasExternalFileChange } from "../src/save-guard.ts";

test("detects external content changes against the save snapshot", () => {
	assert.equal(hasExternalFileChange("A\nB", "A\nB"), false);
	assert.equal(hasExternalFileChange("A\nB", "A\nC"), true);
	assert.equal(hasExternalFileChange(undefined, "A\nB"), true);
});

test("keeps the first save baseline when a view rerenders", () => {
	const baselines = new Map<string, string>();

	captureSaveBaseline(baselines, "note.md", "before");
	captureSaveBaseline(baselines, "note.md", "after");

	assert.equal(baselines.get("note.md"), "before");
});

test("guards the process transform against an external change", () => {
	let transformCalls = 0;
	const transform = createGuardedSaveTransform("before", (currentContent) => {
		transformCalls += 1;
		return `${currentContent}!`;
	});

	assert.equal(transform("before"), "before!");
	assert.throws(() => transform("external"), SaveConflictError);
	assert.equal(transformCalls, 1);
});
