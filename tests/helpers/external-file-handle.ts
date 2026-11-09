import { open, readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { ExternalFileHandle } from "../../src/external-markdown.ts";

/** Models browser capability I/O against temporary files for view integration tests. */
export function diskFileHandle(path: string): ExternalFileHandle {
  const handle = {
    kind: "file" as const,
    name: basename(path),
    getFile: async () => {
      const content = await readFile(path, "utf8");
      return new File([content], basename(path));
    },
    isSameEntry: (other: FileSystemHandle) => Promise.resolve(other === handle),
    requestPermission: () => Promise.resolve("granted" as const),
    createWritable: async () => {
      await stat(path);
      let pending = "";
      return {
        write: (content: string) => { pending = content; return Promise.resolve(); },
        close: async () => {
          const file = await open(path, "r+");
          try { await file.writeFile(pending); await file.truncate(Buffer.byteLength(pending)); }
          finally { await file.close(); }
        },
        abort: () => Promise.resolve()
      } as unknown as FileSystemWritableFileStream;
    }
  };
  return handle;
}
