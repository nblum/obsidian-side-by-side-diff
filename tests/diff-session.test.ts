import { test } from "node:test";
import assert from "node:assert/strict";
import { DiffSession, hasUnsavedComparisonChanges } from "../src/diff-session.ts";

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
