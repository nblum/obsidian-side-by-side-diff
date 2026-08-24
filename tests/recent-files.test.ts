import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getRecentFiles, normalizeRecentFilePaths, orderRecentFiles, rememberRecentFilePath } from "../src/recent-files.ts";

describe("recent file history", () => {
	test("normalizes persisted paths to five unique entries", () => {
		assert.deepEqual(normalizeRecentFilePaths(["a", "b", "a", 4, "c", "d", "e", "f"]), ["a", "b", "c", "d", "e"]);
	});

	test("moves the selected path to the front", () => {
		assert.deepEqual(rememberRecentFilePath(["a", "b", "c"], "b"), ["b", "a", "c"]);
	});

	test("orders available files recent-first and ignores missing paths", () => {
		const files = [{ path: "a" }, { path: "b" }, { path: "c" }];

		assert.deepEqual(orderRecentFiles(files, ["missing", "c", "a"]), [
			{ path: "c" },
			{ path: "a" },
			{ path: "b" }
		]);
		assert.deepEqual(getRecentFiles(files, ["missing", "c", "a"]), [{ path: "c" }, { path: "a" }]);
	});
});
