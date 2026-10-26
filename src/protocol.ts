/** A validated request to compare two paths in the current vault. */
export interface ComparisonProtocolRequest {
	left: string;
	right: string;
}

export type ComparisonProtocolResult =
	| { ok: true; left: string; right: string }
	| { ok: false; error: "missingPaths" | "sameFile" | "wrongVault" };

/** Validates decoded query parameters supplied by Obsidian's protocol handler. */
export function validateComparisonProtocolRequest(
	params: Record<string, string>,
	currentVault: string,
): ComparisonProtocolResult {
	const left = params.left;
	const right = params.right;
	if (typeof left !== "string" || !left || typeof right !== "string" || !right) {
		return { ok: false, error: "missingPaths" };
	}
	if (left === right) {
		return { ok: false, error: "sameFile" };
	}
	const requestedVault = params.vault;
	if (typeof requestedVault === "string" && requestedVault !== currentVault) {
		return { ok: false, error: "wrongVault" };
	}
	return { ok: true, left, right };
}
