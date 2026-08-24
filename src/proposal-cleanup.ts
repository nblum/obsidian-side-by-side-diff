export type ProposalViewMode = "compare" | "proposal" | "accept";

/** Returns whether a processed proposal copy should trigger a cleanup prompt. */
export function shouldOfferProposalCleanup(
	mode: ProposalViewMode,
	hasAcceptedChanges: boolean,
	dismissedChangeCount: number,
	hasPendingChanges: boolean,
): boolean {
	return mode === "accept" && hasAcceptedChanges && dismissedChangeCount === 0 && !hasPendingChanges;
}
