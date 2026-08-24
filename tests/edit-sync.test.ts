import { test } from "node:test";
import assert from "node:assert/strict";
import { hasEditableLineStructureChanged } from "../src/edit-sync.ts";

test("does not request a layout sync for normal character input", () => {
	assert.equal(hasEditableLineStructureChanged("insertText", 4, 4), false);
	assert.equal(hasEditableLineStructureChanged("insertCompositionText", 4, 4), false);
});

test("requests a layout sync when the line count changes", () => {
	assert.equal(hasEditableLineStructureChanged("insertText", 4, 5), true);
	assert.equal(hasEditableLineStructureChanged("deleteContentBackward", 5, 4), true);
});

test("falls back to syncing unknown input without a beforeinput snapshot", () => {
	assert.equal(hasEditableLineStructureChanged("insertFromPaste", null, 4), true);
});

test("does not sync normal text input without a beforeinput snapshot", () => {
	assert.equal(hasEditableLineStructureChanged("insertText", null, 4), false);
	assert.equal(hasEditableLineStructureChanged("insertCompositionText", null, 4), false);
});
