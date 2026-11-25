import { AGENT_CLI_COMMANDS } from "./agent-cli.ts";
import { sanitizeCopySuffix } from "./settings-model.ts";

export const AGENT_INSTRUCTION_PATHS = ["AGENTS.md", "CLAUDE.md"] as const;
export type AgentInstructionPath = (typeof AGENT_INSTRUCTION_PATHS)[number];

const START = "<!-- side-by-side-diff:agent-instructions:start -->";
const END = "<!-- side-by-side-diff:agent-instructions:end -->";

export type AgentInstructionsEdit =
	| { kind: "create" | "add" | "update" | "unchanged"; content: string; section: string }
	| { kind: "invalid" };

/** Builds the managed Markdown section and a shell-independent argument example. */
export function buildAgentInstructions(vaultName: string, configuredSuffix: string): string {
	const suffix = sanitizeCopySuffix(configuredSuffix);
	const example = [
		"obsidian", `vault=${vaultName}`, AGENT_CLI_COMMANDS.review,
		"original=Notes/Plan.md", `proposal=Notes/Plan${suffix}20261120-143000.md`
	];
	return [
		START,
		"## Review proposed edits in Obsidian",
		"",
		"1. Before a review handoff, check the official Obsidian CLI with the same vault argument as below, followed by `help side-by-side-diff:review`. Confirm that it shows help for the review command. If it fails, report the exit code and error output. On Linux, the registered CLI is usually at `~/.local/bin/obsidian`.",
		"2. Read the original note. For edits the user should review, keep the original unchanged and write the complete revised note to a new file beside it. Use the configured proposal suffix and a unique timestamp, as in the example.",
		"3. Use the arguments below to open the review. Replace both example paths with the actual vault-relative paths. Pass each array entry as one argument, or quote the values for your shell.",
		"",
		"```json",
		JSON.stringify(example, null, 2),
		"```",
		"",
		'4. A response with `"ok": true` confirms that the review is open. Pass `side=original-left` if the user wants the original on the left in a new review. The same pair reuses its existing tab and pane order.',
		`5. Leave accepting and saving changes to the user. To check open reviews and pending changes, use the same vault argument followed by \`${AGENT_CLI_COMMANDS.status}\`. If the CLI cannot open the review, report the error and give the user the proposal path.`,
		END
	].join("\n");
}

/** Prepares a write while preserving all text outside the managed section. */
export function planAgentInstructions(existing: string | null, instructions: string): AgentInstructionsEdit {
	const lineEnding = existing?.match(/\r\n|\n|\r/u)?.[0] ?? "\n";
	const section = instructions.replaceAll("\n", lineEnding);
	if (existing === null) return { kind: "create", content: section + lineEnding, section };

	let start: number | undefined;
	let end: number | undefined;
	for (const line of existing.matchAll(/[^\r\n]+/gu)) {
		const hasBom = line.index === 0 && line[0].startsWith("\uFEFF");
		const marker = line[0].trim();
		if (marker === START) {
			if (start !== undefined || end !== undefined) return { kind: "invalid" };
			start = line.index + (hasBom ? 1 : 0);
		} else if (marker === END) {
			if (start === undefined || end !== undefined) return { kind: "invalid" };
			end = line.index + line[0].length;
		}
	}
	if (start !== undefined && end !== undefined) {
		const content = existing.slice(0, start) + section + existing.slice(end);
		return { kind: content === existing ? "unchanged" : "update", content, section };
	}
	if (start !== undefined) return { kind: "invalid" };

	const withoutBom = existing.replace(/^\uFEFF/u, "");
	const separator = !withoutBom || existing.endsWith(lineEnding.repeat(2)) ? ""
		: /[\r\n]$/u.test(withoutBom) ? lineEnding : lineEnding.repeat(2);
	return { kind: "add", content: existing + separator + section + lineEnding, section };
}
