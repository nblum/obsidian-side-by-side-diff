/** Returns whether the current vault content differs from the save snapshot. */
export function hasExternalFileChange(snapshot: string | undefined, currentContent: string): boolean {
	return snapshot === undefined || snapshot !== currentContent;
}

/** Marks a vault process as aborted because its save snapshot is stale. */
export class SaveConflictError extends Error {
	/** Creates an identifiable error for an external file modification. */
	constructor() {
		super("The file changed after the save snapshot was captured.");
		this.name = "SaveConflictError";
	}
}

/** Returns a process callback that validates the snapshot before transforming content. */
export function createGuardedSaveTransform(
	snapshot: string | undefined,
	transform: (currentContent: string) => string,
): (currentContent: string) => string {
	return (currentContent) => {
		if (hasExternalFileChange(snapshot, currentContent)) {
			throw new SaveConflictError();
		}
		return transform(currentContent);
	};
}

/** Captures the first content snapshot for a file and keeps it stable across rerenders. */
export function captureSaveBaseline(baselines: Map<string, string>, path: string, content: string): void {
	if (!baselines.has(path)) {
		baselines.set(path, content);
	}
}

/** Replaces a save baseline after the user has been notified about a conflict. */
export function refreshSaveBaseline(baselines: Map<string, string>, path: string, content: string): void {
	baselines.set(path, content);
}

/** Moves one path-keyed save entry after Obsidian reports a file rename. */
export function migrateSaveEntry<T>(entries: Map<string, T>, oldPath: string, newPath: string): void {
	if (oldPath === newPath || !entries.has(oldPath)) {
		return;
	}
	const entry = entries.get(oldPath);
	entries.delete(oldPath);
	if (entry !== undefined) {
		entries.set(newPath, entry);
	}
}
