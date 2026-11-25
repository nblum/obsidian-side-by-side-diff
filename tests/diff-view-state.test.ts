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
		mode: "accept",
		direction: "left-to-right",
		originalSide: "right",
		layout: "auto"
	});

	assert.deepEqual(parseDiffViewState({ mode: "unknown", editRight: "true" }), {
		leftPath: null,
		rightPath: null,
		editRight: false,
		mode: "compare",
		direction: "left-to-right",
		originalSide: "left",
		layout: "auto"
	});
});

test("swaps paths and proposal direction while leaving edit mode disabled", () => {
	assert.deepEqual(swapDiffViewState({ leftPath: "left.md", rightPath: "right.md", editRight: true, mode: "proposal" }), {
		leftPath: "right.md",
		rightPath: "left.md",
		editRight: false,
		mode: "accept",
		direction: "left-to-right",
		originalSide: "right",
		layout: "auto"
	});
});

test("restores legacy acceptance tabs with the original on the right before and after swapping", () => {
	const state = parseDiffViewState({ leftPath: "draft.md", rightPath: "original.md", mode: "accept", originalSide: "left" });
	assert.equal(state.originalSide, "right");
	const swapped = swapDiffViewState(state);
	assert.equal(swapped.mode, "proposal");
	assert.equal(swapped.leftPath, "original.md");
	assert.equal(swapped.originalSide, "left");
});

test("keeps a CLI review pointed at its original when switching panes", () => {
	const state = parseDiffViewState({ leftPath: "draft.md", rightPath: "original.md", mode: "review" }, "right-to-left");
	assert.equal(state.direction, "left-to-right");
	assert.equal(state.originalSide, "right");
	const swapped = swapDiffViewState(state);
	assert.equal(swapped.mode, "review");
	assert.equal(swapped.leftPath, "original.md");
	assert.equal(swapped.originalSide, "left");
	assert.equal(swapped.direction, "right-to-left");
	assert.deepEqual(parseDiffViewState(swapped), swapped);
});

test("keeps regular comparisons regular when swapping panes", () => {
	assert.deepEqual(swapDiffViewState({ leftPath: "left.md", rightPath: "right.md", editRight: false, mode: "compare" }), {
		leftPath: "right.md",
		rightPath: "left.md",
		editRight: false,
		mode: "compare",
		direction: "left-to-right",
		originalSide: "right",
		layout: "auto"
	});
});

test("restores a safe empty state for malformed workspace data", () => {
	assert.deepEqual(parseDiffViewState(null), {
		leftPath: null,
		rightPath: null,
		editRight: false,
		mode: "compare",
		direction: "left-to-right",
		originalSide: "left",
		layout: "auto"
	});
});

test("restores direction and original identity independently of file positions", () => {
	const state = parseDiffViewState({ leftPath: "draft.md", rightPath: "original.md", direction: "right-to-left", originalSide: "right" });
	assert.equal(state.direction, "right-to-left");
	assert.equal(state.originalSide, "right");
	const swapped = swapDiffViewState(state);
	assert.equal(swapped.direction, "right-to-left");
	assert.equal(swapped.originalSide, "left");
	assert.equal(swapped.leftPath, "original.md");
});

test("proposal workflows and invalid workspace directions retain safe defaults", () => {
	for (const mode of ["proposal", "accept"]) {
		assert.equal(parseDiffViewState({ mode, direction: "right-to-left" }).direction, "left-to-right");
	}
	assert.equal(parseDiffViewState({ direction: "invalid", originalSide: 12 }).direction, "left-to-right");
	assert.equal(parseDiffViewState({ originalSide: 12 }).originalSide, "left");
});

test("a default direction initializes new comparisons without overriding saved review directions", () => {
	assert.equal(parseDiffViewState({}, "right-to-left").direction, "right-to-left");
	assert.equal(parseDiffViewState({ direction: "invalid" }, "right-to-left").direction, "right-to-left");
	assert.equal(parseDiffViewState({ direction: "left-to-right" }, "right-to-left").direction, "left-to-right");
	assert.equal(parseDiffViewState({ direction: "right-to-left" }, "left-to-right").direction, "right-to-left");
	for (const mode of ["proposal", "accept"]) {
		assert.equal(parseDiffViewState({ mode }, "right-to-left").direction, "left-to-right");
	}
});
