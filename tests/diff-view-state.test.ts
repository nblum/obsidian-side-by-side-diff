import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDiffViewState, swapDiffViewState } from "../src/diff-view-state.ts";

test("parses only supported persisted comparison state", () => {
	assert.deepEqual(parseDiffViewState({
		leftPath: "left.md",
		rightPath: 42,
		editRight: true,
		mode: "accept"
	}), {
		leftPath: "left.md",
		rightPath: null,
		editRight: true,
		mode: "accept"
	});

	assert.deepEqual(parseDiffViewState({ mode: "unknown", editRight: "true" }), {
		leftPath: null,
		rightPath: null,
		editRight: false,
		mode: "compare"
	});
});

test("swaps paths and proposal direction while leaving edit mode disabled", () => {
	assert.deepEqual(swapDiffViewState({ leftPath: "left.md", rightPath: "right.md", editRight: true, mode: "proposal" }), {
		leftPath: "right.md",
		rightPath: "left.md",
		editRight: false,
		mode: "accept"
	});
});

test("keeps regular comparisons regular when swapping panes", () => {
	assert.deepEqual(swapDiffViewState({ leftPath: "left.md", rightPath: "right.md", editRight: false, mode: "compare" }), {
		leftPath: "right.md",
		rightPath: "left.md",
		editRight: false,
		mode: "compare"
	});
});

test("restores a safe empty state for malformed workspace data", () => {
	assert.deepEqual(parseDiffViewState(null), {
		leftPath: null,
		rightPath: null,
		editRight: false,
		mode: "compare"
	});
});
