import { test } from "node:test";
import { diskFileHandle } from "./helpers/external-file-handle.ts";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { renderFragmentText } from "./helpers/obsidian-fragment.ts";
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

/** Models editor nodes so rendering and serialization run together, without layout or observers. */
class EditorElement {
	children: EditorElement[] = [];
	dataset: Record<string, string> = {};
	classes = new Set<string>();
	classList = { contains: (value: string) => this.classes.has(value) };
	ownerDocument = { defaultView: null };
	private ownText = "";
	handlers = new Map<string, () => void>();
	get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(""); }
	set textContent(value: string) { this.ownText = value; this.children = []; }
	get innerText(): string { return this.textContent; }
	createEl(_tag: string, options: { cls?: string; text?: string } = {}): EditorElement { return this.createSpan(options); }
	createDiv(options: { cls?: string; text?: string } = {}): EditorElement { return this.createSpan(options); }
	createSpan(options: { cls?: string; text?: string } = {}): EditorElement {
		const child = new EditorElement();
		child.addClass(...(options.cls?.split(" ") ?? []));
		child.textContent = options.text ?? "";
		this.children.push(child);
		return child;
	}
	addClass(...classes: string[]): void { classes.forEach(value => this.classes.add(value)); }
	empty(): void { this.children = []; this.textContent = ""; }
	setAttribute(): void {}
	addEventListener(event: string, callback: () => void): void { this.handlers.set(event, callback); }
	instanceOf(type: typeof EditorElement): boolean { return this instanceof type; }
	querySelector(selector: string): EditorElement | null {
		return this.children.find(child => child.classes.has(selector.slice(1)))
			?? this.children.map(child => child.querySelector(selector)).find(Boolean) ?? null;
	}
}

const renderedIcons = new WeakMap<object, string>();
const renderedTooltips = new WeakMap<object, string>();
const notices: string[] = [];
const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/diff-view.ts"], write: false, logLevel: "silent" });
const output = bundle.outputFiles?.[0];
assert.ok(output);
const module = { exports: {} as { SideBySideDiffView: typeof SideBySideDiffView } };
runInNewContext(output.text, {
	module,
	exports: module.exports,
	TextDecoder,
	console,
	URL,
	Buffer,
	HTMLElement: EditorElement,
	createFragment: renderFragmentText,
	require: (name: string) => {
		if (name === "electron") return {};
		if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
		assert.equal(name, "obsidian");
		return {
			ItemView: class { async setState() {} },
			Notice: class { constructor(message: string) { notices.push(message); } },
			Modal: class {}, SuggestModal: class {}, TFile: TestFile, FileSystemAdapter: class {},
			setIcon: (element: object, icon: string) => { renderedIcons.set(element, icon); },
			setTooltip: (element: object, tooltip: string) => { renderedTooltips.set(element, tooltip); }
		};
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
		setAttribute: () => {},
		addClass: () => {}
	};
	const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
	Object.assign(view, {
		session,
		dropToken: 0,
		renderToken: 0,
		externalMarkdown: null,
		retainedExternalMarkdown: null,
		plugin: { settings, translate: (key: string) => key, rememberRecentRightFile: () => Promise.resolve() },
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
	return { view, rendered, session, settings, leftFile, rightFile };
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

test("the original preview before comparison selection uses neutral comparison cells and preserves literal lines", () => {
	const lines = ["# Original", "", "  spaced\ttext  ", "long wrapped line ".repeat(20)];
	const { view } = createView(lines, []);
	const pane = new EditorElement();
	view.buildSingleFilePane(pane as unknown as HTMLElement, lines);
	assert.equal(pane.children.length, lines.length);
	for (const [index, cell] of pane.children.entries()) {
		assert.ok(cell.classes.has("file-diff-sbs-cell"), "the preview must share comparison cell typography, background and borders");
		assert.equal(cell.dataset.diffOperation, "none", "there is no change to highlight before selecting a comparison");
		assert.equal(cell.querySelector(".file-diff-sbs-line-number")?.textContent, String(index + 1));
		const code = cell.querySelector(".file-diff-sbs-code");
		assert.equal(code?.innerText, lines[index]);
		assert.equal(code?.dataset.diffSide, "left");
		assert.equal(code?.dataset.diffPresent, "true", "empty lines in the original are actual content");
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
		assert.deepEqual({ ...view.getState() }, { leftPath: "left.md", rightPath: null, editRight: false, mode: "compare", layout: "auto" });
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


/** Creates a browser drop whose native path is used only for vault matching. */
function desktopMarkdown(path: string, content: string): File {
	return { ...droppedMarkdown("outside.md", content), path } as File;
}

test("browser handles without native paths can be swapped and save staged blocks explicitly", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sbs-external-block-"));
	try {
		const diskPath = join(dir, "outside.md");
		const original = "old\r\nextra\r\n";
		await writeFile(diskPath, original);
		const { view, session } = createView(["new", ""], ["other"]);
		Object.assign(view, { externalMarkdown: null, dropToken: 0, prepareForTransition: () => Promise.resolve(true) });
		await view.dropMarkdown([droppedMarkdown("outside.md", original)], Promise.resolve(diskFileHandle(diskPath)));
		const externalPath = view.state.rightPath!;
		assert.equal(view.state.leftPath, "left.md");
		await view.swapFiles();
		assert.equal(view.state.leftPath, externalPath);
		await view.swapFiles();
		assert.equal(view.state.rightPath, externalPath);
		assert.equal(view.state.leftPath, "left.md");
		assert.deepEqual({ ...view.getState() }, { leftPath: "left.md", rightPath: null, editRight: false, mode: "compare", layout: "auto" });
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
		await view.dropMarkdown([droppedMarkdown("outside.md", "new\r\n")], Promise.resolve(diskFileHandle(diskPath)));
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
		await view.dropMarkdown([desktopMarkdown(diskPath, original)], Promise.resolve(diskFileHandle(diskPath)));
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
		await view.dropMarkdown([desktopMarkdown(firstPath, "first")], Promise.resolve(diskFileHandle(firstPath)));
		const firstId = view.state.rightPath!;
		await view.swapFiles();
		assert.equal(view.state.leftPath, firstId);
		await view.dropMarkdown([desktopMarkdown(secondPath, "second")], Promise.resolve(diskFileHandle(secondPath)));
		assert.equal(view.state.leftPath, firstId);
		assert.equal(await view.readComparisonFile(view.getComparisonFile(firstId)!), "first");
		assert.equal(await view.readComparisonFile(view.getComparisonFile(view.state.rightPath!)!), "second");
		await view.applyRowChange(0, "left-to-right");
		assert.equal(await view.writePendingChanges(), "saved");
		assert.equal(await readFile(secondPath, "utf8"), "first");
		assert.deepEqual({ ...view.getState() }, { leftPath: null, rightPath: null, editRight: false, mode: "compare", layout: "auto" });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("reverse merging stages insertions, replacements and removals only in the left target", async () => {
	for (const [left, right] of [
		[["A", "old", "Z"], ["A", "new", "Z"]],
		[["A", "Z"], ["A", "inserted", "Z"]],
		[["A", "removed", "Z"], ["A", "Z"]]
	]) {
		assert.ok(left && right);
		const { view, session, rendered, leftFile, rightFile } = createView(left, right);
		await view.setState({ ...view.state, direction: "right-to-left" }, { history: false });
		const targetBaseline = `${left.join("\r\n")}\r\n`;
		Object.assign(view, { readComparisonFile: (file: TestFile) => Promise.resolve(file === leftFile ? targetBaseline : right.join("\n")) });
		const index = rendered.findIndex(row => !row.equal);
		await view.applyRowChange(index, view.applyDirection);
		assert.equal(session.getDisplayedContent(leftFile.path, ""), `${right.join("\r\n")}\r\n`);
		assert.equal(session.getSaveBaseline(leftFile.path), targetBaseline);
		assert.equal(session.getPendingChanges().some(change => change.path === rightFile.path), false);
		assert.equal(session.undo(), true);
		assert.equal(session.hasPendingChanges(), false);
	}
});

test("reverse block acceptance skips ignored rows and remains one undo step", async () => {
	const { view, session, rendered, leftFile, rightFile } = createView(["old-a", "old-b", "old-c", "old-d"], ["new-a", "new-b", "new-c", "new-d"]);
	await view.setState({ ...view.state, direction: "right-to-left" }, { history: false });
	const { getDiffRowKey } = await import("../src/diff-core.ts");
	session.dismissRow(getDiffRowKey(rendered[1]!));
	await view.applyGroupChange(0, 3, view.applyDirection);
	assert.equal(session.getDisplayedContent(leftFile.path, ""), "new-a\nold-b\nnew-c\nnew-d");
	assert.equal(session.getPendingChanges().some(change => change.path === rightFile.path), false);
	assert.equal(session.undo(), true);
	assert.equal(session.hasPendingChanges(), false);
	assert.equal(session.hasDismissedRow(getDiffRowKey(rendered[1]!)), true);
});

test("ignoring rows or blocks preserves both rendered files, clears highlights and actions, and undoes in both directions", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		for (const grouped of [false, true]) {
			for (const [left, right] of [
				[["A", "old text", "Z"], ["A", "new text", "Z"]],
				[["A", "left-only", "", "  ", "Z"], ["A", "Z"]],
				[["A", "Z"], ["A", "right-only", "", "  ", "Z"]]
			]) {
				assert.ok(left && right);
				const { view, session, rendered } = createView(left, right);
				await view.setState({ ...view.state, direction }, { history: false });
				const root = new EditorElement();
				Object.assign(view, {
					changeActions: new Map(),
					renderDiffRow: module.exports.SideBySideDiffView.prototype.renderDiffRow,
					renderDiff: () => {
						root.children = [];
						rendered.forEach((row, index) => view.renderDiffRow(root as unknown as HTMLElement, row, index));
						return Promise.resolve();
					}
				});
				await view.renderDiff();
				const changedIndex = rendered.findIndex(row => !row.equal);
				assert.ok(changedIndex >= 0);
				const ignoredIndexes = grouped ? rendered.flatMap((row, index) => row.equal ? [] : [index]) : [changedIndex];
				if (grouped) await view.dismissGroup(rendered, changedIndex);
				else await view.dismissRow(rendered[changedIndex]!, changedIndex);
				assert.equal(root.children.length, rendered.length, "ignoring must not remove source-only rows");
				for (const [index, rowElement] of root.children.entries()) {
					const model = rendered[index]!;
					const cells = [rowElement.children[0]!, rowElement.children[2]!];
					for (const [side, cell] of cells.entries()) {
						const value = side === 0 ? model.left : model.right;
						const code = cell.querySelector(".file-diff-sbs-code");
						assert.equal(code?.innerText, value ?? " ", `${direction}: ignored content must still match its file`);
						assert.equal(code?.dataset.diffPresent, String(value !== null));
						assert.equal(cell.querySelector(".file-diff-sbs-line-number")?.textContent, String((side === 0 ? model.leftLineNumber : model.rightLineNumber) ?? ""));
						if (ignoredIndexes.includes(index)) {
							assert.equal(cell.dataset.diffOperation, "none");
							assert.equal(code?.querySelector(".file-diff-sbs-inline-left"), null);
							assert.equal(code?.querySelector(".file-diff-sbs-inline-right"), null);
						}
					}
					if (ignoredIndexes.includes(index)) {
						assert.equal(rowElement.dataset.diffChange, undefined);
						assert.equal(rowElement.children[1]?.children.length, 1, "ignored rows retain a status marker");
						assert.equal(rowElement.dataset.reviewStatus, "ignored");
					}
				}
				assert.equal(session.hasPendingChanges(), false, "ignoring must not stage edits to either file");
				await view.undoLastChange();
				assert.equal(root.children[changedIndex]?.dataset.diffChange, "true");
				assert.equal(root.children[changedIndex]?.children[1]?.children.length, 2, "open rows use only their two actions");
				assert.equal(session.canUndo(), false, "ignoring a block must be one undo step");
			}
		}
	}
});

test("direction reversal preserves file identities, protects pending changes and reopens ignored decisions", async () => {
	const { view, session } = createView(["old"], ["new"]);
	session.dismissRow("previous decision");
	await view.reverseApplyDirection();
	assert.equal(view.applyDirection, "right-to-left");
	assert.equal(view.state.leftPath, "left.md");
	assert.equal(view.state.rightPath, "right.md");
	assert.equal(view.getPaneLabels().left, "view.labels.original");
	assert.equal(session.getDismissedRowCount(), 0);
	assert.equal(session.canUndo(), false);
	session.stageChange("left.md", "new", "old");
	await view.reverseApplyDirection();
	assert.equal(view.applyDirection, "right-to-left");
	assert.equal(session.getDisplayedContent("left.md", ""), "new");
	assert.equal(session.canUndo(), true);
	session.undo();
	await view.reverseApplyDirection();
	assert.equal(view.applyDirection, "left-to-right");
});

test("proposal workflows cannot reverse merging and direct editing follows the selected target", async () => {
	for (const mode of ["accept", "proposal"]) {
		const { view, session } = createView(["old"], ["new"]);
		await view.setState({ ...view.state, mode, direction: "right-to-left" }, { history: false });
		await view.reverseApplyDirection();
		assert.equal(view.applyDirection, "left-to-right");
		await view.applyRowChange(0, "right-to-left");
		await view.applyGroupChange(0, 0, "right-to-left");
		assert.equal(session.hasPendingChanges(), false);
	}
	const { view } = createView(["old"], ["new"]);
	await view.setState({ ...view.state, direction: "right-to-left", editRight: true }, { history: false });
	await view.reverseApplyDirection();
	assert.equal(view.applyDirection, "right-to-left");
	assert.equal(view.state.editRight, true);
	assert.equal(view.targetPath, "left.md");
});

test("a review with its original on the left accepts individual and grouped changes only into the original", async () => {
	const { view, session } = createView(["Left 1", "Left 2", "Left 3"], ["Right 1", "Right 2", "Right 3"]);
	await view.setState({ ...view.state, mode: "review", originalSide: "left" }, { history: false });
	await view.applyRowChange(0, "left-to-right");
	await view.applyGroupChange(0, 2, "left-to-right");
	assert.equal(session.hasPendingChanges(), false);
	await view.applyRowChange(0, "right-to-left");
	assert.deepEqual(session.getReviewCounts(), { open: 2, accepted: 1, ignored: 0 });
	await view.applyGroupChange(1, 2, "right-to-left");
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 3, ignored: 0 });
	assert.deepEqual(session.getPendingChanges(), [{ path: "left.md", content: "Right 1\nRight 2\nRight 3" }]);
});

test("row buttons and keyboard acceptance use the displayed direction and target", async () => {
	const { view, rendered } = createView(["old"], ["new"]);
	await view.setState({ ...view.state, direction: "right-to-left" }, { history: false });
	const buttons: { text: string; title?: string; disabled?: boolean; click: (() => void) | undefined; setAttribute: () => void; addEventListener: (name: string, handler: () => void) => void }[] = [];
	const cell = { setAttribute: () => {}, createSpan: () => new EditorElement(), createEl: (_tag: string, options: { text: string }) => {
		const button = { text: options.text, setAttribute: () => {}, addEventListener: (_name: string, handler: () => void) => { button.click = handler; }, click: undefined as (() => void) | undefined };
		buttons.push(button);
		return button;
	} };
	const directions: string[] = [];
	Object.assign(view, {
		changeActions: new Map(),
		applyRowChange: (_index: number, direction: string) => { directions.push(direction); return Promise.resolve(); },
		contentEl: { querySelector: () => ({ dataset: { diffRowIndex: "0" } }) }
	});
	view.buildActionCell({ createDiv: () => cell } as unknown as HTMLElement, rendered[0]!, 0);
	assert.equal(buttons[0]!.text, "←");
	assert.equal(buttons[0]!.disabled, false);
	buttons[0]!.click!();
	assert.equal(view.handleActiveChangeAction("accept"), true);
	assert.deepEqual(directions, ["right-to-left", "right-to-left"]);
});

test("comparison highlights distinguish incoming source content from content removed from the target", async () => {
	/** Captures the real renderer's cell metadata without substituting its color decisions. */
	function element() {
		return {
			dataset: {} as Record<string, string>,
			textContent: "",
			createSpan: element,
			addClass: () => {}
		};
	}
	for (const [left, right] of [
		[["same"], ["same"]],
		[["keep", "incoming"], ["keep"]],
		[["keep"], ["keep", "outgoing"]],
		[["keep", "old words"], ["keep", "new words"]],
		[[""], []],
		[[], [""]]
	]) {
		assert.ok(left && right);
		const { view, rendered } = createView(left, right);
		for (const direction of ["left-to-right", "right-to-left"] as const) {
			assert.equal(view.applyDirection, direction);
			for (const row of rendered) {
				for (const side of ["left", "right"] as const) {
					const cell = element();
					const value = row[side];
					view.buildCell({ createDiv: () => cell } as unknown as HTMLElement, value, row[side === "left" ? "right" : "left"], row[side === "left" ? "leftLineNumber" : "rightLineNumber"], side, row.type, row[side === "left" ? "leftInlineTokens" : "rightInlineTokens"]);
					const sourceSide = direction === "left-to-right" ? "left" : "right";
					const expected = row.equal || value === null ? "none" : side === sourceSide ? "insert" : "delete";
					assert.equal(cell.dataset.diffOperation, expected, `${direction}: ${side} ${String(value)}`);
				}
			}
			await view.reverseApplyDirection();
		}
	}
});

test("compact header keeps save/menu on top, swap above direction, and edit exclusively beside the target", async () => {
	/** Records control ancestry and dispatches the real view's registered click handlers. */
	class LayoutElement {
		children: LayoutElement[] = [];
		classes = new Set<string>();
		attributes = new Map<string, string>();
		handlers = new Map<string, () => void>();
		disabled = false;
		text = "";
		constructor(options: { cls?: string; text?: string } = {}) {
			this.addClass(...(options.cls?.split(" ") ?? []));
			this.text = options.text ?? "";
		}
		/** Adds a child while retaining the control's layout parent. */
		createDiv(options: { cls?: string; text?: string } = {}): LayoutElement { return this.createEl("div", options); }
		/** Creates the same lightweight node for spans and controls. */
		createEl(_tag: string, options: { cls?: string; text?: string } = {}): LayoutElement {
			const child = new LayoutElement(options);
			this.children.push(child);
			return child;
		}
		/** Captures labels generated inside a toolbar. */
		createSpan(options: { cls?: string; text?: string } = {}): LayoutElement { return this.createEl("span", options); }
		/** Supports Obsidian's class helper without a browser DOM. */
		addClass(...classes: string[]): void { classes.forEach(value => this.classes.add(value)); }
		/** Retains accessible control names for the assertions. */
		setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
		/** Stores the real control callback for invocation below. */
		addEventListener(event: string, callback: () => void): void { this.handlers.set(event, callback); }
		/** Finds a control or toolbar by its stable layout class. */
		find(cls: string): LayoutElement | undefined { return this.classes.has(cls) ? this : this.children.map(child => child.find(cls)).find(Boolean); }
	}
	const { view, leftFile, rightFile } = createView(["old"], ["new"]);
	const root = new LayoutElement();
	const clicked: string[] = [];
	Object.assign(view, {
		contentEl: root,
		swapFiles: () => { clicked.push("swap"); return Promise.resolve(); },
		reverseApplyDirection: () => { clicked.push("reverse"); return Promise.resolve(); },
		enableRightEditMode: () => { clicked.push("edit"); return Promise.resolve(); },
		savePendingChanges: () => { clicked.push("save"); return Promise.resolve(true); }
	});
	view.buildLayout(leftFile as unknown as TFile, rightFile as unknown as TFile, ["old"], ["new"]);
	assert.equal(root.find("file-diff-sbs-action-toolbar"), undefined);
	const top = root.find("file-diff-sbs-toolbar-actions");
	assert.ok(top);
	assert.equal(top.children.length, 3);
	assert.ok(top.children[0]?.classes.has("file-diff-sbs-layout-button"));
	assert.ok(top.children[1]?.classes.has("file-diff-sbs-save-action"));
	assert.equal(top.children[2]?.attributes.get("aria-label"), "actions.fileMenu");
	const center = root.find("file-diff-sbs-direction");
	assert.ok(center);
	assert.equal(center.children[0]?.attributes.get("aria-label"), "actions.swap");
	assert.equal(center.children[1]?.attributes.get("aria-label"), "actions.reverseDirection");
	assert.equal(renderedIcons.get(center.children[0]!), "arrow-left-right");
	assert.equal(renderedTooltips.get(center.children[0]!), "actions.swapTitle");
	assert.equal(renderedIcons.get(center.children[1]!), "arrow-right");
	assert.equal(renderedTooltips.get(center.children[1]!), "actions.reverseDirection");
	const right = root.find("file-diff-sbs-right-file");
	assert.ok(right);
	assert.equal(right.find("file-diff-sbs-file-edit-button")?.attributes.get("aria-label"), "actions.edit");
	center.children[0]?.handlers.get("click")?.();
	center.children[1]?.handlers.get("click")?.();
	right.find("file-diff-sbs-file-edit-button")?.handlers.get("click")?.();
	top.children[1]?.handlers.get("click")?.();
	assert.deepEqual(clicked, ["swap", "reverse", "edit", "save"]);
	root.children = [];
	await view.setState({ ...view.state, direction: "right-to-left" }, { history: false });
	view.buildLayout(leftFile as unknown as TFile, rightFile as unknown as TFile, ["old"], ["new"]);
	assert.ok(root.find("file-diff-sbs-left-file")?.find("file-diff-sbs-file-edit-button"));
	assert.equal(root.find("file-diff-sbs-right-file")?.find("file-diff-sbs-file-edit-button"), undefined);
	assert.equal(root.find("file-diff-sbs-hint"), undefined);
	assert.equal(renderedIcons.get(root.find("file-diff-sbs-direction")!.children[1]!), "arrow-left");
	const review = root.find("file-diff-sbs-review-toolbar");
	assert.ok(review?.children[0]?.children[0]);
	assert.equal(review.children[0].children[0].attributes.get("aria-label"), "actions.undo");
	assert.equal(review.children[0].children[0].text, "");
	assert.equal(renderedIcons.get(review.children[0].children[0]), "undo-2");
	assert.equal(renderedTooltips.get(review.children[0].children[0]), "actions.undoTitle");
	assert.equal(root.find("file-diff-sbs-comparison-toolbar")?.find("file-diff-sbs-summary"), undefined);
	const reviewNavigation = root.find("file-diff-sbs-review-navigation");
	assert.ok(reviewNavigation?.children[0]?.classes.has("file-diff-sbs-summary"));
	assert.ok(reviewNavigation?.children[1]?.classes.has("file-diff-sbs-navigation"));
	const navigation = root.find("file-diff-sbs-navigation");
	assert.deepEqual(navigation?.children.map(button => button.attributes.get("aria-label")), ["actions.previousChange", "actions.nextChange"]);
	assert.ok(navigation?.children.every(button => button.text === ""));
	assert.deepEqual(navigation?.children.map(button => renderedIcons.get(button)), ["arrow-up", "arrow-down"]);
	assert.deepEqual(navigation?.children.map(button => renderedTooltips.get(button)), ["actions.previousChangeTitle", "actions.nextChangeTitle"]);

});

test("new vault selections and external drops use the default without changing an open review", async () => {
	const { view, settings, leftFile, rightFile } = createView(["old"], ["new"]);
	settings.defaultApplyDirection = "right-to-left";
	await view.setState({ leftPath: leftFile.path, rightPath: rightFile.path, mode: "compare", editRight: false }, { history: false });
	assert.equal(view.applyDirection, "right-to-left");
	settings.defaultApplyDirection = "left-to-right";
	assert.equal(view.applyDirection, "right-to-left");
	await view.setState({ ...view.state, editRight: true }, { history: false });
	assert.equal(view.applyDirection, "right-to-left");
	await view.applyRightFile(leftFile as unknown as TFile, rightFile as unknown as TFile);
	assert.equal(view.applyDirection, "left-to-right");
	settings.defaultApplyDirection = "right-to-left";
	await view.dropMarkdown([droppedMarkdown("snapshot.md", "source")]);
	assert.equal(view.applyDirection, "right-to-left");
	assert.equal(view.canApplyChange(), true);
});

test("the editor normalizes its rows around the target while preserving physical file positions", async () => {
	/** Supplies only the DOM operations needed before observer initialization. */
	class EditElement {
		children: EditElement[] = [];
		dataset: Record<string, string> = {};
		createEl(_tag: string, options: { cls: string }): EditElement { return this.createDiv(options); }
		addEventListener(): void {}
		classes = new Set<string>();
		ownerDocument = { defaultView: null };
		createDiv(options: { cls: string }): EditElement {
			const node = new EditElement();
			node.addClass(...options.cls.split(" "));
			this.children.push(node);
			return node;
		}
		addClass(...classes: string[]): void { classes.forEach(value => this.classes.add(value)); }
		setAttribute(): void {}
	}
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		const { view, rendered } = createView(["A", "left-only", "Z"], ["A", "Z", "right-only"]);
		await view.setState({ ...view.state, direction, editRight: true }, { history: false });
		const sourceRows: ComparisonRowModel[] = [];
		const targetRows: ComparisonRowModel[] = [];
		Object.assign(view, {
			buildEditableLeftCell: (_parent: unknown, row: ComparisonRowModel) => { sourceRows.push(row); },
			buildEditableRightLine: (_parent: unknown, row: ComparisonRowModel) => { targetRows.push(row); },
			synchronizeEditablePanes: () => {}
		});
		const grid = new EditElement();
		view.buildEditableModeLayout(grid as unknown as HTMLElement, rendered);
		const targetIndex = direction === "left-to-right" ? 1 : 0;
		assert.ok(grid.children[targetIndex]?.classes.has("file-diff-sbs-edit-target-pane"));
		assert.ok(grid.children[1-targetIndex]?.classes.has("file-diff-sbs-edit-reference-pane"));
		const sourceSide = direction === "left-to-right" ? "left" : "right";
		const targetSide = sourceSide === "left" ? "right" : "left";
		assert.deepEqual(sourceRows.map(row => row.left), rendered.map(row => row[sourceSide]));
		assert.deepEqual(targetRows.map(row => row.right), rendered.map(row => row[targetSide]));
		assert.deepEqual(targetRows.map(row => row.rightLineNumber), rendered.map(row => row[targetSide === "left" ? "leftLineNumber" : "rightLineNumber"]));
		assert.equal(view.state.leftPath, "left.md");
		assert.equal(view.state.rightPath, "right.md");
	}
});

test("rendered target editors preserve real blank and whitespace lines while excluding alignment gaps", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		for (const target of [["A", "", "  ", "Z", ""], ["A", "Z"]]) {
			const source = target.length > 2 ? ["A", "Z"] : ["A", "source-only", "another-source-line", "Z"];
			const left = direction === "left-to-right" ? source : target;
			const right = direction === "left-to-right" ? target : source;
			const { view } = createView(left, right);
			await view.setState({ ...view.state, direction, editRight: true }, { history: false });
			Object.assign(view, { synchronizeEditablePanes: () => {} });
			const root = new EditorElement();
			view.buildEditableModeLayout(root as unknown as HTMLElement, createComparisonModelFromLines(left, right).rows);
			const editor = root.querySelector(".file-diff-sbs-document-editor");
			assert.ok(editor);
			assert.equal(view.serializeRightEditor(editor as unknown as HTMLElement), target.join("\n"), `${direction}: ${JSON.stringify(target)}`);
			const code = editor.children[0]?.querySelector(".file-diff-sbs-edit-code");
			assert.ok(code);
			code.textContent = "edited";
			assert.equal(view.serializeRightEditor(editor as unknown as HTMLElement), ["edited", ...target.slice(1)].join("\n"));
		}
	}
});

test("loading, rendering, editing and saving retain terminal line breaks only in the selected target", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		for (const ending of ["\n", "\r\n", "\r"]) {
			for (const finalBreaks of [0, 1, 2]) {
				const target = ["A", "", "  ", "Z"].join(ending) + ending.repeat(finalBreaks);
				const source = "A\nsource-only\nZ";
				const contents = direction === "left-to-right" ? [source, target] : [target, source];
				const { view, leftFile, rightFile } = createView([], []);
				const stored = new Map([[leftFile.path, contents[0]!], [rightFile.path, contents[1]!]]);
				const editors: EditorElement[] = [];
				Object.assign(view.app.vault, {
					cachedRead: (file: TestFile) => Promise.resolve(stored.get(file.path)),
					process: (file: TestFile, transform: (value: string) => string) => {
						stored.set(file.path, transform(stored.get(file.path)!));
						return Promise.resolve();
					}
				});
				Object.assign(view, {
					renderDiff: module.exports.SideBySideDiffView.prototype.renderDiff,
					changeActions: new Map(),
					contentEl: { empty: () => {}, addClass: () => {} },
					disposeRightEditorObserver: () => {}, restoreScrollPosition: () => {}, synchronizeEditablePanes: () => {},
					buildLayout: (_left: unknown, _right: unknown, left: string[], right: string[]) => {
						const root = new EditorElement();
						view.buildEditableModeLayout(root as unknown as HTMLElement, createComparisonModelFromLines(left, right).rows);
						const editor = root.querySelector(".file-diff-sbs-document-editor");
						assert.ok(editor);
						editors.push(editor);
					}
				});
				await view.setState({ ...view.state, direction, editRight: true }, { history: false });
				const editor = editors[0];
				assert.ok(editor);
				const normalized = target.replace(/\r\n?/g, "\n");
				assert.equal(view.serializeRightEditor(editor as unknown as HTMLElement), normalized, `${direction}, ${JSON.stringify(ending)}, ${finalBreaks} final breaks`);
				Object.assign(view, { rightEditorState: { editor, initialValue: normalized } });
				editor.querySelector(".file-diff-sbs-edit-code")!.textContent = "edited-A";
				assert.equal(await view.saveRightEdits(), true);
				assert.equal(stored.get(view.targetPath!), target.replace(/^A/, "edited-A"));
				assert.equal(stored.get(direction === "left-to-right" ? leftFile.path : rightFile.path), source);
			}
		}
	}
});

/** Traverses the rendered test DOM, including group wrappers and deleted-line previews. */
function allElements(root: EditorElement): EditorElement[] {
	return [root, ...root.children.flatMap(allElements)];
}

/** Uses real loading, rendering, merge, undo and guarded save methods against an in-memory vault. */
async function createPendingPreviewView(direction: "left-to-right" | "right-to-left", source: string[], target: string[]) {
	const left = direction === "left-to-right" ? source : target;
	const right = direction === "left-to-right" ? target : source;
	const { view, session, leftFile, rightFile } = createView(left, right);
	const stored = new Map([[leftFile.path, left.join("\n")], [rightFile.path, right.join("\n")]]);
	const root = new EditorElement();
	Object.assign(view.app.vault, {
		cachedRead: (file: TestFile) => Promise.resolve(stored.get(file.path)!),
		process: (file: TestFile, transform: (value: string) => string) => {
			stored.set(file.path, transform(stored.get(file.path)!));
			return Promise.resolve();
		}
	});
	Object.assign(view, {
		contentEl: root, changeActions: new Map(),
		renderDiff: module.exports.SideBySideDiffView.prototype.renderDiff,
		renderDiffRow: module.exports.SideBySideDiffView.prototype.renderDiffRow
	});
	await view.setState({ ...view.state, direction }, { history: false });
	const targetSide: "left" | "right" = direction === "left-to-right" ? "right" : "left";
	const targetPath = targetSide === "right" ? rightFile.path : leftFile.path;
	const sourcePath = targetSide === "right" ? leftFile.path : rightFile.path;
	/** Extracts only real file text, using the same metadata as the clipboard handler. */
	function displayedText(side: "left" | "right"): string {
		return allElements(root).filter(el => el.classes.has("file-diff-sbs-code") && el.dataset.diffSide === side && el.dataset.diffPresent === "true").map(el => el.innerText).join("\n");
	}
	return { view, session, stored, root, targetSide, targetPath, sourcePath, displayedText };
}

test("row and block acceptance and undo use inline feedback while saves retain global notices", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		for (const grouped of [false, true]) {
			notices.length = 0;
			const { view, root } = await createPendingPreviewView(direction, ["A", "new-a", "new-b", "Z"], ["A", "old-a", "old-b", "Z"]);
			const feedback = () => root.querySelector(".file-diff-sbs-review-feedback")?.textContent;
			assert.equal(feedback(), "");
			await view.undoLastChange();
			assert.equal(feedback(), "", "an unavailable undo must not report success");
			const accept = () => grouped ? view.applyGroupChange(1, 2, direction) : view.applyRowChange(1, direction);
			await accept();
			assert.equal(feedback(), "notice.staged");
			assert.deepEqual(notices, [], "accepting rows or blocks must not create global notices");
			await view.undoLastChange();
			assert.equal(feedback(), "notice.undone");
			assert.deepEqual(notices, [], "undo must not create global notices");
			await view.renderDiff();
			assert.equal(feedback(), "", "refresh must clear stale action feedback");
			await view.applyRowChange(999, direction);
			assert.equal(feedback(), "", "an unavailable row must not report success");
			await accept();
			assert.equal(await view.savePendingChanges(), true);
			assert.equal(feedback(), "", "a successful save must clear the staged feedback");
			assert.deepEqual(notices, ["notice.saved"]);
		}
	}
});

test("pending target insertions, replacements and deletions remain marked until save or undo in both directions", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		for (const [source, target] of [
			[["A", "new", "Z"], ["A", "old", "Z"]],
			[["A", "new", "Z"], ["A", "Z"]],
			[["A", "Z"], ["A", "old", "Z"]],
			[["new"], []], [[], ["old"]],
			[["A", "new-a", "new-b", "Z"], ["A", "old-a", "old-b", "old-c", "Z"]]
		]) {
			assert.ok(source && target);
			const { view, session, stored, root, targetSide, targetPath, sourcePath, displayedText } = await createPendingPreviewView(direction, source, target);
			const left = direction === "left-to-right" ? source : target;
			const right = direction === "left-to-right" ? target : source;
			const rows = createComparisonModelFromLines(left, right).rows;
			const changed = rows.flatMap((row, index) => row.equal ? [] : [index]);
			const grouped = changed.length > 1;
			const apply = () => grouped ? view.applyGroupChange(0, rows.length - 1, direction) : view.applyRowChange(changed[0]!, direction);
			await apply();
			const pendingCells = allElements(root).filter(el => el.dataset.diffPending !== undefined);
			assert.ok(pendingCells.length > 0);
			for (const cell of pendingCells) {
				assert.equal(cell.querySelector(".file-diff-sbs-code")?.dataset.diffSide, targetSide);
				assert.equal(cell.dataset.diffOperation, "none", "accepted previews must use text styling, not open-diff backgrounds");
			}
			if (source.some(line => !target.includes(line))) assert.ok(pendingCells.some(cell => cell.dataset.diffPending === "insert"));
			if (target.some(line => !source.includes(line))) assert.ok(pendingCells.some(cell => cell.dataset.diffPending === "delete"));
			for (const row of allElements(root).filter(el => el.classes.has("file-diff-sbs-pending-deletion"))) {
				assert.equal(row.dataset.diffRowIndex, undefined, "preview deletions must not change action indexes");
				assert.equal(row.dataset.diffChange, undefined);
				assert.equal(row.children[1]?.children.length, 0);
				const code = row.children[targetSide === "right" ? 2 : 0]?.querySelector(".file-diff-sbs-code");
				assert.equal(code?.dataset.diffPresent, "false", "deleted previews must never be copied as target content");
			}
			assert.equal(displayedText(targetSide), source.join("\n"));
			assert.equal(displayedText(targetSide === "right" ? "left" : "right"), source.join("\n"));
			assert.equal(stored.get(targetPath), target.join("\n"), "accept must still require an explicit save");
			await view.undoLastChange();
			assert.equal(allElements(root).some(el => el.dataset.diffPending !== undefined), false);
			assert.equal(displayedText(targetSide), target.join("\n"));
			assert.equal(session.hasPendingChanges(), false);
			await apply();
			assert.equal(await view.savePendingChanges(), true);
			assert.equal(allElements(root).some(el => el.dataset.diffPending !== undefined), false);
			assert.equal(stored.get(targetPath), source.join("\n"));
			assert.equal(stored.get(sourcePath), source.join("\n"));
		}
	}
});

test("deleted preview rows do not shift the next merge button and undo retains earlier pending markers", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		const { view, root, targetSide, displayedText } = await createPendingPreviewView(direction, ["A", "new-a", "new-b", "Z"], ["A", "old-a", "old-b", "Z"]);
		await view.applyRowChange(1, direction);
		assert.equal(allElements(root).filter(el => el.classes.has("file-diff-sbs-pending-deletion")).length, 1);
		const nextRow = allElements(root).find(el => el.classes.has("file-diff-sbs-row") && el.dataset.diffRowIndex === "2" && el.dataset.diffChange === "true");
		assert.ok(nextRow);
		const realApply = view.applyRowChange.bind(view);
		let operation: Promise<void> | undefined;
		view.applyRowChange = (index, selectedDirection) => { operation = realApply(index, selectedDirection); return operation; };
		nextRow.children[1]?.children.find(child => child.handlers.has("click"))?.handlers.get("click")?.();
		assert.ok(operation);
		await operation;
		assert.equal(displayedText(targetSide), "A\nnew-a\nnew-b\nZ");
		assert.equal(allElements(root).filter(el => el.dataset.diffPending === "insert").length, 2);
		await view.undoLastChange();
		assert.equal(displayedText(targetSide), "A\nnew-a\nold-b\nZ");
		assert.equal(allElements(root).filter(el => el.dataset.diffPending === "insert").length, 1);
	}
});

test("a failed guarded save retains the pending target markers and deletion previews", async () => {
	const { view, session, root, stored, targetPath } = await createPendingPreviewView("right-to-left", ["A", "new", "Z"], ["A", "old", "Z"]);
	await view.applyRowChange(1, "right-to-left");
	stored.set(targetPath, "changed outside the comparison");
	assert.equal(await view.savePendingChanges(), false);
	assert.equal(allElements(root).filter(el => el.dataset.diffPending === "insert").length, 1);
	assert.equal(allElements(root).filter(el => el.dataset.diffPending === "delete").length, 1);
	assert.equal(stored.get(targetPath), "changed outside the comparison");
	assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 1, ignored: 0 });
	assert.equal(allElements(root).filter(el => el.dataset.reviewStatus === "accepted").length, 1);
});

test("pending target text stays distinct from open diff backgrounds when the source changes again", async () => {
	const { view, root, stored, sourcePath } = await createPendingPreviewView("left-to-right", ["A", "accepted text", "Z"], ["A", "old text", "Z"]);
	await view.applyRowChange(1, "left-to-right");
	stored.set(sourcePath, "A\nnewer source text\nZ");
	await view.renderDiff();
	const pendingCell = allElements(root).find(el => el.dataset.diffPending === "insert");
	assert.ok(pendingCell);
	assert.equal(pendingCell.dataset.diffOperation, "none");
	const code = pendingCell.querySelector(".file-diff-sbs-code");
	assert.equal(code?.innerText, "accepted text");
	assert.equal(code?.querySelector(".file-diff-sbs-inline-right"), null);
	assert.ok(allElements(root).some(el => el.dataset.diffChange === "true"), "the changed source still needs review");
});


test("only the active change receives a position badge, updated after navigation, resolution and editing", () => {
	/** Captures the frame and badge lifecycle without substituting the view's position logic. */
	function frame() {
		const badges: { text: string; remove(): void; setAttribute(): void }[] = [];
		return {
			badges,
			toggleClass: () => {}, setAttribute: () => {}, removeAttribute: () => {}, scrollIntoView: () => {},
			createSpan: (options: { text: string }) => {
				const badge = { text: options.text, setAttribute: () => {}, remove: () => { badges.splice(badges.indexOf(badge), 1); } };
				badges.push(badge);
				return badge;
			}
		};
	}
	const frames = [frame(), frame(), frame()];
	const targets = new Map(frames.map((row, index) => [index * 3 + 1, [row as unknown as HTMLElement]]));
	const { view } = createView(["new"], ["old"]);
	Object.assign(view, {
		getChangeTargets: () => targets,
		contentEl: { querySelector: () => targets.size > 0 ? {} : null },
		updateChangeNavigationState: module.exports.SideBySideDiffView.prototype.updateChangeNavigationState,
		advanceAfterResolvedChange: module.exports.SideBySideDiffView.prototype.advanceAfterResolvedChange
	});
	assert.equal(view.focusChange(4), true);
	assert.deepEqual(frames.map(row => row.badges.map(badge => badge.text)), [[], ["2/3"], []]);
	assert.equal(view.focusChange(7), true);
	assert.deepEqual(frames.map(row => row.badges.map(badge => badge.text)), [[], [], ["3/3"]]);
	targets.delete(1);
	view.updateChangeNavigationState();
	assert.deepEqual(frames.map(row => row.badges.map(badge => badge.text)), [[], [], ["2/2"]]);
	targets.delete(7);
	view.updateChangeNavigationState();
	assert.ok(frames.every(row => row.badges.length === 0));
	view.advanceAfterResolvedChange(1);
	assert.deepEqual(frames.map(row => row.badges.map(badge => badge.text)), [[], ["1/1"], []]);
	Object.assign(view, { viewState: { ...view.state, editRight: true } });
	view.updateChangeNavigationState();
	assert.ok(frames.every(row => row.badges.length === 0));
});

test("Keep both renders actual target/source text, stages one undo step and never reports different saved files as identical", async () => {
	for (const direction of ["left-to-right", "right-to-left"] as const) {
		const source = ["A", "s1", "s2", "s3", "s4", "Z"];
		const target = ["A", "t1", "t2", "t3", "t4", "Z"];
		const expected = "A\nt1\nt2\nt3\nt4\n\ns1\ns2\ns3\ns4\nZ";
		const { view, session, stored, root, targetPath, sourcePath, targetSide, displayedText } = await createPendingPreviewView(direction, source, target);
		Object.assign(view, {
			buildResolvedMessage: module.exports.SideBySideDiffView.prototype.buildResolvedMessage,
			buildIdenticalMessage: module.exports.SideBySideDiffView.prototype.buildIdenticalMessage
		});
		await view.applyGroupChange(1, 4, direction, "keep-both");
		assert.equal(displayedText(targetSide), expected);
		assert.equal(displayedText(targetSide === "right" ? "left" : "right"), source.join("\n"));
		assert.equal(stored.get(targetPath), target.join("\n"));
		assert.equal(stored.get(sourcePath), source.join("\n"));
		assert.deepEqual(session.getReviewCounts(), { open: 0, accepted: 4, ignored: 0 });
		await view.undoLastChange();
		assert.equal(displayedText(targetSide), target.join("\n"));
		assert.equal(session.hasPendingChanges(), false);
		await view.applyGroupChange(1, 4, direction, "keep-both");
		assert.equal(await view.savePendingChanges(), true);
		assert.equal(stored.get(targetPath), expected);
		assert.equal(session.hasEqualContents(), false);
		assert.equal(allElements(root).some(el => el.textContent === "messages.identical.title"), false);
		assert.equal(allElements(root).some(el => el.textContent === "messages.resolved.title"), true);
	}
});

test("retained variants never offer proposal-copy cleanup until a later explicit merge makes the files equal", async () => {
	const { view, session } = await createPendingPreviewView("left-to-right", ["A", "s1", "s2", "Z"], ["A", "t1", "t2", "Z"]);
	let cleanup = 0;
	Object.assign(view, {
		viewState: { ...view.state, mode: "accept" },
		isChangeCopyFile: () => true,
		confirmDeleteChangeCopy: () => { cleanup += 1; }
	});
	await view.applyGroupChange(1, 2, "left-to-right", "keep-both");
	assert.equal(await view.savePendingChanges(), true);
	assert.equal(cleanup, 0);
	session.resetReview();
	await view.renderDiff();
	await view.applyGroupChange(0, 99, "left-to-right");
	assert.equal(await view.savePendingChanges(), true);
	assert.equal(session.hasEqualContents(), true);
	assert.equal(cleanup, 1);
});

test("editor alignment retains pending work during composition and resumes after composition", () => {
	const { view } = createView(["left"], ["right"]);
	const frames: (() => void)[] = [];
	const synchronized: (number | null)[] = [];
	const editor = { isConnected: true } as HTMLElement;
	Object.assign(view, {
		viewState: { ...view.state, editRight: true }, composing: true, editSyncFrame: null,
		pendingEditSyncPreferredIndex: null, editInputSnapshot: null,
		contentEl: { ownerDocument: { defaultView: { requestAnimationFrame(callback: () => void) { frames.push(callback); return frames.length; } } } },
		synchronizeEditablePanes: (_editor: HTMLElement, index: number | null) => { synchronized.push(index); }
	});
	view.scheduleEditablePaneSync(editor, 4);
	assert.equal(frames.length, 0);
	Object.assign(view, { composing: false });
	view.scheduleEditablePaneSync(editor);
	assert.equal(frames.length, 1);
	Object.assign(view, { composing: true });
	frames[0]!();
	assert.deepEqual(synchronized, []);
	Object.assign(view, { composing: false });
	view.scheduleEditablePaneSync(editor);
	frames[1]!();
	assert.deepEqual(synchronized, [4]);
});

test("layout scroll anchoring follows the viewport when responsive headers change height", () => {
	const { view } = createView(["left"], ["right"]);
	const root = {
		dataset: { layout: "side-by-side" },
		querySelector(selector: string): unknown {
			if (selector === ".file-diff-sbs-layout-button") return { setAttribute: () => {} };
			if (selector === ".file-diff-sbs-grid") return { dataset: {} };
			return scroll;
		},
		querySelectorAll(selector: string): unknown[] { return selector === ".file-diff-sbs-row" ? [anchor] : []; }
	};
	const viewportTop = () => root.dataset.layout === "single-column" ? 300 : 100;
	const scroll = { scrollTop: 500, getBoundingClientRect: () => ({ top: viewportTop() }) };
	const anchor = {
		getBoundingClientRect: () => ({ top: viewportTop() + 490 - scroll.scrollTop, bottom: viewportTop() + 514 - scroll.scrollTop }),
		querySelector: () => null
	};
	Object.assign(view, {
		layoutObserver: {},
		app: { workspace: { requestSaveLayout: () => {} } },
		contentEl: { clientWidth: 390, querySelector: () => root, ownerDocument: { activeElement: null, getSelection: () => null } }
	});
	for (const layout of ["single-column", "side-by-side"] as const) {
		view.setLayout(layout);
		assert.equal(root.dataset.layout, layout);
		assert.equal(scroll.scrollTop, 500, "header movement must not scroll the document");
		assert.equal(anchor.getBoundingClientRect().top - viewportTop(), -10);
	}
});

test("Enter on a toolbar button leaves editing to native button activation", () => {
	const { view } = createView(["left"], ["right"]);
	const editor = {};
	const button = {};
	let inserted = 0;
	let prevented = 0;
	Object.assign(view, {
		viewState: { ...view.state, editRight: true },
		getEditableEditor: (target: unknown) => target === editor ? editor : null,
		insertEditableLineBreak: () => { inserted += 1; return true; }
	});
	const event = {
		key: "Enter", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
		preventDefault: () => { prevented += 1; }, stopImmediatePropagation: () => {}
	};
	view.handleKeydown({ ...event, target: button } as unknown as KeyboardEvent);
	assert.equal(inserted, 0);
	assert.equal(prevented, 0);
	view.handleKeydown({ ...event, target: editor } as unknown as KeyboardEvent);
	assert.equal(inserted, 1);
	assert.equal(prevented, 1);
});
