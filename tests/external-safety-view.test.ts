import { test } from "node:test";
import { diskFileHandle } from "./helpers/external-file-handle.ts";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esbuild from "esbuild";
import type { SideBySideDiffView } from "../src/diff-view.ts";
import { DiffSession } from "../src/diff-session.ts";
import { DEFAULT_SETTINGS } from "../src/settings-model.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Provides vault file identity to the bundled view. */
class TestFile {
  path: string;
  name: string;
  extension = "md";
  constructor(path: string) { this.path = path; this.name = path; }
}

/** Provides the public desktop adapter API used for native path matching. */
class TestFileSystemAdapter {
  basePath: string;
  constructor(basePath: string) { this.basePath = basePath; }
  getBasePath(): string { return this.basePath; }
}

const notices: string[] = [];
const bundle = await esbuild.build({
  ...PLUGIN_BUNDLE_OPTIONS, entryPoints: [], write: false, logLevel: "silent",
  stdin: {
    contents: 'export { SideBySideDiffView } from "./src/diff-view"; export { UnsavedChangesModal } from "./src/modals";',
    resolveDir: process.cwd(), loader: "ts"
  }
});
assert.ok(bundle.outputFiles?.[0]);
const module = { exports: {} as { SideBySideDiffView: typeof SideBySideDiffView; UnsavedChangesModal: typeof import("../src/modals.ts").UnsavedChangesModal } };
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports, TextDecoder, Buffer, URL, console,
  require: (name: string) => {
    if (name === "electron") return {};
    if (name.startsWith("node:")) return createRequire(import.meta.url)(name);
    assert.equal(name, "obsidian");
    return {
      ItemView: class { async setState() {} }, TFile: TestFile, FileSystemAdapter: TestFileSystemAdapter,
      Notice: class { constructor(message: string) { notices.push(message); } }, Modal: class {}, SuggestModal: class {}
    };
  }
});

/** Runs real loading, transition, and action methods while replacing only DOM rendering. */
function createSafetyView(vaultBase?: string) {
  notices.length = 0;
  const files = new Map(["left.md", "right.md", "next.md"].map((path) => [path, new TestFile(path)]));
  const contents = new Map([["left.md", "anchor\nnew-a\nnew-b\nend"], ["right.md", "right"], ["next.md", "next"]]);
  const session = new DiffSession();
  let rendered = { left: "", right: "", message: "" };
  const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
  Object.assign(view, {
    session, externalMarkdown: null, retainedExternalMarkdown: null, renderToken: 0, dropToken: 0,
    changeActions: new Map(), viewState: { leftPath: "left.md", rightPath: "right.md", editRight: false, mode: "compare" },
    plugin: { language: "en", settings: DEFAULT_SETTINGS, translate: (key: string) => key, rememberRecentRightFile: () => Promise.resolve() },
    app: { vault: {
      adapter: vaultBase === undefined ? undefined : new TestFileSystemAdapter(vaultBase),
      getName: () => "Test Vault",
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      cachedRead: (file: TestFile) => vaultBase === undefined ? Promise.resolve(contents.get(file.path)!) : readFile(join(vaultBase, file.path), "utf8"),
      process: (file: TestFile, transform: (value: string) => string) => { contents.set(file.path, transform(contents.get(file.path)!)); return Promise.resolve(); }
    }, metadataCache: { getFirstLinkpathDest: () => null } },
    contentEl: { empty: () => {}, addClass: () => {}, createDiv: ({ text }: { text: string }) => { rendered.message = text; } },
    disposeRightEditorObserver: () => {}, getScrollPosition: () => null, restoreScrollPosition: () => {},
    getChangeTargetPosition: () => null, advanceAfterResolvedChange: () => {}, prepareForTransition: () => Promise.resolve(true),
    buildLayout: (_left: unknown, _right: unknown, leftLines: string[], rightLines: string[]) => {
      rendered = { left: leftLines.join("\n"), right: rightLines.join("\n"), message: "" };
    },
    buildSelectionLayout: (_left: unknown, leftLines: string[]) => { rendered = { left: leftLines.join("\n"), right: "", message: "" }; }
  });
  return { view, session, files, contents, rendered: () => ({ ...rendered }) };
}

/** Represents a native browser drop without requiring Electron in the tests. */
function nativeDrop(path: string, content: string): File {
  return { name: "outside.md", path, text: () => Promise.resolve(content) } as unknown as File;
}

test("single-row and grouped accepts refuse external content that changed after display", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-stale-display-"));
  try {
    const path = join(dir, "outside.md");
    for (const grouped of [false, true]) {
      const original = "anchor\nold-a\nold-b\nend";
      await writeFile(path, original);
      const { view, session, rendered } = createSafetyView();
      await view.dropMarkdown([nativeDrop(path, original)], Promise.resolve(diskFileHandle(path)));
      assert.equal(rendered().right, original);
      const changed = "inserted\nanchor\nEDITED ELSEWHERE\nold-b\nend";
      await writeFile(path, changed);
      if (grouped) await view.applyGroupChange(1, 2, "left-to-right");
      else await view.applyRowChange(1, "left-to-right");
      assert.equal(session.hasPendingChanges(), false, "a stale action must not stage an unseen change");
      assert.equal(await readFile(path, "utf8"), changed);
      assert.equal(rendered().right, changed, "the user must see the new comparison before accepting");
      assert.ok(notices.includes("notice.comparisonChanged"));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("accepting from an external source also refuses changes not displayed on the left", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-stale-source-"));
  try {
    const path = join(dir, "outside.md");
    await writeFile(path, "external source");
    const { view, session, contents, rendered } = createSafetyView();
    await view.dropMarkdown([nativeDrop(path, "external source")], Promise.resolve(diskFileHandle(path)));
    await view.swapFiles();
    await writeFile(path, "unreviewed source");
    await view.applyGroupChange(0, 10, "left-to-right");
    assert.equal(session.hasPendingChanges(), false);
    assert.equal(contents.get("left.md"), "anchor\nnew-a\nnew-b\nend");
    assert.equal(rendered().left, "unreviewed source");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("native drops of the left vault file are rejected before any transition", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-drop-identity-"));
  try {
    const base = join(dir, "vault");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(base);
    await writeFile(join(base, "left.md"), "same file");
    await writeFile(join(base, "right.md"), "right");
    for (const path of [join(base, "left.md"), `${base}/./left.md`]) {
      const { view, session, rendered } = createSafetyView(base);
      await view.renderDiff();
      session.dismissRow("review decision");
      let transitions = 0;
      Object.assign(view, { prepareForTransition: () => { transitions += 1; return Promise.resolve(true); } });
      const before = { ...view.state };
      const beforeRender = rendered();
      await view.dropMarkdown([nativeDrop(path, "same file")], Promise.resolve(diskFileHandle(path)));
      assert.deepEqual({ ...view.state }, before);
      assert.deepEqual(rendered(), beforeRender);
      assert.equal(session.getDismissedRowCount(), 1);
      assert.equal(transitions, 0);
      assert.ok(notices.includes("notice.differentFiles"));
    }
    const { view } = createSafetyView(base);
    await view.dropMarkdown([nativeDrop(join(base, "right.md"), "right")], Promise.resolve(diskFileHandle(join(base, "right.md"))));
    assert.equal(view.state.rightPath, "right.md", "existing vault files must keep their vault identity");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("selecting another right file invalidates an older pending external drop", async () => {
  const { view, files } = createSafetyView();
  let finish!: (content: string) => void;
  const pending = view.dropMarkdown([{ name: "slow.md", text: () => new Promise<string>((resolve) => { finish = resolve; }) } as File]);
  await view.applyRightFile(files.get("left.md")! as never, files.get("next.md")! as never);
  finish("slow file");
  await pending;
  assert.equal(view.state.rightPath, "next.md");
});

test("a newer external drop supersedes an internal drop awaiting confirmation", async () => {
  const { view, files } = createSafetyView();
  let finish!: (allowed: boolean) => void;
  let transitions = 0;
  Object.assign(view, { prepareForTransition: () => ++transitions === 1 ? new Promise<boolean>((resolve) => { finish = resolve; }) : Promise.resolve(true) });
  const pending = view.dropVaultFile(files.get("left.md")! as never, "right.md");
  await Promise.resolve();
  await view.dropMarkdown([{ name: "new.md", text: () => Promise.resolve("newer") } as File]);
  const newest = view.state.rightPath;
  finish(true);
  await pending;
  assert.equal(view.state.rightPath, newest);
});

test("failed native reads keep the previous comparison and review decisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-failed-drop-"));
  try {
    const { view, session, rendered } = createSafetyView();
    await view.renderDiff();
    session.dismissRow("keep this review decision");
    const before = { ...view.state };
    const beforeRender = rendered();
    await view.dropMarkdown([nativeDrop(join(dir, "missing.md"), "browser snapshot is readable")], Promise.resolve(diskFileHandle(join(dir, "missing.md"))));
    assert.deepEqual({ ...view.state }, before);
    assert.deepEqual(rendered(), beforeRender);
    assert.equal(session.getDismissedRowCount(), 1);
    assert.ok(notices.includes("notice.dropReadFailed"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("a native read failure during confirmation preserves pending edits and ignored rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-confirmed-drop-"));
  const modal = module.exports.UnsavedChangesModal.prototype;
  const waitForChoice = modal.waitForChoice;
  try {
    const path = join(dir, "outside.md");
    await writeFile(path, "readable before confirmation");
    const { view, session, rendered } = createSafetyView();
    Object.assign(view, { prepareForTransition: module.exports.SideBySideDiffView.prototype.prepareForTransition });
    session.stageChange("right.md", "pending edits", "right");
    session.dismissRow("ignored row");
    await view.renderDiff();
    const before = { ...view.state };
    const beforeRender = rendered();
    modal.waitForChoice = async () => { await unlink(path); return "discard"; };
    await view.dropMarkdown([nativeDrop(path, "readable before confirmation")], Promise.resolve(diskFileHandle(path)));
    assert.deepEqual({ ...view.state }, before);
    assert.deepEqual(rendered(), beforeRender);
    assert.equal(session.getDisplayedContent("right.md", "right"), "pending edits");
    assert.equal(session.getDismissedRowCount(), 1);
    assert.ok(notices.includes("notice.dropReadFailed"));
  } finally {
    modal.waitForChoice = waitForChoice;
    await rm(dir, { recursive: true, force: true });
  }
});

test("a superseded drop cannot discard the newer comparison after its dialog closes", async () => {
  const { view, session, files } = createSafetyView();
  const modal = module.exports.UnsavedChangesModal.prototype;
  const waitForChoice = modal.waitForChoice;
  let finish!: (choice: "discard") => void;
  let opened!: () => void;
  const dialogOpened = new Promise<void>((resolve) => { opened = resolve; });
  try {
    Object.assign(view, { prepareForTransition: module.exports.SideBySideDiffView.prototype.prepareForTransition });
    session.stageChange("right.md", "old pending", "right");
    modal.waitForChoice = () => { opened(); return new Promise((resolve) => { finish = resolve; }); };
    const pendingDrop = view.dropMarkdown([{ name: "old.md", text: () => Promise.resolve("old drop") } as File]);
    await dialogOpened;
    await view.applyRightFile(files.get("left.md")! as never, files.get("next.md")! as never);
    session.stageChange("next.md", "newer pending", "next");
    session.dismissRow("new review decision");
    finish("discard");
    await pendingDrop;
    assert.equal(view.state.rightPath, "next.md");
    assert.equal(session.getDisplayedContent("next.md", "next"), "newer pending");
    assert.equal(session.getDismissedRowCount(), 1);
  } finally { modal.waitForChoice = waitForChoice; }
});


test("browser identity rejects a second external handle for the left entry without native paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-browser-identity-"));
  try {
    const path = join(dir, "outside.md");
    await writeFile(path, "outside");
    const { view, session } = createSafetyView();
    const first = diskFileHandle(path);
    first.isSameEntry = () => Promise.resolve(true);
    const drop = { name: "outside.md", text: () => Promise.resolve("outside") } as File;
    await view.dropMarkdown([drop], Promise.resolve(first));
    await view.swapFiles();
    const before = { ...view.state };
    session.dismissRow("keep review");
    let transitions = 0;
    Object.assign(view, { prepareForTransition: () => { transitions += 1; return Promise.resolve(true); } });
    await view.dropMarkdown([drop], Promise.resolve(diskFileHandle(path)));
    assert.deepEqual({ ...view.state }, before);
    assert.equal(session.getDismissedRowCount(), 1);
    assert.equal(transitions, 0);
    assert.ok(notices.includes("notice.differentFiles"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("snapshot fallback can merge into the vault but never stages an external write", async () => {
  const { view, session, contents } = createSafetyView();
  await view.dropMarkdown([{ name: "snapshot.md", text: () => Promise.resolve("snapshot") } as File]);
  await view.applyGroupChange(0, 10, "left-to-right");
  assert.equal(session.hasPendingChanges(), false);
  await view.applyGroupChange(0, 10, "right-to-left");
  assert.equal(await view.writePendingChanges(), "saved");
  assert.equal(contents.get("left.md"), "snapshot");
});
