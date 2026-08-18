import { TFile } from "obsidian";
import type { TAbstractFile } from "obsidian";

export const VIEW_TYPE = "side-by-side-diff-view";

const BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  "7z",
  "avif",
  "bmp",
  "class",
  "doc",
  "docx",
  "exe",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "otf",
  "pdf",
  "png",
  "rar",
  "tar",
  "ttf",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip"
]);

/** Returns whether a vault file can be compared as text. */
export function isTextFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && !BINARY_EXTENSIONS.has(file.extension.toLowerCase());
}

