import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAlignedRowChange, getDiffRowKey, joinLines, splitLines, type DiffDirection } from "../src/diff-core.ts";
import { createKeepBothPlan, canKeepBoth } from "../src/keep-both.ts";
import { DiffSession } from "../src/diff-session.ts";

/** Runs the session projection and staged bytes together without a vault or DOM adapter. */
function comparison(direction: DiffDirection, source: string, target: string) {
	const session = new DiffSession();
	const targetPath = "target.md";
	let stored = target;
	/** Reads exactly the content that would be rendered or explicitly saved. */
	const current = () => session.getDisplayedContent(targetPath, stored);
	/** Revalidates the projected rows against the actual staged text, including line endings. */
	const rows = () => session.getReviewRows(splitLines(direction === "left-to-right" ? source : current()),
		splitLines(direction === "left-to-right" ? current() : source), {}, direction);
	/** Stages only open rows in a selected block. */
	function keep(start: number, end: number): boolean {
		const indexes = rows().flatMap((row, index) => index >= start && index <= end && !row.equal && !session.hasDismissedRow(getDiffRowKey(row)) ? [index] : []);
		return session.stageKeepBoth(targetPath, current(), stored, indexes);
	}
	/** Models a successful explicit save so subsequent actions use the new baseline. */
	function save() {
		stored = current();
		session.removePendingChange(targetPath);
		session.removeSaveBaseline(targetPath);
		session.clearUndoStack();
		session.commitReview();
		rows();
	}
	rows();
	return { session, current, rows, keep, save, targetPath };
}

for (const direction of ["left-to-right", "right-to-left"] as const) {
	test(`${direction}: keeps complete target and source fragments, counts original changes, and undoes atomically`, () => {
		const target = "A\nt1\nt2\nt3\nt4\nZ";
		const { session, current, rows, keep } = comparison(direction, "A\ns1\ns2\ns3\ns4\nZ", target);
		assert.equal(keep(1, 4), true);
		assert.equal(current(), "A\nt1\nt2\nt3\nt4\n\ns1\ns2\ns3\ns4\nZ");
		rows();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 4, ignored: 0 });
		assert.equal(session.hasEqualContents(), false);
		assert.equal(session.getPendingChanges().length, 1);
		assert.equal(session.undo(), true);
		rows();
		assert.equal(current(), target);
		assert.equal(session.hasPendingChanges(), false);
		assert.deepEqual(session.getReviewCounts(), { open: 4, accepted: 0, ignored: 0 });
		assert.equal(session.undo(), false);
	});

	test(`${direction}: ignored rows split retained fragments and remain independently undoable`, () => {
		const { session, current, rows, keep } = comparison(direction, "A\ns1\ns2\ns3\ns4\ns5\nZ", "A\nt1\nt2\nt3\nt4\nt5\nZ");
		session.dismissRow(getDiffRowKey(rows()[2]!));
		assert.equal(keep(1, 5), true);
		assert.equal(current(), "A\nt1\n\ns1\nt2\nt3\nt4\nt5\n\ns3\ns4\ns5\nZ");
		const projected = rows();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 4, ignored: 1 });
		assert.equal(projected.filter(row => session.hasDismissedRow(getDiffRowKey(row))).length, 1);
		session.undo(); rows();
		assert.deepEqual(session.getReviewCounts(), { open: 4, accepted: 0, ignored: 1 });
		session.undo(); rows();
		assert.deepEqual(session.getReviewCounts(), { open: 5, accepted: 0, ignored: 0 });
	});

	test(`${direction}: preserves blank bridges, Markdown hard breaks, tabs and target CRLF`, () => {
		const { session, current, rows, keep, save } = comparison(direction, "A\ns1  \n\ns2\t\nZ\n", "A\r\nt1  \r\n\r\nt2\t\r\nZ\r\n");
		assert.equal(keep(1, 3), true);
		assert.equal(current(), "A\r\nt1  \r\n\r\ns1  \r\n\r\nt2\t\r\n\r\ns2\t\r\nZ\r\n");
		rows();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 2, ignored: 0 });
		save();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 0, ignored: 0 });
		assert.equal(session.hasEqualContents(), false, "review completion must not offer identical-file cleanup");
		assert.equal(session.hasPendingChanges(), false);
	});

	test(`${direction}: later row acceptance and undo retain the earlier kept variants`, () => {
		const { session, rows, keep, current, targetPath } = comparison(direction, "A\ns1\ns2\nB\nnew\nZ", "A\nt1\nt2\nB\nold\nZ");
		keep(1, 2);
		const kept = current();
		const projected = rows();
		const index = projected.findIndex(row => row.left === "old" || row.right === "old");
		assert.ok(index > 4, "retained target rows must shift later rendered indexes");
		const left = projected.flatMap(row => row.left === null ? [] : [row.left]);
		const right = projected.flatMap(row => row.right === null ? [] : [row.right]);
		const next = applyAlignedRowChange(left, right, projected[index]!, direction);
		session.stageChange(targetPath, joinLines(direction === "left-to-right" ? next.rightLines : next.leftLines, current()), "unused later baseline", [index]);
		rows();
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 3, ignored: 0 });
		assert.ok(current().includes("new\nZ"));
		session.undo(); rows();
		assert.equal(current(), kept);
		assert.deepEqual(session.getReviewCounts(), { open: 1, accepted: 2, ignored: 0 });
		session.undo(); rows();
		assert.deepEqual(session.getReviewCounts(), { open: 3, accepted: 0, ignored: 0 });
	});

	test(`${direction}: multiple Keep both actions survive partial saves and preserve independent undo snapshots`, () => {
		const { session, rows, keep, current, save } = comparison(direction, "A\ns1\ns2\nB\ns3\ns4\nZ", "A\nt1\nt2\nB\nt3\nt4\nZ");
		keep(1, 2); save();
		assert.deepEqual(session.getReviewCounts(), { open: 2, accepted: 0, ignored: 0 });
		const firstSaved = current();
		const remaining = rows().flatMap((row, index) => !row.equal ? [index] : []);
		assert.equal(keep(remaining[0]!, remaining.at(-1)!), true);
		rows();
		assert.equal(current(), "A\nt1\nt2\n\ns1\ns2\nB\nt3\nt4\n\ns3\ns4\nZ");
		session.undo(); rows();
		assert.equal(current(), firstSaved);
		assert.deepEqual(session.getReviewCounts(), { open: 2, accepted: 0, ignored: 0 });
		assert.equal(session.undo(), false);
	});

	test(`${direction}: retains literal final blank source lines in an unterminated target`, () => {
		for (const [source, expected] of [["\n", "old\n\n\n"], ["new\n\n", "old\n\nnew\n\n"]]) {
			assert.ok(source !== undefined && expected !== undefined);
			const { session, rows, current, keep } = comparison(direction, source, "old");
			const count = session.getReviewCounts().open;
			assert.equal(keep(0, rows().length - 1), true);
			assert.equal(current(), expected);
			rows();
			assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: count, ignored: 0 });
		}
	});
}

for (const direction of ["left-to-right", "right-to-left"] as const) {
	test(`${direction}: an already accepted row stays in place and is never included in kept variants`, () => {
		const { session, rows, keep, current, targetPath } = comparison(direction, "A\ns1\ns2\ns3\ns4\ns5\nZ", "A\nt1\nt2\nt3\nt4\nt5\nZ");
		const original = current();
		const projected = rows();
		const left = projected.flatMap(row => row.left === null ? [] : [row.left]);
		const right = projected.flatMap(row => row.right === null ? [] : [row.right]);
		const next = applyAlignedRowChange(left, right, projected[2]!, direction);
		session.stageChange(targetPath, joinLines(direction === "left-to-right" ? next.rightLines : next.leftLines, current()), original, [2]);
		keep(1, 5); rows();
		assert.equal(current(), "A\nt1\n\ns1\ns2\nt3\nt4\nt5\n\ns3\ns4\ns5\nZ");
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 5, ignored: 0 });
		session.undo(); rows();
		assert.equal(current(), "A\nt1\ns2\nt3\nt4\nt5\nZ");
		assert.deepEqual(session.getReviewCounts(), { open: 4, accepted: 1, ignored: 0 });
		session.undo(); rows();
		assert.equal(current(), original);
	});
}

test("one-sided blocks do not offer Keep both or create an undo/save operation", () => {
	for (const [source, target] of [["A\nnew\nZ", "A\nZ"], ["A\nZ", "A\nold\nZ"]]) {
		assert.ok(source && target);
		const { session, rows, keep } = comparison("left-to-right", source, target);
		const projected = rows();
		assert.equal(canKeepBoth(createKeepBothPlan(projected, projected.map((_row, index) => index), "left-to-right")), false);
		assert.equal(keep(0, projected.length - 1), false);
		assert.equal(session.hasPendingChanges(), false);
		assert.equal(session.canUndo(), false);
	}
});
