import type { PendingChange } from "./diff-session.ts";

/** Describes the result of saving one resolved file. */
export type FileSaveResult = "saved" | "conflict";

/** Describes the result of saving all currently staged files. */
export type PendingSaveResult = FileSaveResult | "unavailable";

/** Saves staged files in order while preserving unsaved entries after failures. */
export async function writePendingChanges<T>(
	changes: readonly PendingChange[],
	resolveFile: (path: string) => T | null,
	saveFile: (file: T, content: string) => Promise<FileSaveResult>,
	onSaved: (path: string) => void,
): Promise<PendingSaveResult> {
	const resolvedChanges: Array<{ change: PendingChange; file: T }> = [];
	for (const change of changes) {
		const file = resolveFile(change.path);
		if (file === null) {
			return "unavailable";
		}
		resolvedChanges.push({ change, file });
	}

	for (const { change, file } of resolvedChanges) {
		const result = await saveFile(file, change.content);
		if (result !== "saved") {
			return result;
		}
		onSaved(change.path);
	}
	return "saved";
}
