import type { PaneMode } from "./diff-view-state.ts";

/** Returns whether a processed proposal copy should trigger a cleanup prompt. */
export function shouldOfferProposalCleanup(
	mode: PaneMode,
	hasAcceptedChanges: boolean,
	dismissedChangeCount: number,
	hasPendingChanges: boolean,
): boolean {
	return (mode === "accept" || mode === "review") && hasAcceptedChanges && dismissedChangeCount === 0 && !hasPendingChanges;
}
