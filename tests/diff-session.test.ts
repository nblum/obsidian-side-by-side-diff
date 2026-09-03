import { test } from "node:test";
import assert from "node:assert/strict";
import { DiffSession, hasUnsavedComparisonChanges } from "../src/diff-session.ts";
import { getDiffRowKey, swapDiffRowKey } from "../src/diff-core.ts";

test("keeps staged content and its first save baseline together", () => {
	const session = new DiffSession();

	session.stageChange("note.md", "staged", "before");
	session.stageChange("note.md", "staged-again", "after");

	assert.equal(session.getDisplayedContent("note.md", "current"), "staged-again");
	assert.deepEqual(session.getPendingChanges(), [{ path: "note.md", content: "staged-again" }]);
	assert.equal(session.getSaveBaseline("note.md"), "before");
});

test("migrates staged state and baselines after a file rename", () => {
	const session = new DiffSession();
	session.stageChange("old.md", "staged", "before");

	session.migratePath("old.md", "new.md");

	assert.equal(session.getDisplayedContent("old.md", "old"), "old");
	assert.equal(session.getDisplayedContent("new.md", "new"), "staged");
	assert.equal(session.getSaveBaseline("new.md"), "before");
});

test("replaces dismissed rows without leaking the internal set", () => {
	const session = new DiffSession();
	session.dismissRow("old-row");

	const rowKeys = session.getDismissedRowKeys();
	rowKeys.push("outside-row");
	assert.deepEqual(session.getDismissedRowKeys(), ["old-row"]);

	session.replaceDismissedRows(["new-row", "another-row"]);

	assert.equal(session.getDismissedRowCount(), 2);
	assert.equal(session.hasDismissedRow("old-row"), false);
	assert.equal(session.hasDismissedRow("new-row"), true);
});

test("removes staged content and its baseline after a successful save", () => {
	const session = new DiffSession();
	session.stageChange("note.md", "staged", "before");

	session.removePendingChange("note.md");
	session.removeSaveBaseline("note.md");

	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.getSaveBaseline("note.md"), undefined);
});

test("clears transient decisions without exposing internal collections", () => {
	const session = new DiffSession();
	session.dismissRow("row");
	session.stageChange("note.md", "staged", "before");
	session.markProposalChangeAccepted();
	session.markProposalCleanupPromptShown();

	session.clearTransientChanges();

	assert.equal(session.hasDismissedRow("row"), false);
	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.hasAcceptedProposalChanges(), true);
	assert.equal(session.hasShownProposalCleanupPrompt(), true);

	session.reset();
	assert.equal(session.hasAcceptedProposalChanges(), false);
	assert.equal(session.hasShownProposalCleanupPrompt(), false);
});

test("does not treat dismissed rows alone as unsaved changes", () => {
	assert.equal(hasUnsavedComparisonChanges(false, false), false);
});

test("treats a dirty right editor as unsaved", () => {
	assert.equal(hasUnsavedComparisonChanges(true, false), true);
});

test("treats staged pending changes as unsaved", () => {
	assert.equal(hasUnsavedComparisonChanges(false, true), true);
});

test("stops reporting unsaved changes once a save clears declines and pending changes", () => {
	const session = new DiffSession();
	session.dismissRow("declined-row");
	session.stageChange("note.md", "accepted", "before");
	assert.equal(hasUnsavedComparisonChanges(false, session.hasPendingChanges()), true);

	// A save writes the staged content but intentionally leaves declined rows dismissed.
	session.removePendingChange("note.md");

	assert.equal(session.getDismissedRowCount(), 1);
	assert.equal(hasUnsavedComparisonChanges(false, session.hasPendingChanges()), false);
});

test("undoes a dismiss by un-dismissing the row", () => {
	const session = new DiffSession();
	session.dismissRow("row-a");

	assert.equal(session.canUndo(), true);
	assert.equal(session.undo(), true);

	assert.equal(session.hasDismissedRow("row-a"), false);
	assert.equal(session.canUndo(), false);
});

test("undoes a whole block dismissal (Ignore all) in a single undo step", () => {
	const session = new DiffSession();
	session.dismissRows(["row-a", "row-b", "row-c"]);

	assert.equal(session.getDismissedRowCount(), 3);
	assert.equal(session.canUndo(), true);

	assert.equal(session.undo(), true);

	assert.equal(session.hasDismissedRow("row-a"), false);
	assert.equal(session.hasDismissedRow("row-b"), false);
	assert.equal(session.hasDismissedRow("row-c"), false);
	assert.equal(session.getDismissedRowCount(), 0);
	assert.equal(session.canUndo(), false);
});

test("does not push an undo entry for a batch dismiss that adds no new rows", () => {
	const session = new DiffSession();
	session.dismissRows(["row-a", "row-b"]);
	session.undo();

	session.dismissRow("row-a");
	assert.equal(session.canUndo(), true);
	session.dismissRows(["row-a"]);

	// Re-dismissing an already-dismissed row must not push a duplicate, no-op undo entry.
	assert.equal(session.undo(), true);
	assert.equal(session.canUndo(), false);
	assert.equal(session.hasDismissedRow("row-a"), false);
});

test("only un-dismisses rows that were newly dismissed by a partially overlapping batch", () => {
	const session = new DiffSession();
	session.dismissRow("row-a");
	session.dismissRows(["row-a", "row-b"]);

	assert.equal(session.undo(), true);

	assert.equal(session.hasDismissedRow("row-a"), true);
	assert.equal(session.hasDismissedRow("row-b"), false);
});

test("undoes the first stage by fully unstaging the file and its baseline", () => {
	const session = new DiffSession();
	session.stageChange("note.md", "staged", "before");

	session.undo();

	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.getSaveBaseline("note.md"), undefined);
});

test("undoes a later stage by restoring the previously staged content, keeping the baseline", () => {
	const session = new DiffSession();
	session.stageChange("note.md", "first", "before");
	session.stageChange("note.md", "second", "before-again");

	session.undo();

	assert.equal(session.getDisplayedContent("note.md", "current"), "first");
	assert.equal(session.getSaveBaseline("note.md"), "before");
});

test("undoes actions in reverse order, one at a time", () => {
	const session = new DiffSession();
	session.dismissRow("row-a");
	session.stageChange("note.md", "staged", "before");

	assert.equal(session.undo(), true);
	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.hasDismissedRow("row-a"), true);

	assert.equal(session.undo(), true);
	assert.equal(session.hasDismissedRow("row-a"), false);

	assert.equal(session.canUndo(), false);
	assert.equal(session.undo(), false);
});

test("does not push an undo entry for dismissing an already-dismissed row", () => {
	const session = new DiffSession();
	session.dismissRow("row-a");
	session.dismissRow("row-a");

	assert.equal(session.undo(), true);
	assert.equal(session.canUndo(), false);
});

test("clears undo history on clearTransientChanges, reset, and clearUndoStack", () => {
	for (const clear of [
		(session: DiffSession) => { session.clearTransientChanges(); },
		(session: DiffSession) => { session.reset(); },
		(session: DiffSession) => { session.clearUndoStack(); },
	]) {
		const session = new DiffSession();
		session.dismissRow("row-a");

		clear(session);

		assert.equal(session.canUndo(), false);
	}
});

test("migrates a staged undo entry's path after a rename", () => {
	const session = new DiffSession();
	session.stageChange("old.md", "staged", "before");

	session.migratePath("old.md", "new.md");
	session.undo();

	assert.equal(session.getDisplayedContent("new.md", "current"), "current");
	assert.equal(session.getSaveBaseline("new.md"), undefined);
});

test("keeps a dismiss-undo entry working after the panes are swapped", () => {
	// Mirrors swapFiles(): the dismissed-row set is remapped to the post-swap key, and the
	// undo stack must follow the same remap or undo silently stops matching anything.
	const beforeSwapRow = { leftIndex: 2, rightIndex: 5, leftLineNumber: 3, rightLineNumber: 6, left: "foo", right: "bar", equal: false };
	const afterSwapRow = { leftIndex: 5, rightIndex: 2, leftLineNumber: 6, rightLineNumber: 3, left: "bar", right: "foo", equal: false };
	const beforeSwapKey = getDiffRowKey(beforeSwapRow);
	const afterSwapKey = getDiffRowKey(afterSwapRow);

	const session = new DiffSession();
	session.dismissRow(beforeSwapKey);

	session.replaceDismissedRows(session.getDismissedRowKeys().map(swapDiffRowKey));
	session.remapUndoDismissKeys(swapDiffRowKey);

	assert.equal(session.hasDismissedRow(afterSwapKey), true);
	assert.equal(session.canUndo(), true);

	assert.equal(session.undo(), true);

	assert.equal(session.hasDismissedRow(afterSwapKey), false);
});

test("leaves stage-undo entries untouched when remapping dismiss keys after a swap", () => {
	const session = new DiffSession();
	session.stageChange("note.md", "staged", "before");

	session.remapUndoDismissKeys((rowKey) => `${rowKey}-swapped`);
	session.undo();

	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.getSaveBaseline("note.md"), undefined);
});
