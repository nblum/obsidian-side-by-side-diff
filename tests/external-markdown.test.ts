import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/external-markdown.ts"], write: false, logLevel: "silent" });
const output = bundle.outputFiles?.[0];
assert.ok(output);

/** Loads the desktop boundary with the Electron version under test. */
function loadDesktopApi(electron: object, filesystem?: object): typeof import("../src/external-markdown.ts") {
  const module = { exports: {} as typeof import("../src/external-markdown.ts") };
  runInNewContext(output!.text, {
    module, exports: module.exports, Buffer,
    require: (name: string) => name === "electron" ? electron : name === "node:fs/promises" && filesystem !== undefined ? filesystem : createRequire(import.meta.url)(name)
  });
  return module.exports;
}

test("desktop drops use Electron webUtils paths and retain the legacy File.path fallback", () => {
  const file = { name: "note.md", path: "/legacy/note.md" } as unknown as File;
  const modern = loadDesktopApi({ webUtils: { getPathForFile: (dropped: File) => {
    assert.equal(dropped, file);
    return "/modern/note.md";
  } } });
  assert.equal(modern.getDroppedFilePath(file), "/modern/note.md");
  assert.equal(loadDesktopApi({}).getDroppedFilePath(file), "/legacy/note.md");
  const unavailable = loadDesktopApi({ webUtils: { getPathForFile: () => { throw new Error("Unavailable"); } } });
  assert.equal(unavailable.getDroppedFilePath(file), "/legacy/note.md");
});

test("memory-only drops cannot be written without a desktop path", async () => {
  const api = loadDesktopApi({ webUtils: { getPathForFile: () => "" } });
  assert.equal(api.getDroppedFilePath({ name: "note.md" } as File), null);
  const source = { path: "external:1", name: "note.md", extension: "md", content: "snapshot", diskPath: null };
  assert.equal(await api.readExternalMarkdown(source), "snapshot");
  await assert.rejects(api.processExternalMarkdown(source, () => "edit"), /no writable desktop path/);
});


test("concurrent saves through physical aliases serialize and validate inside the lock", async () => {
  let disk = "old!";
  let activeReads = 0;
  let maximumReads = 0;
  let readCount = 0;
  let release!: () => void;
  let started!: () => void;
  const firstRead = new Promise<void>((resolve) => { started = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const filesystem = {
    stat: () => Promise.resolve({ dev: 1n, ino: 123n, isFile: () => true }),
    open: () => Promise.resolve({
      readFile: async () => {
        activeReads += 1;
        maximumReads = Math.max(maximumReads, activeReads);
        const current = disk;
        if (++readCount === 1) { started(); await blocked; }
        activeReads -= 1;
        return current;
      },
      write: (buffer: Buffer, offset: number, length: number) => {
        disk = buffer.toString("utf8", offset, offset + length);
        return Promise.resolve({ bytesWritten: length });
      },
      truncate: (length: number) => { disk = disk.slice(0, length); return Promise.resolve(); },
      close: () => Promise.resolve()
    })
  };
  const api = loadDesktopApi({}, filesystem);
  const source = { path: "external:1", name: "note.md", extension: "md", content: "old!", diskPath: "/note.md" };
  const guarded = (next: string) => (current: string): string => {
    if (current !== "old!") throw new Error("conflict");
    return next;
  };
  const first = api.processExternalMarkdown(source, guarded("AAAA"));
  await firstRead;
  const second = api.processExternalMarkdown({ ...source, diskPath: "/alias.md" }, guarded("BBBB"));
  // Capture any early rejection while deliberately holding the first save in its read.
  const completed = Promise.allSettled([first, second]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  const results = await completed;
  assert.equal(maximumReads, 1);
  assert.equal(results[0]?.status, "fulfilled");
  assert.equal(results[1]?.status, "rejected");
  assert.equal(disk, "AAAA");
  // A conflict must release the queue for later explicit retries.
  await api.processExternalMarkdown(source, (current) => {
    assert.equal(current, "AAAA");
    return "CCCC";
  });
  assert.equal(disk, "CCCC");
});
