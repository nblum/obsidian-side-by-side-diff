/** Returns whether an editor input can require pane structure synchronization. */
export function hasEditableLineStructureChanged(
	inputType: string,
	previousLineCount: number | null,
	currentLineCount: number,
): boolean {
	if (previousLineCount !== null) {
		return previousLineCount !== currentLineCount;
	}
	return inputType !== "insertText" && inputType !== "insertCompositionText";
}
