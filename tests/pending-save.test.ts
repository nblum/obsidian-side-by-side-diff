import { test } from "node:test";
import assert from "node:assert/strict";
import { writePendingChanges, type FileSaveResult } from "../src/pending-save.ts";

test("saves all pending files in insertion order", async () => {
	const saved: string[] = [];
	const removed: string[] = [];
	const result = await writePendingChanges(
		[
			{ path: "first.md", content: "first" },
			{ path: "second.md", content: "second" }
		],
		(path) => path,
		async (file, content): Promise<FileSaveResult> => {
			saved.push(`${file}:${content}`);
			return "saved";
		},
		(path) => { removed.push(path); }
	);

	assert.equal(result, "saved");
	assert.deepEqual(saved, ["first.md:first", "second.md:second"]);
	assert.deepEqual(removed, ["first.md", "second.md"]);
});

test("does not save anything when one pending file is unavailable", async () => {
	let saveCalls = 0;
	const result = await writePendingChanges(
		[
			{ path: "available.md", content: "available" },
			{ path: "missing.md", content: "missing" }
		],
		(path) => path === "missing.md" ? null : path,
		async (): Promise<FileSaveResult> => {
			saveCalls += 1;
			return "saved";
		},
		() => {}
	);

	assert.equal(result, "unavailable");
	assert.equal(saveCalls, 0);
});

test("stops after a conflict and keeps later entries retryable", async () => {
	const saved: string[] = [];
	const removed: string[] = [];
	const result = await writePendingChanges(
		[
			{ path: "first.md", content: "first" },
			{ path: "conflict.md", content: "conflict" },
			{ path: "later.md", content: "later" }
		],
		(path) => path,
		async (file): Promise<FileSaveResult> => {
			saved.push(file);
			return file === "conflict.md" ? "conflict" : "saved";
		},
		(path) => { removed.push(path); }
	);

	assert.equal(result, "conflict");
	assert.deepEqual(saved, ["first.md", "conflict.md"]);
	assert.deepEqual(removed, ["first.md"]);
});

test("treats an empty pending list as already saved", async () => {
	const result = await writePendingChanges([], () => null, async (): Promise<FileSaveResult> => "saved", () => {});

	assert.equal(result, "saved");
});
