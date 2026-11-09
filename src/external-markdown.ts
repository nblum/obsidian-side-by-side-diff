import { isAbsolute, relative, sep } from "node:path";
import { webUtils } from "electron";
import { SaveConflictError } from "./save-guard";

/** A file-scoped browser capability obtained from an explicit file drop. */
export interface ExternalFileHandle extends FileSystemFileHandle {
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

/** A dropped Markdown snapshot with an optional browser file capability. */
export interface ExternalMarkdown {
  path: string;
  name: string;
  extension: string;
  content: string;
  handle: ExternalFileHandle | null;
  // Native paths are used only to recognize vault files, never for external I/O.
  diskPath: string | null;
}

// Serialize external saves across views, including separately dropped handles for
// the same entry. No filesystem identifiers or persistent handle registry needed.
let saveQueue = Promise.resolve();

/** Resolves a native drop path within the vault without reading the filesystem. */
export function getVaultRelativePath(path: string, vaultBase: string): string | null {
  const pathInVault = relative(vaultBase, path);
  if (!pathInVault || pathInVault === ".." || pathInVault.startsWith(`..${sep}`) || isAbsolute(pathInVault)) return null;
  return pathInVault.split(sep).join("/");
}

/** Resolves only the desktop path attached to an explicitly dropped browser file. */
export function getDroppedFilePath(file: File): string | null {
  try {
    const path = webUtils?.getPathForFile(file);
    if (typeof path === "string" && path.length > 0) return path;
  } catch {
    // Older Electron versions expose File.path instead of webUtils.
  }
  const legacyPath = (file as File & { path?: string }).path;
  return typeof legacyPath === "string" && legacyPath.length > 0 ? legacyPath : null;
}

/** Captures the capability during the drop event, before its data store expires. */
export function getDroppedFileHandle(item: DataTransferItem | undefined): Promise<ExternalFileHandle | null> {
  const source = item as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }) | undefined;
  if (source?.kind !== "file" || typeof source.getAsFileSystemHandle !== "function") return Promise.resolve(null);
  try {
    return source.getAsFileSystemHandle().then((handle) => {
      if (handle?.kind !== "file") return null;
      const file = handle as Partial<ExternalFileHandle>;
      return typeof file.getFile === "function" && typeof file.isSameEntry === "function"
        && typeof file.createWritable === "function" && typeof file.requestPermission === "function"
        ? handle as ExternalFileHandle : null;
    }).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Reads fresh content through the dropped capability, or a read-only snapshot. */
export async function readExternalMarkdown(file: ExternalMarkdown): Promise<string> {
  if (file.handle === null) return file.content;
  const bytes = await (await file.handle.getFile()).arrayBuffer();
  // File.text() strips a UTF-8 BOM; preserve it as the previous native reader did.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

/** Starts permission acquisition within the save gesture, then queues the guarded save. */
export async function processExternalMarkdown(file: ExternalMarkdown, transform: (content: string) => string): Promise<void> {
  const handle = file.handle;
  if (handle === null) throw new Error("The dropped file has no writable browser handle.");
  // Request before waiting for other saves: user activation can expire while queued.
  const permission = handle.requestPermission({ mode: "readwrite" });
  const save = saveQueue.then(async () => {
    if (await permission !== "granted") throw new Error("Write access to the dropped file was denied.");
    await writeExternalMarkdown(file, handle, transform);
  });
  // Observe permission rejection immediately even while a previous save is pending.
  void permission.catch(() => {});
  saveQueue = save.catch(() => {});
  await save;
}

/** Validates the baseline while holding a browser writer and aborts failed saves. */
async function writeExternalMarkdown(file: ExternalMarkdown, handle: ExternalFileHandle, transform: (content: string) => string): Promise<void> {
  // Exclusive mode also rejects overlapping browser writers outside this plugin.
  const options: FileSystemCreateWritableOptions & { mode: "exclusive" } = { mode: "exclusive" };
  const writable = await handle.createWritable(options);
  try {
    const current = await readExternalMarkdown(file);
    const next = transform(current);
    await writable.write(next);
    // Browser writers commit on close. Recheck after async writes so deletion or
    // an outside edit during preparation cannot be silently overwritten.
    const latest = await readExternalMarkdown(file);
    if (latest !== current) {
      transform(latest); // Let the caller observe the changed baseline for a retry.
      throw new SaveConflictError();
    }
    await writable.close();
    file.content = next;
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
