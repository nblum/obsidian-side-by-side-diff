export type ChangeNavigationDirection = "next" | "previous";
export type ChangeKeyboardAction = ChangeNavigationDirection | "accept" | "reject";

type ChangeTargetElement = Pick<HTMLElement, "dataset" | "classList" | "removeAttribute">;

interface ChangeRow {
	equal: boolean;
}

/** Maps an unmodified Alt-arrow shortcut to its comparison action. */
export function getChangeKeyboardAction(
	key: string,
	altKey: boolean,
	ctrlKey: boolean,
	metaKey: boolean,
	shiftKey: boolean,
): ChangeKeyboardAction | null {
	if (!altKey || ctrlKey || metaKey || shiftKey) {
		return null;
	}
	if (key === "ArrowDown") {
		return "next";
	}
	if (key === "ArrowUp") {
		return "previous";
	}
	if (key === "ArrowLeft") {
		return "reject";
	}
	if (key === "ArrowRight") {
		return "accept";
	}
	return null;
}

/** Returns whether a keyboard event matches the undo shortcut (Ctrl+Z or Cmd+Z, without Shift). */
export function isUndoShortcut(key: string, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean): boolean {
	return (ctrlKey || metaKey) && !shiftKey && key.toLowerCase() === "z";
}

/** Removes navigation metadata copied from an original editable line. */
export function clearChangeTargetMetadata(element: ChangeTargetElement): void {
	delete element.dataset.diffRowIndex;
	delete element.dataset.diffChange;
	element.removeAttribute("aria-current");
	element.classList.remove("file-diff-sbs-active-change");
}

/** Returns the aligned row indexes that contain visible changes. */
export function getChangeRowIndexes(rows: readonly ChangeRow[]): number[] {
	return rows.flatMap((row, index) => row.equal ? [] : [index]);
}

/** Selects the next or previous change, wrapping at the comparison boundary. */
export function getNextChangeIndex(
	changeIndexes: readonly number[],
	currentIndex: number | null,
	direction: ChangeNavigationDirection,
): number | null {
	if (changeIndexes.length === 0) {
		return null;
	}
	if (currentIndex === null) {
		return direction === "next" ? changeIndexes[0] ?? null : changeIndexes[changeIndexes.length - 1] ?? null;
	}

	const currentPosition = changeIndexes.indexOf(currentIndex);
	if (currentPosition >= 0) {
		const nextPosition = direction === "next"
			? (currentPosition + 1) % changeIndexes.length
			: (currentPosition - 1 + changeIndexes.length) % changeIndexes.length;
		return changeIndexes[nextPosition] ?? null;
	}

	// Keep navigation useful after the previously selected row was resolved or dismissed.
	if (direction === "next") {
		return changeIndexes.find((index) => index > currentIndex) ?? changeIndexes[0] ?? null;
	}
	for (let index = changeIndexes.length - 1; index >= 0; index -= 1) {
		const changeIndex = changeIndexes[index];
		if (changeIndex !== undefined && changeIndex < currentIndex) {
			return changeIndex;
		}
	}
	return changeIndexes[changeIndexes.length - 1] ?? null;
}

/** Returns the next target position after removing the resolved target from an ordered list. */
export function getAutoAdvanceTargetPosition(
	remainingTargetCount: number,
	resolvedPosition: number | null,
	autoAdvance: boolean,
): number | null {
	if (!autoAdvance || remainingTargetCount === 0 || resolvedPosition === null) {
		return null;
	}
	return resolvedPosition < remainingTargetCount ? resolvedPosition : 0;
}
