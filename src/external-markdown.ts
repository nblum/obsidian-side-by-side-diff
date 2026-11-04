import { open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { webUtils } from "electron";

/** A dropped Markdown file, optionally backed by an accessible desktop file. */
export interface ExternalMarkdown {
  path: string;
  name: string;
  extension: string;
  content: string;
  diskPath: string | null;
}

const saveQueues = new Map<string, Promise<void>>();

/** Identifies physical files consistently across symlinks and hard links. */
export async function getPhysicalFileIdentity(path: string): Promise<string> {
  const info = await stat(path, { bigint: true });
  if (!info.isFile()) throw new Error("The dropped path is not a file.");
  return `${info.dev.toString()}:${info.ino.toString()}`;
}

/** Resolves desktop drops inside the vault back to their existing vault identity. */
export async function getVaultRelativePath(path: string, vaultBase: string): Promise<string | null> {
  const [filePath, basePath] = await Promise.all([realpath(path), realpath(vaultBase)]);
  const pathInVault = relative(basePath, filePath);
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

/** Reads the live desktop file, retaining memory-only drops as comparison sources. */
export async function readExternalMarkdown(file: ExternalMarkdown): Promise<string> {
  return file.diskPath === null ? file.content : readFile(file.diskPath, "utf8");
}

/** Writes an existing desktop file only after the caller has validated its current content. */
export async function processExternalMarkdown(file: ExternalMarkdown, transform: (content: string) => string): Promise<void> {
  if (file.diskPath === null) throw new Error("The dropped file has no writable desktop path.");
  const identity = await getPhysicalFileIdentity(file.diskPath);
  const previous = saveQueues.get(identity) ?? Promise.resolve();
  let release: () => void = () => {};
  const queued = new Promise<void>((resolve) => { release = resolve; });
  saveQueues.set(identity, queued);
  await previous;
  try {
    await writeExternalMarkdown(file, transform);
  } finally {
    release();
    if (saveQueues.get(identity) === queued) saveQueues.delete(identity);
  }
}

/** Reads, validates, and writes only while this physical file's save queue is held. */
async function writeExternalMarkdown(file: ExternalMarkdown, transform: (content: string) => string): Promise<void> {
  if (file.diskPath === null) throw new Error("The dropped file has no writable desktop path.");
  // r+ neither creates a deleted file nor truncates it before the save guard runs.
  const handle = await open(file.diskPath, "r+");
  try {
    const current = await handle.readFile("utf8");
    const next = transform(current);
    const buffer = Buffer.from(next, "utf8");
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, offset);
      if (bytesWritten === 0) throw new Error("Could not finish writing the external file.");
      offset += bytesWritten;
    }
    await handle.truncate(buffer.length);
    file.content = next;
  } finally {
    await handle.close();
  }
}
