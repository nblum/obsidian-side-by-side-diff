import type { App, CliData, CliFlags, CliHandler } from "obsidian";
import type { DiffViewState, OriginalSide } from "./diff-view-state.ts";

export type AgentAction = "compare" | "review";

export const AGENT_CLI_COMMANDS = {
	compare: "side-by-side-diff:compare",
	review: "side-by-side-diff:review",
	status: "side-by-side-diff:status"
} as const;

const ARGUMENTS = {
	compare: ["left", "right"],
	review: ["proposal", "original"]
} as const;

type AgentPathArgument = (typeof ARGUMENTS)[AgentAction][number];

export type AgentCliError =
	| { ok: false; error: "missing_path" | "invalid_path" | "file_not_found" | "not_a_text_file"; argument: AgentPathArgument }
	| { ok: false; error: "invalid_side"; argument: "side" }
	| { ok: false; error: "same_file" | "view_open_failed" };

/** Lists the named paths in Obsidian's CLI help. The handler reports missing paths as JSON. */
export function getAgentCliFlags(action: AgentAction, describe: (argument: AgentPathArgument | "side") => string): CliFlags {
	const flags: CliFlags = {};
	for (const argument of ARGUMENTS[action]) {
		flags[argument] = { value: "<path>", description: describe(argument) };
	}
	if (action === "review") flags.side = { value: "<original-left|original-right>", description: describe("side") };
	return flags;
}

/** Reads exact vault-relative paths and orders them for the requested pane layout. */
export function parseAgentCliPaths(action: AgentAction, params: CliData):
	AgentCliError | { ok: true; left: string; right: string; originalSide: OriginalSide; arguments: readonly [AgentPathArgument, AgentPathArgument] } {
	const [leftArg, rightArg] = ARGUMENTS[action];
	const left = params[leftArg];
	const right = params[rightArg];
	if (left === undefined || left === "") return { ok: false, error: "missing_path", argument: leftArg };
	if (right === undefined || right === "") return { ok: false, error: "missing_path", argument: rightArg };
	for (const [argument, path] of [[leftArg, left], [rightArg, right]] as const) {
		if (!isVaultRelativePath(path)) return { ok: false, error: "invalid_path", argument };
	}
	if (left === right) return { ok: false, error: "same_file" };
	if (action === "compare") return { ok: true, left, right, originalSide: "left", arguments: ARGUMENTS.compare };
	const side = params.side;
	if (side === "original-left") return { ok: true, left: right, right: left, originalSide: "left", arguments: [rightArg, leftArg] };
	if (side !== undefined && side !== "original-right") return { ok: false, error: "invalid_side", argument: "side" };
	return { ok: true, left, right, originalSide: "right", arguments: ARGUMENTS.review };
}

/** Matches the original and proposal by role so swapped review tabs can be found. */
export function matchesAgentReview(state: DiffViewState, original: string, proposal: string): boolean {
	if (state.mode !== "review" && state.mode !== "accept" && !(state.mode === "proposal" && state.swappedAcceptance)) return false;
	return state.originalSide === "left"
		? state.leftPath === original && state.rightPath === proposal
		: state.rightPath === original && state.leftPath === proposal;
}

/** Updates help for an owned registration when Obsidian exposes its CLI registry. */
export function updateAgentCliHelp(app: App, command: string, handler: CliHandler, description: string, flags: CliFlags | null): void {
	const { cli } = app as App & {
		cli?: { handlers?: Map<string, { handler: CliHandler; description: string; flags?: CliFlags }> };
	};
	// The public registration API rejects duplicates and has no way to update descriptions.
	const entry = cli?.handlers instanceof Map ? cli.handlers.get(command) : undefined;
	if (entry?.handler === handler && !Object.isFrozen(entry)) {
		entry.description = description;
		if (flags) entry.flags = flags;
	}
}

/** Excludes absolute paths and aliases without changing spaces, percent signs, or Unicode. */
function isVaultRelativePath(path: string): boolean {
	return !/^[a-z]:|\\/iu.test(path)
		&& !Array.from(path).some(character => character.charCodeAt(0) < 32)
		&& path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
