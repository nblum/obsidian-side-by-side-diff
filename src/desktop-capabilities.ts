import { Platform } from "obsidian";

/** Loads native path helpers only when a desktop path operation is actually requested. */
export function getDesktopPaths(): typeof import("node:path") | null {
	if (typeof Platform !== "undefined" && Platform.isMobileApp) return null;
	try {
		// Obsidian desktop provides Node; mobile must never resolve this module.
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Lazy desktop capability boundary.
		return require("node:path") as typeof import("node:path");
	} catch {
		return null;
	}
}

/** Reads path metadata from an explicit desktop drop without importing Electron at startup. */
export function getNativeDropPath(file: File): string | null {
	if (typeof Platform !== "undefined" && Platform.isMobileApp) return null;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Lazy desktop capability boundary.
		const electron = require("electron") as typeof import("electron");
		const path = electron.webUtils?.getPathForFile(file);
		if (typeof path === "string" && path.length > 0) return path;
	} catch {
		// Older desktop installers expose File.path instead.
	}
	const legacyPath = (file as File & { path?: string }).path;
	return typeof legacyPath === "string" && legacyPath.length > 0 ? legacyPath : null;
}
