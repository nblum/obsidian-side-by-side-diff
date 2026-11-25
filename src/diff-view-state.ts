import type { DiffDirection } from "./diff-core.ts";
import { isDiffLayout, type DiffLayout } from "./diff-layout.ts";

/** Identifies the user-facing workflow represented by a comparison view. */
export type PaneMode = "compare" | "proposal" | "accept" | "review";
export type OriginalSide = "left" | "right";

/** Contains the serializable paths and mode needed to restore a comparison. */
export interface DiffViewState {
	leftPath: string | null;
	rightPath: string | null;
	/** Legacy workspace key for editing the selected target, on either screen side. */
	editRight: boolean;
	mode: PaneMode;
	direction?: DiffDirection;
	originalSide?: OriginalSide;
	layout?: DiffLayout;
	/** A proposal pane order reached by swapping an acceptance tab. */
	swappedAcceptance?: true;
}

/** Recovers proposal identity from the legacy workflow, even if its stored side was incorrect. */
function resolveOriginalSide(mode: PaneMode, side: unknown): OriginalSide {
	if (mode === "accept") return "right";
	if (mode === "proposal") return "left";
	if (side === "left" || side === "right") return side;
	return mode === "review" ? "right" : "left";
}

/** Keeps built-in workflows left-to-right and directs CLI reviews toward the original. */
function resolveDirection(mode: PaneMode, originalSide: OriginalSide, compareDirection: DiffDirection): DiffDirection {
	if (mode === "compare") return compareDirection;
	return mode === "review" && originalSide === "left" ? "right-to-left" : "left-to-right";
}

/** Converts unknown workspace state into a safe comparison state. */
export function parseDiffViewState(state: unknown, defaultDirection: DiffDirection = "left-to-right", defaultLayout: DiffLayout = "auto"): DiffViewState {
	const storedState = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
	const storedMode = storedState.mode;
	const mode = storedMode === "proposal" || storedMode === "accept" || storedMode === "review" ? storedMode : "compare";
	const originalSide = resolveOriginalSide(mode, storedState.originalSide);
	const direction = storedState.direction;
	return {
		leftPath: typeof storedState.leftPath === "string" ? storedState.leftPath : null,
		rightPath: typeof storedState.rightPath === "string" ? storedState.rightPath : null,
		editRight: storedState.editRight === true,
		mode,
		direction: resolveDirection(mode, originalSide, direction === "left-to-right" || direction === "right-to-left" ? direction : defaultDirection),
		originalSide,
		layout: isDiffLayout(storedState.layout) ? storedState.layout : defaultLayout,
		...(mode === "proposal" && storedState.swappedAcceptance === true ? { swappedAcceptance: true } : {})
	};
}

/** Exchanges comparison sides and workflow direction while leaving edit mode disabled. */
export function swapDiffViewState(state: DiffViewState): DiffViewState {
	const mode = state.mode === "accept" ? "proposal" : state.mode === "proposal" ? "accept" : state.mode;
	const originalSide = resolveOriginalSide(state.mode, state.originalSide) === "right" ? "left" : "right";
	return {
		leftPath: state.rightPath,
		rightPath: state.leftPath,
		editRight: false,
		mode,
		direction: resolveDirection(mode, originalSide, state.direction ?? "left-to-right"),
		originalSide,
		layout: state.layout ?? "auto",
		...(state.mode === "accept" ? { swappedAcceptance: true } : {})
	};
}
