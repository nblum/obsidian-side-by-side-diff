import type { DiffDirection } from "./diff-core.ts";

/** Identifies the user-facing workflow represented by a comparison view. */
export type PaneMode = "compare" | "proposal" | "accept";

/** Contains the serializable paths and mode needed to restore a comparison. */
export interface DiffViewState {
	leftPath: string | null;
	rightPath: string | null;
	/** Legacy workspace key for editing the selected target, on either screen side. */
	editRight: boolean;
	mode: PaneMode;
	direction?: DiffDirection;
	originalSide?: "left" | "right";
}

/** Converts unknown workspace state into a safe comparison state. */
export function parseDiffViewState(state: unknown, defaultDirection: DiffDirection = "left-to-right"): DiffViewState {
	const storedState = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
	const mode = storedState.mode;
	return {
		leftPath: typeof storedState.leftPath === "string" ? storedState.leftPath : null,
		rightPath: typeof storedState.rightPath === "string" ? storedState.rightPath : null,
		editRight: storedState.editRight === true,
		mode: mode === "proposal" || mode === "accept" ? mode : "compare",
		direction: mode === "proposal" || mode === "accept" ? "left-to-right"
			: storedState.direction === "left-to-right" || storedState.direction === "right-to-left" ? storedState.direction : defaultDirection,
		originalSide: storedState.originalSide === "right" ? "right" : "left"
	};
}

/** Exchanges comparison sides and workflow direction while leaving edit mode disabled. */
export function swapDiffViewState(state: DiffViewState): DiffViewState {
	const mode = state.mode === "accept" ? "proposal" : state.mode === "proposal" ? "accept" : "compare";
	return {
		leftPath: state.rightPath,
		rightPath: state.leftPath,
		editRight: false,
		mode,
		direction: mode === "compare" && state.direction === "right-to-left" ? "right-to-left" : "left-to-right",
		originalSide: state.originalSide === "right" ? "left" : "right"
	};
}
