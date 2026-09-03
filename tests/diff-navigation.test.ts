import { test } from "node:test";
import assert from "node:assert/strict";
import { clearChangeTargetMetadata, getAutoAdvanceTargetPosition, getChangeKeyboardAction, getChangeRowIndexes, getNextChangeIndex, isUndoShortcut } from "../src/diff-navigation.ts";

test("maps Alt-arrow shortcuts to navigation and change actions", () => {
	assert.equal(getChangeKeyboardAction("ArrowUp", true, false, false, false), "previous");
	assert.equal(getChangeKeyboardAction("ArrowDown", true, false, false, false), "next");
	assert.equal(getChangeKeyboardAction("ArrowLeft", true, false, false, false), "reject");
	assert.equal(getChangeKeyboardAction("ArrowRight", true, false, false, false), "accept");
});

test("does not map modified or unmodified arrow shortcuts", () => {
	assert.equal(getChangeKeyboardAction("ArrowLeft", false, false, false, false), null);
	assert.equal(getChangeKeyboardAction("ArrowRight", true, true, false, false), null);
	assert.equal(getChangeKeyboardAction("ArrowRight", true, false, true, false), null);
	assert.equal(getChangeKeyboardAction("ArrowRight", true, false, false, true), null);
});

test("clears navigation metadata from a newly split editable line", () => {
	const attributes: string[] = [];
	const classes = new Set(["file-diff-sbs-active-change", "file-diff-sbs-edit-line"]);
	const target = {
		dataset: { diffRowIndex: "4", diffChange: "true" },
		classList: { remove: (...names: string[]) => names.forEach((name) => classes.delete(name)) },
		removeAttribute: (name: string) => { attributes.push(name); },
	} as unknown as Pick<HTMLElement, "dataset" | "classList" | "removeAttribute">;

	clearChangeTargetMetadata(target);

	assert.equal(target.dataset.diffRowIndex, undefined);
	assert.equal(target.dataset.diffChange, undefined);
	assert.deepEqual(attributes, ["aria-current"]);
	assert.equal(classes.has("file-diff-sbs-active-change"), false);
	assert.equal(classes.has("file-diff-sbs-edit-line"), true);
});

test("collects only non-equal rows as navigation targets", () => {
	assert.deepEqual(getChangeRowIndexes([
		{ equal: true },
		{ equal: false },
		{ equal: true },
		{ equal: false },
	]), [1, 3]);
});

test("navigates forward and backward with wraparound", () => {
	const changes = [1, 3, 7];

	assert.equal(getNextChangeIndex(changes, null, "next"), 1);
	assert.equal(getNextChangeIndex(changes, 1, "next"), 3);
	assert.equal(getNextChangeIndex(changes, 7, "next"), 1);
	assert.equal(getNextChangeIndex(changes, null, "previous"), 7);
	assert.equal(getNextChangeIndex(changes, 7, "previous"), 3);
	assert.equal(getNextChangeIndex(changes, 1, "previous"), 7);
});

test("continues after a previously selected change was resolved", () => {
	assert.equal(getNextChangeIndex([2, 5], 3, "next"), 5);
	assert.equal(getNextChangeIndex([2, 5], 3, "previous"), 2);
	assert.equal(getNextChangeIndex([], null, "next"), null);
});

test("recognizes Ctrl+Z and Cmd+Z as the undo shortcut", () => {
	assert.equal(isUndoShortcut("z", true, false, false), true);
	assert.equal(isUndoShortcut("Z", false, true, false), true);
	assert.equal(isUndoShortcut("z", true, false, true), false);
	assert.equal(isUndoShortcut("z", false, false, false), false);
	assert.equal(isUndoShortcut("y", true, false, false), false);
});

test("auto-advance follows target order after LCS row realignment", () => {
	assert.equal(getAutoAdvanceTargetPosition(1, 0, true), 0);
	assert.equal(getAutoAdvanceTargetPosition(2, 1, true), 1);
	assert.equal(getAutoAdvanceTargetPosition(0, 0, true), null);
	assert.equal(getAutoAdvanceTargetPosition(2, null, true), null);
	assert.equal(getAutoAdvanceTargetPosition(2, 0, false), null);
});
