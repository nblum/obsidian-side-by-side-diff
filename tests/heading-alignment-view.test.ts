import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import type { TFile } from "obsidian";
import type { SideBySideDiffView } from "../src/diff-view.ts";
import type { ComparisonRowModel } from "../src/diff-model.ts";
import { createComparisonModelFromLines } from "../src/diff-model.ts";
import { DiffSession } from "../src/diff-session.ts";
import { DEFAULT_SETTINGS } from "../src/settings-model.ts";
import { groupChangeRows } from "../src/diff-grouping.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Supplies just the file identity needed by real view methods in this test. */
class TestFile {
	path: string;
	extension: string;
	/** Stores the mock file's path and extension without runtime TypeScript transforms. */
	constructor(path: string, extension: string) {
		this.path = path;
		this.extension = extension;
	}
	/** Supplies the pane header's display name. */
	get name(): string { return this.path; }
}

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/diff-view.ts"], write: false, logLevel: "silent" });
const output = bundle.outputFiles?.[0];
assert.ok(output);
const module = { exports: {} as { SideBySideDiffView: typeof SideBySideDiffView } };
runInNewContext(output.text, {
	module,
	exports: module.exports,
	console,
	require: (name: string) => {
		assert.equal(name, "obsidian");
		return { ItemView: class {}, Notice: class {}, Modal: class {}, SuggestModal: class {}, TFile: TestFile };
	}
});

/** Runs the real layout and action methods with a minimal element/vault adapter, without Obsidian. */
function createView(left: string[], right: string[], enabled = true, leftExtension = "md", rightExtension = "md") {
	const leftFile = new TestFile(`left.${leftExtension}`, leftExtension);
	const rightFile = new TestFile(`right.${rightExtension}`, rightExtension);
	const session = new DiffSession();
	const settings = { ...DEFAULT_SETTINGS, alignMarkdownByHeadings: enabled };
	const rendered: ComparisonRowModel[] = [];
	const element = {
		createDiv: () => element,
		createEl: () => element,
		createSpan: () => element,
		addEventListener: () => {},
		setAttribute: () => {}
	};
	const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
	Object.assign(view, {
		session,
		plugin: { settings, translate: (key: string) => key },
		viewState: { leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" },
		contentEl: element,
		app: { vault: {
			getAbstractFileByPath: (path: string) => path === leftFile.path ? leftFile : rightFile,
			cachedRead: (file: TestFile) => Promise.resolve((file === leftFile ? left : right).join("\n"))
		} },
		getScrollPosition: () => null,
		getChangeTargetPosition: () => null,
		advanceAfterResolvedChange: () => {},
		updateSaveButtonState: () => {},
		updateChangeNavigationState: () => {},
		buildFileHeader: () => {},
		buildGroupHeader: () => {},
		buildIdenticalMessage: () => {},
		buildResolvedMessage: () => {},
		renderDiffRow: (_parent: unknown, row: ComparisonRowModel) => { rendered.push(row); },
		renderDiff: () => Promise.resolve()
	});
	view.buildLayout(leftFile as unknown as TFile, rightFile as unknown as TFile, left, right);
	return { view, rendered, session, settings, rightFile };
}

test("the view enables heading alignment only for two Markdown files with the setting enabled", () => {
	const left = ["repeat", "repeat", "## Shared", "tail"];
	const right = ["prefix", "## Shared", "repeat", "repeat", "tail"];
	for (const [enabled, leftExtension, rightExtension] of [
		[false, "md", "md"], [true, "txt", "md"], [true, "md", "txt"], [true, "txt", "txt"], [true, "md", "md"], [true, "MD", "md"]
	] as const) {
		const { rendered } = createView(left, right, enabled, leftExtension, rightExtension);
		const active = enabled && leftExtension.toLowerCase() === "md" && rightExtension.toLowerCase() === "md";
		assert.deepEqual(JSON.parse(JSON.stringify(rendered)), createComparisonModelFromLines(left, right, { alignMarkdownByHeadings: active }).rows);
	}
});

test("real single-row and grouped view actions reuse the displayed alignment after a setting change", async () => {
	const common = Array.from({ length: 1_050 }, (_, index) => `common-${String(index)}`);
	const right = ["## First", ...common.slice(0, 500), "## Second", "old-a", "old-b", "old-c", "old-d", ...common.slice(500)];
	const left = ["## First", ...Array.from({ length: 100 }, (_, index) => `insert-${String(index)}`), ...common.slice(0, 500), "## Second", "new-a", "new-b", "new-c", "new-d", ...common.slice(500)];
	assert.ok(left.length * right.length > 1_000_000);
	const single = createView(left, right);
	const rowIndex = single.rendered.findIndex((row) => row.left === "new-b");
	assert.ok(rowIndex >= 0);
	single.settings.alignMarkdownByHeadings = false;
	await single.view.applyRowChange(rowIndex, "left-to-right");
	assert.equal(single.session.getDisplayedContent(single.rightFile.path, ""), right.map((line) => line === "old-b" ? "new-b" : line).join("\n"));
	assert.equal(single.session.undo(), true);
	assert.equal(single.session.hasPendingChanges(), false);

	const grouped = createView(left, right);
	const group = groupChangeRows(grouped.rendered).find((candidate) => rowIndex >= candidate.startIndex && rowIndex <= candidate.endIndex);
	assert.ok(group);
	grouped.settings.alignMarkdownByHeadings = false;
	await grouped.view.applyGroupChange(group.startIndex, group.endIndex, "left-to-right");
	assert.equal(grouped.session.getDisplayedContent(grouped.rightFile.path, ""), right.map((line) => line.replace(/^old-/, "new-")).join("\n"));
	assert.equal(grouped.session.undo(), true);
	assert.equal(grouped.session.hasPendingChanges(), false);
});
