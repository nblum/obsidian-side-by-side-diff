import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile, rm, unlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	URL,
	Buffer,
	require: (name: string) => {
		if (name === "electron") return {};
		if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
		assert.equal(name, "obsidian");
		return { ItemView: class { async setState() {} }, Notice: class {}, Modal: class {}, SuggestModal: class {}, TFile: TestFile, FileSystemAdapter: class {} };
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
		dropToken: 0,
		renderToken: 0,
		externalMarkdown: null,
		retainedExternalMarkdown: null,
		plugin: { settings, translate: (key: string) => key },
		viewState: { leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" },
		contentEl: element,
		app: { vault: {
			getName: () => "Test Vault",
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


test("editable line numbering settles without retriggering the mutation observer", () => {
	let mutations = 0;
	const numbers = ["1", "", "2"].map((initial) => {
		let value = initial;
		return {
			get textContent() { return value; },
			set textContent(next: string) { value = next; mutations += 1; }
		};
	});
	const lines = numbers.map((number, index) => ({
		dataset: { rightPresent: index === 1 ? "false" : "true" },
		querySelector: () => number
	}));
	const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
	Object.assign(view, { getEditableLines: () => lines });
	const editor = {} as HTMLElement;
	view.updateEditableLineNumbers(editor);
	assert.equal(mutations, 0, "unchanged gutters must not schedule another alignment pass");

	// An inserted real line replaces the alignment gap.
	lines[1]!.dataset.rightPresent = "true";
	view.updateEditableLineNumbers(editor);
	assert.deepEqual(numbers.map((number) => number.textContent), ["1", "2", "3"]);
	assert.equal(mutations, 2);
	view.updateEditableLineNumbers(editor);
	assert.equal(mutations, 2, "the next observer pass must settle");

	lines[1]!.dataset.rightPresent = "false";
	view.updateEditableLineNumbers(editor);
	assert.deepEqual(numbers.map((number) => number.textContent), ["1", "", "2"]);
	view.updateEditableLineNumbers(editor);
	assert.equal(mutations, 4, "cleared gap gutters must also settle");
});


test("edit-mode height measurement preserves scrolling when wrapped rows temporarily shrink", () => {
	const scroll = { scrollTop: 450, scrollLeft: 12 };
	const editor = { scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => ({ height: 120 }) } as HTMLElement;
	let height = 120;
	const line = {
		setCssProps: (props: Record<string, string>) => {
			const value = props["--file-diff-sbs-line-min-height"];
			height = value ? Number.parseFloat(value) : 24;
			// Model Chromium clamping/anchoring the viewport during temporary collapse.
			if (!value) scroll.scrollTop = 0;
		},
		getBoundingClientRect: () => ({ height })
	};
	const leftPane = {};
	const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
	Object.assign(view, {
		contentEl: { querySelector: (selector: string) => selector.includes("selection-scroll") ? scroll : editor },
		getEditableLeftPane: () => leftPane,
		getEditableLines: () => [line]
	});
	view.synchronizeEditableLineHeights(editor);
	assert.equal(scroll.scrollTop, 450);
	assert.equal(scroll.scrollLeft, 12);
});

/** Supplies the browser file interface used by the drop handler without filesystem access. */
function droppedMarkdown(name: string, content: string): File {
	return { name, text: () => Promise.resolve(content) } as File;
}

test("external drops replace only the right file and memory-only targets cannot be edited", async () => {
	for (const grouped of [false, true]) {
		const { view, session } = createView(["old"], ["vault"]);
		Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
		await view.dropMarkdown([droppedMarkdown("external.MD", "external")]);
		assert.equal(view.state.leftPath, "left.md");
		const source = view.getComparisonFile(view.state.rightPath!);
		assert.ok(source);
		assert.equal(source.name, "external.MD");
		assert.equal(await view.readComparisonFile(source), "external");
		assert.equal(session.hasPendingChanges(), false);
		if (grouped) await view.applyGroupChange(0, 0, "left-to-right");
		else await view.applyRowChange(0, "left-to-right");
		assert.equal(session.hasPendingChanges(), false);
		if (grouped) await view.applyGroupChange(0, 0, "right-to-left");
		else await view.applyRowChange(0, "right-to-left");
		assert.deepEqual(session.getPendingChanges(), [{ path: "left.md", content: "external" }]);
		assert.equal(session.getSaveBaseline("left.md"), "old");
		await view.swapFiles();
		assert.equal(view.state.rightPath, source.path);
		assert.equal(view.state.leftPath, "left.md");
		assert.deepEqual({ ...view.getState() }, { leftPath: "left.md", rightPath: null, editRight: false, mode: "compare" });
	}
});

test("invalid drops and cancelled transitions preserve the current comparison", async () => {
	const { view, session } = createView(["left"], ["right"]);
	Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(false) });
	const before = view.state;
	session.stageChange("right.md", "pending", "right");
	await view.dropMarkdown([]);
	await view.dropMarkdown([droppedMarkdown("image.png", "binary")]);
	await view.dropMarkdown([droppedMarkdown("a.md", "a"), droppedMarkdown("b.md", "b")]);
	await view.dropMarkdown([droppedMarkdown("a.md", "a")]);
	assert.deepEqual(view.state, before);
	assert.equal(session.getDisplayedContent("right.md", "right"), "pending");
});

test("the latest drop wins if browser file reads finish out of order", async () => {
	const { view } = createView(["left"], ["right"]);
	Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
	let finishRead!: (value: string) => void;
	const first = view.dropMarkdown([{ name: "first.md", text: () => new Promise<string>((resolve) => { finishRead = resolve; }) } as File]);
	await view.dropMarkdown([droppedMarkdown("second.md", "second")]);
	finishRead("first");
	await first;
	assert.equal(view.getComparisonFile(view.state.rightPath!)?.name, "second.md");
});

test("memory-only external targets stay read-only without changing the left file", async () => {
	const { view } = createView(["left"], ["right"]);
	Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
	await view.dropMarkdown([droppedMarkdown("outside.md", "outside")]);
	const sourcePath = view.state.rightPath!;
	await view.enableRightEditMode();
	assert.equal(view.state.editRight, false);
	assert.equal(view.state.leftPath, "left.md");
	assert.equal(view.getComparisonFile(sourcePath)?.name, "outside.md");
});

test("a first drop keeps the initial vault note on the left and read failures preserve pending changes", async () => {
	const { view, session } = createView(["left"], ["right"]);
	Object.assign(view, {
		externalMarkdown: null, dropToken: 0,
		viewState: { leftPath: "left.md", rightPath: null, editRight: false, mode: "compare" },
		prepareForTransition: () => Promise.resolve(true)
	});
	await view.dropMarkdown([droppedMarkdown("outside.md", "outside")]);
	assert.equal(view.state.leftPath, "left.md");
	session.stageChange("left.md", "pending", "left");
	const before = { ...view.state };
	await view.dropMarkdown([{ name: "unreadable.md", text: () => Promise.reject(new Error("read failed")) } as File]);
	assert.deepEqual({ ...view.state }, before);
	assert.equal(session.getDisplayedContent("left.md", "left"), "pending");
});

test("the drop card selects vault files from paths and Obsidian wikilinks", async () => {
	const { view, rightFile } = createView(["left"], ["right"]);
	const leftFile = view.getComparisonFile("left.md")!;
	let selected = 0;
	Object.assign(view, {
		prepareForTransition: () => Promise.resolve(true),
		applyRightFile: (left: unknown, right: unknown) => {
			assert.equal(left, leftFile);
			assert.equal(right, rightFile);
			selected += 1;
			return Promise.resolve();
		}
	});
	Object.assign(view.app.vault, { getAbstractFileByPath: (path: string) => path === "right.md" ? rightFile : null });
	Object.assign(view.app, { metadataCache: { getFirstLinkpathDest: (link: string) => link === "right" ? rightFile : null } });
	await view.dropVaultFile(leftFile, "right.md");
	await view.dropVaultFile(leftFile, "[[right|Alias]]");
	assert.equal(selected, 2);
	Object.assign(view, { prepareForTransition: () => Promise.resolve(false) });
	await view.dropVaultFile(leftFile, "right.md");
	assert.equal(selected, 2);
});


test("Obsidian open URLs and encoded Markdown links select the dragged vault note", async () => {
	const { view, rightFile } = createView(["left"], ["right"]);
	const leftFile = view.getComparisonFile("left.md")!;
	let selected = 0;
	Object.assign(view, {
		prepareForTransition: () => Promise.resolve(true),
		applyRightFile: (_left: unknown, right: unknown) => {
			assert.equal(right, rightFile);
			selected += 1;
			return Promise.resolve();
		}
	});
	Object.assign(view.app.vault, {
		getName: () => "Test Vault",
		getAbstractFileByPath: (path: string) => path === "Notes/Right note.md" ? rightFile : null
	});
	Object.assign(view.app, { metadataCache: { getFirstLinkpathDest: () => null } });
	await view.dropVaultFile(leftFile, "obsidian://open?vault=Test%20Vault&file=Notes%2FRight%20note.md");
	await view.dropVaultFile(leftFile, "[Right note](Notes/Right%20note.md)");
	assert.equal(selected, 2);
	for (const invalid of [
		"obsidian://open?vault=Another%20Vault&file=Notes%2FRight%20note.md",
		"obsidian://open?vault=Test%20Vault",
		"[Broken](Notes/%ZZ.md)",
		"obsidian://open?vault=Test%20Vault&file=left.md"
	]) await view.dropVaultFile(leftFile, invalid);
	assert.equal(selected, 2);
});


/** Creates a browser drop carrying the legacy desktop path for real-file save tests. */
function desktopMarkdown(path: string, content: string): File {
	return { ...droppedMarkdown("outside.md", content), path } as File;
}

test("desktop Markdown can be swapped and accepts staged blocks only on explicit save", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sbs-external-block-"));
	try {
		const diskPath = join(dir, "outside.md");
		const original = "old\r\nextra\r\n";
		await writeFile(diskPath, original);
		const { view, session } = createView(["new", ""], ["other"]);
		Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
		await view.dropMarkdown([desktopMarkdown(diskPath, original)]);
		const externalPath = view.state.rightPath!;
		assert.equal(view.state.leftPath, "left.md");
		await view.swapFiles();
		assert.equal(view.state.leftPath, externalPath);
		await view.swapFiles();
		assert.equal(view.state.rightPath, externalPath);
		assert.equal(view.state.leftPath, "left.md");
		assert.deepEqual({ ...view.getState() }, { leftPath: "left.md", rightPath: null, editRight: false, mode: "compare" });
		await view.applyGroupChange(0, 10, "left-to-right");
		assert.equal(await readFile(diskPath, "utf8"), original);
		assert.equal(session.getPendingChanges()[0]?.content, "new\r\n");
		assert.equal(session.undo(), true);
		assert.equal(session.hasPendingChanges(), false);
		await view.applyGroupChange(0, 10, "left-to-right");
		assert.equal(await view.writePendingChanges(), "saved");
		assert.equal(await readFile(diskPath, "utf8"), "new\r\n");
		assert.equal(session.hasPendingChanges(), false);
		// Another drop replaces the right file without moving the left one.
		await view.dropMarkdown([desktopMarkdown(diskPath, "new\r\n")]);
		assert.equal(view.state.leftPath, "left.md");
		assert.equal(view.getComparisonFile(view.state.rightPath!)?.name, "outside.md");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("desktop edit saves preserve line endings and reject external modifications and deletion", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sbs-external-edit-"));
	try {
		const diskPath = join(dir, "outside.md");
		const original = "original\r\nlong text\r\n";
		await writeFile(diskPath, original, { mode: 0o600 });
		const { view, session } = createView(["left"], ["right"]);
		Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
		await view.dropMarkdown([desktopMarkdown(diskPath, original)]);
		const externalPath = view.state.rightPath!;
		assert.equal(view.state.leftPath, "left.md");
		await view.enableRightEditMode();
		assert.equal(view.state.editRight, true);
		assert.equal(view.getComparisonFile(externalPath)?.name, "outside.md");
		// The actual renderer captures this baseline when it builds the editor.
		session.captureSaveBaseline(externalPath, original);
		let edited = "ä\n";
		Object.assign(view, {
			rightEditorState: { editor: {}, initialValue: original },
			serializeRightEditor: () => edited
		});
		assert.equal(await readFile(diskPath, "utf8"), original);
		await writeFile(diskPath, "changed elsewhere\r\n");
		assert.equal(await view.saveRightEdits(), false);
		assert.equal(await readFile(diskPath, "utf8"), "changed elsewhere\r\n");
		assert.equal(await view.saveRightEdits(), true);
		assert.equal(await readFile(diskPath, "utf8"), "ä\r\n");
		assert.equal((await stat(diskPath)).mode & 0o777, 0o600);
		// A close-time save uses the same external target and guarded writer.
		session.captureSaveBaseline(externalPath, "ä\r\n");
		edited = "";
		assert.equal(await view.saveChangesBeforeClose(), true);
		assert.equal(await readFile(diskPath, "utf8"), "");
		await unlink(diskPath);
		edited = "not recreated";
		assert.equal(await view.saveRightEdits(), false);
		await assert.rejects(readFile(diskPath), { code: "ENOENT" });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("dropping another external file after a manual swap preserves the external left file", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sbs-drop-right-"));
	try {
		const firstPath = join(dir, "first.md");
		const secondPath = join(dir, "second.md");
		await writeFile(firstPath, "first");
		await writeFile(secondPath, "second");
		const { view } = createView(["left"], ["right"]);
		Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
		await view.dropMarkdown([desktopMarkdown(firstPath, "first")]);
		const firstId = view.state.rightPath!;
		await view.swapFiles();
		assert.equal(view.state.leftPath, firstId);
		await view.dropMarkdown([desktopMarkdown(secondPath, "second")]);
		assert.equal(view.state.leftPath, firstId);
		assert.equal(await view.readComparisonFile(view.getComparisonFile(firstId)!), "first");
		assert.equal(await view.readComparisonFile(view.getComparisonFile(view.state.rightPath!)!), "second");
		await view.applyRowChange(0, "left-to-right");
		assert.equal(await view.writePendingChanges(), "saved");
		assert.equal(await readFile(secondPath, "utf8"), "first");
		assert.deepEqual({ ...view.getState() }, { leftPath: null, rightPath: null, editRight: false, mode: "compare" });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
