/** Identifies the user-facing workflow represented by a comparison view. */
export type PaneMode = "compare" | "proposal" | "accept";

/** Contains the serializable paths and mode needed to restore a comparison. */
export interface DiffViewState {
	leftPath: string | null;
	rightPath: string | null;
	editRight: boolean;
	mode: PaneMode;
}

/** Converts unknown workspace state into a safe comparison state. */
export function parseDiffViewState(state: unknown): DiffViewState {
	const storedState = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
	const mode = storedState.mode;
	return {
		leftPath: typeof storedState.leftPath === "string" ? storedState.leftPath : null,
		rightPath: typeof storedState.rightPath === "string" ? storedState.rightPath : null,
		editRight: storedState.editRight === true,
		mode: mode === "proposal" || mode === "accept" ? mode : "compare"
	};
}

/** Exchanges comparison sides and workflow direction while leaving edit mode disabled. */
export function swapDiffViewState(state: DiffViewState): DiffViewState {
	const mode = state.mode === "accept" ? "proposal" : state.mode === "proposal" ? "accept" : "compare";
	return {
		leftPath: state.rightPath,
		rightPath: state.leftPath,
		editRight: false,
		mode
	};
}
