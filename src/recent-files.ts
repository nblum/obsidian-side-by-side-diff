export const MAX_RECENT_FILES = 5;

/** Normalizes persisted recent-file paths and keeps the newest five entries. */
export function normalizeRecentFilePaths(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return Array.from(new Set(value.filter((path): path is string => typeof path === "string" && path.length > 0))).slice(0, MAX_RECENT_FILES);
}

/** Puts one selected file first and removes older duplicate entries. */
export function rememberRecentFilePath(paths: readonly string[], path: string): string[] {
	return normalizeRecentFilePaths([path, ...paths]);
}

/** Returns available files in recent-first order while retaining stable file order. */
export function orderRecentFiles<T extends { path: string }>(files: readonly T[], recentPaths: readonly string[]): T[] {
	const filesByPath = new Map(files.map((file) => [file.path, file]));
	const recent = normalizeRecentFilePaths(recentPaths).flatMap((path) => {
		const file = filesByPath.get(path);
		return file ? [file] : [];
	});
	const recentPathSet = new Set(recent.map((file) => file.path));
	return [...recent, ...files.filter((file) => !recentPathSet.has(file.path))];
}

/** Returns only remembered files that are still available in the current file set. */
export function getRecentFiles<T extends { path: string }>(files: readonly T[], recentPaths: readonly string[]): T[] {
	const recentPathSet = new Set(normalizeRecentFilePaths(recentPaths));
	return orderRecentFiles(files, recentPaths).filter((file) => recentPathSet.has(file.path));
}
