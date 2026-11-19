import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAlignedRowChange, getDiffRowKey, joinLines, splitLines, swapDiffRowKey, type DiffDirection } from "../src/diff-core.ts";
import { DiffSession } from "../src/diff-session.ts";

/** Exercises the same projected rows, staged buffers and atomic undo used by the view. */
function review(direction: DiffDirection, source: string[], target: string[]) {
	const session = new DiffSession();
	const initialLeft = direction === "left-to-right" ? source : target;
	const initialRight = direction === "left-to-right" ? target : source;
	const targetPath = direction === "left-to-right" ? "right.md" : "left.md";
	const baseline = target.join("\n");
	/** Returns the stable rows using the current staged contents. */
	function rows() {
		const left = direction === "left-to-right" ? initialLeft : splitLines(session.getDisplayedContent(targetPath, baseline));
		const right = direction === "left-to-right" ? splitLines(session.getDisplayedContent(targetPath, baseline)) : initialRight;
		return session.getReviewRows(left, right, {}, direction);
	}
	/** Accepts a row against its current target position. */
	function accept(index: number) {
		const current = rows();
		const left = current.flatMap(row => row.left === null ? [] : [row.left]);
		const right = current.flatMap(row => row.right === null ? [] : [row.right]);
		const next = applyAlignedRowChange(left, right, current[index]!, direction);
		session.stageChange(targetPath, joinLines(direction === "left-to-right" ? next.rightLines : next.leftLines, baseline), baseline, [index]);
	}
	rows();
	return { session, rows, accept, targetPath };
}

for (const direction of ["left-to-right", "right-to-left"] as const) {
	test(`${direction}: insertion before an ignored duplicate retains identities, counts and undo`, () => {
		const { session, rows, accept } = review(direction, ["A", "insert", "B", "same", "C", "same", "Z"], ["A", "B", "old", "C", "old", "Z"]);
		const originalRows = rows();
		const ignored = originalRows.findIndex(row => row.left === "same" && row.right === "old" || row.right === "same" && row.left === "old");
		const insertion = originalRows.findIndex(row => row.left === "insert" || row.right === "insert");
		assert.deepEqual(session.getReviewCounts(), { open: 3, accepted: 0, ignored: 0 });
		session.dismissRow(getDiffRowKey(originalRows[ignored]!));
		accept(insertion);
		assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 1, ignored: 1 });
		assert.equal(session.hasDismissedRow(getDiffRowKey(rows()[ignored]!)), true);
		assert.equal(session.getReviewStatus(insertion), "accepted");
		assert.equal(session.getReviewStatus(ignored), "ignored");
		assert.equal(session.undo(), true);
		rows();
		assert.deepEqual(session.getReviewCounts(), { open: 2, accepted: 0, ignored: 1 });
		assert.equal(session.undo(), true);
		assert.deepEqual(session.getReviewCounts(), { open: 3, accepted: 0, ignored: 0 });
	});

	test(`${direction}: deletion-only acceptance retains an entry even when both projected cells are gaps`, () => {
		const { session, rows, accept } = review(direction, [], ["remove"]);
		accept(0);
		assert.equal(rows().length, 1);
		assert.equal(rows()[0]?.left, null);
		assert.equal(rows()[0]?.right, null);
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 1, ignored: 0 });
		assert.equal(session.undo(), true);
		assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 0, ignored: 0 });
	});

	test(`${direction}: save restarts accepted counts and retains ignored decisions at shifted positions`, () => {
		const { session, rows, accept, targetPath } = review(direction, ["A", "insert", "B", "new", "Z"], ["A", "B", "old", "Z"]);
		session.dismissRow(getDiffRowKey(rows()[3]!));
		accept(1);
		const current = rows();
		session.removePendingChange(targetPath);
		session.removeSaveBaseline(targetPath);
		session.clearUndoStack();
		session.commitReview();
		session.getReviewRows(current.flatMap(row => row.left === null ? [] : [row.left]), current.flatMap(row => row.right === null ? [] : [row.right]), {}, direction);
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 1 });
		assert.equal(session.canUndo(), false);
		assert.equal(session.hasPendingChanges(), false);
	});
}

test("whole-block status changes share one undo action and skip ignored rows", () => {
	const session = new DiffSession();
	const rows = session.getReviewRows(["one", "two", "three", "four"], ["old1", "old2", "old3", "old4"], {}, "left-to-right");
	session.dismissRow(getDiffRowKey(rows[1]!));
	session.stageChange("right.md", "one\nold2\nthree\nfour", "old1\nold2\nold3\nold4", [0, 1, 2, 3]);
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 3, ignored: 1 });
	session.undo();
	assert.deepEqual(session.getReviewCounts(), { open: 3, accepted: 0, ignored: 1 });
	session.undo();
	assert.deepEqual(session.getReviewCounts(), { open: 4, accepted: 0, ignored: 0 });
});

test("ignore undo remains valid after swapping and rebuilding the review", () => {
	const session = new DiffSession();
	const rows = session.getReviewRows(["left"], ["right"], {}, "left-to-right");
	session.dismissRow(getDiffRowKey(rows[0]!));
	session.replaceDismissedRows(session.getDismissedRowKeys().map(swapDiffRowKey));
	session.remapUndoDismissKeys(swapDiffRowKey);
	session.getReviewRows(["right"], ["left"], {}, "left-to-right");
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 1 });
	session.undo();
	assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 0, ignored: 0 });
});

test("unrelated new contents and discard never inherit accepted statuses", () => {
	const { session, accept } = review("left-to-right", ["new"], ["old"]);
	accept(0);
	session.getReviewRows(["other"], ["new"], {}, "left-to-right");
	assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 0, ignored: 0 });
	session.clearTransientChanges();
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 0 });
});


test("refresh retains ignored undo without restoring an obsolete alignment snapshot", () => {
	const session = new DiffSession();
	const rows = session.getReviewRows(["left"], ["right"], {}, "left-to-right");
	session.dismissRow(getDiffRowKey(rows[0]!));
	session.resetReview();
	session.getReviewRows(["left"], ["right"], {}, "left-to-right");
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 1 });
	session.undo();
	assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 0, ignored: 0 });
});

test("changed heading alignment options rebuild the review even when literal contents match", () => {
	const session = new DiffSession();
	const left = ["## Shared", "new"];
	const right = ["## Shared", "old"];
	const original = session.getReviewRows(left, right, {}, "left-to-right");
	const aligned = session.getReviewRows(left, right, { alignMarkdownByHeadings: true }, "left-to-right");
	assert.notEqual(original, aligned);
	assert.equal(session.getReviewRows(left, right, { alignMarkdownByHeadings: true }, "left-to-right"), aligned);
	assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 0, ignored: 0 });
});


for (const direction of ["left-to-right", "right-to-left"] as const) {
	test(`${direction}: saving duplicate-heavy mixed decisions never reopens ignored changes`, () => {
		const source = direction === "left-to-right" ? ["2", "2", "2", "0"] : ["0", "0", "0"];
		const target = direction === "left-to-right" ? ["0", "0", "0"] : ["2", "2", "2", "0"];
		const { session, rows, accept, targetPath } = review(direction, source, target);
		for (const index of [1, 2, 4]) session.dismissRow(getDiffRowKey(rows()[index]!));
		accept(0);
		accept(5);
		const saved = rows();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 2, ignored: 3 });
		session.removePendingChange(targetPath);
		session.clearUndoStack();
		session.commitReview();
		const committed = session.getReviewRows(saved.flatMap(row => row.left === null ? [] : [row.left]), saved.flatMap(row => row.right === null ? [] : [row.right]), {}, direction);
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 3 });
		assert.ok(committed.every(row => row.left !== null || row.right !== null), "saved deletions leave no placeholder rows");
	});
}
