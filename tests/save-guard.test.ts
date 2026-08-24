import { test } from "node:test";
import assert from "node:assert/strict";
import { captureSaveBaseline, createGuardedSaveTransform, migrateSaveEntry, refreshSaveBaseline, SaveConflictError, hasExternalFileChange } from "../src/save-guard.ts";

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

test("refreshes a baseline after the user has been warned about a conflict", () => {
	const baselines = new Map<string, string>([["note.md", "before"]]);

	refreshSaveBaseline(baselines, "note.md", "external");

	assert.equal(baselines.get("note.md"), "external");
});

test("migrates path-keyed save state after a rename", () => {
	const entries = new Map<string, string>([["old.md", "staged"]]);

	migrateSaveEntry(entries, "old.md", "new.md");

	assert.equal(entries.get("old.md"), undefined);
	assert.equal(entries.get("new.md"), "staged");
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

test("allows a retry only after the conflict baseline is refreshed", () => {
	const baselines = new Map<string, string>([["note.md", "before"]]);
	let transformCalls = 0;
	const transform = (currentContent: string): string => {
		transformCalls += 1;
		return `${currentContent}!`;
	};

	assert.throws(() => createGuardedSaveTransform(baselines.get("note.md"), transform)("external"), SaveConflictError);
	refreshSaveBaseline(baselines, "note.md", "external");
	assert.equal(createGuardedSaveTransform(baselines.get("note.md"), transform)("external"), "external!");
	assert.equal(transformCalls, 1);
});

test("does not invoke a save transform without a captured baseline", () => {
	let transformCalls = 0;
	const transform = createGuardedSaveTransform(undefined, () => {
		transformCalls += 1;
		return "unexpected";
	});

	assert.throws(() => transform("content"), SaveConflictError);
	assert.equal(transformCalls, 0);
});
