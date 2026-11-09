import { test } from "node:test";
import * as path from "node:path";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import type { ExternalFileHandle, ExternalMarkdown } from "../src/external-markdown.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/external-markdown.ts"], write: false, logLevel: "silent" });
const output = bundle.outputFiles?.[0];
assert.ok(output);

/** Loads the real capability boundary without exposing any Node filesystem module. */
function loadApi(electron: object = {}): typeof import("../src/external-markdown.ts") {
  const module = { exports: {} as typeof import("../src/external-markdown.ts") };
  runInNewContext(output!.text, {
    module, exports: module.exports, TextDecoder,
    require: (name: string) => {
      if (name === "electron") return electron;
      assert.equal(name, "node:path");
      return path;
    }
  });
  return module.exports;
}

/** Models transactional browser writes, with observable failures and mutable live content. */
function memoryFile(content = "old!") {
  const state = { content, permission: "granted" as PermissionState, aborted: 0, closed: 0, writers: 0 };
  const handle = {
    kind: "file", name: "outside.md",
    requestPermission: () => Promise.resolve(state.permission),
    getFile: () => Promise.resolve(new File([state.content], "outside.md")),
    isSameEntry: () => Promise.resolve(true),
    createWritable: () => {
      state.writers += 1;
      let pending = "";
      return Promise.resolve({
        write: (next: string) => { pending = next; return Promise.resolve(); },
        close: () => { state.content = pending; state.closed += 1; return Promise.resolve(); },
        abort: () => { state.aborted += 1; return Promise.resolve(); }
      } as unknown as FileSystemWritableFileStream);
    }
  } as ExternalFileHandle;
  const file: ExternalMarkdown = { path: "external:1", name: "outside.md", extension: "md", content, diskPath: null, handle };
  return { state, handle, file };
}

test("the shipped plugin does not import a Node filesystem module", async () => {
  const result = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, write: false, metafile: true, logLevel: "silent" });
  const imports = Object.values(result.metafile!.outputs).flatMap(output => output.imports.map(entry => entry.path));
  assert.ok(!imports.some(name => /^(node:)?fs(?:\/|$)/.test(name)), imports.join(", "));
});

test("native drop paths remain metadata for recognizing vault files", () => {
  const file = { name: "note.md", path: "/legacy/note.md" } as unknown as File;
  assert.equal(loadApi({ webUtils: { getPathForFile: () => "/modern/note.md" } }).getDroppedFilePath(file), "/modern/note.md");
  assert.equal(loadApi().getDroppedFilePath(file), "/legacy/note.md");
  assert.equal(loadApi({ webUtils: { getPathForFile: () => { throw new Error("Unavailable"); } } }).getDroppedFilePath(file), "/legacy/note.md");
  const api = loadApi();
  assert.equal(api.getVaultRelativePath("/vault/folder/note.md", "/vault"), "folder/note.md");
  for (const candidate of ["/vault", "/vault/../outside.md", "/vault-other/file.md"]) {
    assert.equal(api.getVaultRelativePath(candidate, "/vault"), null);
  }
});

test("file handles are captured synchronously before the drop data store expires", async () => {
  const api = loadApi();
  const { handle } = memoryFile();
  let called = false;
  const item = { kind: "file", getAsFileSystemHandle: () => { called = true; return Promise.resolve(handle); } } as unknown as DataTransferItem;
  const pending = api.getDroppedFileHandle(item);
  assert.equal(called, true);
  assert.equal(await pending, handle);
});

test("missing, rejected, directory, and incomplete capabilities fall back to snapshots", async () => {
  const api = loadApi();
  for (const item of [undefined, { kind: "file" }, { kind: "string" },
    { kind: "file", getAsFileSystemHandle: () => Promise.reject(new Error("unsupported")) },
    { kind: "file", getAsFileSystemHandle: () => { throw new Error("unsupported"); } },
    { kind: "file", getAsFileSystemHandle: () => Promise.resolve({ kind: "directory" }) },
    { kind: "file", getAsFileSystemHandle: () => Promise.resolve({ kind: "file", getFile: () => {} }) }
  ]) assert.equal(await api.getDroppedFileHandle(item as DataTransferItem | undefined), null);
  const file = { ...memoryFile().file, content: "snapshot", diskPath: "/native/path.md", handle: null };
  assert.equal(await api.readExternalMarkdown(file), "snapshot");
  await assert.rejects(api.processExternalMarkdown(file, () => "edit"), /no writable browser handle/);
});

test("permission denial and rejection leave content and pending snapshots intact", async () => {
  const api = loadApi();
  const { state, handle, file } = memoryFile();
  state.permission = "denied";
  await assert.rejects(api.processExternalMarkdown(file, () => "new"), /denied/);
  assert.equal(state.writers, 0);
  handle.requestPermission = () => Promise.reject(new Error("activation expired"));
  await assert.rejects(api.processExternalMarkdown(file, () => "new"), /activation expired/);
  assert.equal(state.content, "old!");
  assert.equal(file.content, "old!");
  handle.requestPermission = () => Promise.resolve("granted");
  await api.processExternalMarkdown(file, () => "retry");
  assert.equal(state.content, "retry");
});

test("save conflicts and failed browser writes abort without committing or updating snapshots", async () => {
  const api = loadApi();
  for (const stage of ["baseline", "write", "close", "changed-during-write", "deleted-during-write"] as const) {
    const { state, file, handle } = memoryFile();
    const createWritable = handle.createWritable;
    handle.createWritable = async (options) => {
      assert.equal((options as { mode: string }).mode, "exclusive");
      const writable = await createWritable(options);
      const write = writable.write;
      writable.write = async (next) => {
        if (stage === "write") throw new Error("write failed");
        await write(next);
        if (stage === "changed-during-write") state.content = "outside edit";
        if (stage === "deleted-during-write") handle.getFile = () => Promise.reject(new Error("deleted"));
      };
      if (stage === "close") writable.close = () => Promise.reject(new Error("close failed"));
      return writable;
    };
    await assert.rejects(api.processExternalMarkdown(file, current => {
      if (stage === "baseline" || current !== "old!") throw new Error("conflict");
      return "new";
    }));
    assert.equal(state.closed, 0, stage);
    assert.equal(state.aborted, 1, stage);
    assert.equal(file.content, "old!", stage);
    assert.equal(state.content, stage === "changed-during-write" ? "outside edit" : "old!", stage);
  }
});

test("concurrent saves through different handles serialize and revalidate inside the queue", async () => {
  const api = loadApi();
  const { state, file, handle } = memoryFile();
  let release!: () => void;
  let started!: () => void;
  const firstRead = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  handle.getFile = async () => {
    if (++reads === 1) { started(); await blocked; }
    return new File([state.content], "outside.md");
  };
  const guarded = (next: string) => (current: string): string => {
    if (current !== "old!") throw new Error("conflict");
    return next;
  };
  const first = api.processExternalMarkdown(file, guarded("AAAA"));
  await firstRead;
  const second = api.processExternalMarkdown({ ...file, handle: { ...handle } }, guarded("BBBB"));
  const completed = Promise.allSettled([first, second]);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(state.writers, 1);
  release();
  const results = await completed;
  assert.equal(results[0]?.status, "fulfilled");
  assert.equal(results[1]?.status, "rejected");
  assert.equal(state.content, "AAAA");
  await api.processExternalMarkdown(file, () => "CCCC");
  assert.equal(state.content, "CCCC");
});


test("browser reads and guarded saves preserve a UTF-8 byte-order mark", async () => {
  const api = loadApi();
  const { file, state } = memoryFile("\ufefforiginal\r\n");
  assert.equal(await api.readExternalMarkdown(file), "\ufefforiginal\r\n");
  await api.processExternalMarkdown(file, current => current.replace("original", "edited"));
  assert.equal(state.content, "\ufeffedited\r\n");
});
