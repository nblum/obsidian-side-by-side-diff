import assert from "node:assert/strict";
import { test } from "node:test";
import type { App } from "obsidian";
import { getAgentCliFlags, matchesAgentReview, parseAgentCliPaths } from "../src/agent-cli.ts";
import { parseDiffViewState, swapDiffViewState } from "../src/diff-view-state.ts";
import { buildAgentInstructions, planAgentInstructions } from "../src/agent-instructions.ts";
import { getOpenGeneralSettings, readAgentCliStatus } from "../src/agent-setup-capabilities.ts";

test("CLI status uses a read-only probe and distinguishes disabled, unknown and unsupported", () => {
	const statusFrom = (value: unknown) => readAgentCliStatus(true, {
		electron: { ipcRenderer: { sendSync(channel: string, payload: unknown) {
			assert.equal(channel, "cli");
			assert.equal(payload, null);
			return value;
		} } }
	});
	assert.equal(statusFrom(true), "enabled");
	assert.equal(statusFrom(false), "disabled");
	assert.equal(statusFrom(undefined), "unknown");
	assert.equal(statusFrom("true"), "unknown");
	assert.equal(readAgentCliStatus(true, {}), "unknown");
	const broken = { electron: { ipcRenderer: { sendSync() { throw new Error("unavailable"); } } } };
	assert.equal(readAgentCliStatus(true, broken), "unknown");
	assert.equal(readAgentCliStatus(false, broken), "unavailable");
});

test("General settings shortcut uses the app's navigation and can fail gracefully", () => {
	const calls: string[] = [];
	const setting = {
		open() { calls.push("open"); },
		openTabById(id: string) {
			assert.equal(this, setting);
			calls.push(id);
			return { id };
		}
	};
	assert.equal(getOpenGeneralSettings({ setting } as unknown as App)?.(), true);
	assert.deepEqual(calls, ["open", "about"]);
	assert.equal(getOpenGeneralSettings({ setting: { ...setting, openTabById: () => {} } } as unknown as App)?.(), true);
	assert.equal(getOpenGeneralSettings({} as App), null);
	assert.equal(getOpenGeneralSettings({ setting: { ...setting, openTabById: () => null } } as unknown as App)?.(), false);
});

test("CLI accepts exact text paths and places reviewed proposals on the left", () => {
	const proposal = "Folder/Plán– changes 100%.md";
	const original = "Folder/Plan.md";
	assert.deepEqual(parseAgentCliPaths("review", { original, proposal }), {
		ok: true, left: proposal, right: original, originalSide: "right", arguments: ["proposal", "original"]
	});
	assert.deepEqual(parseAgentCliPaths("review", { original, proposal, side: "original-right" }),
		parseAgentCliPaths("review", { original, proposal }));
	assert.deepEqual(parseAgentCliPaths("review", { original, proposal, side: "original-left" }), {
		ok: true, left: original, right: proposal, originalSide: "left", arguments: ["original", "proposal"]
	});
	assert.deepEqual(parseAgentCliPaths("compare", { left: original, right: proposal }), {
		ok: true, left: original, right: proposal, originalSide: "left", arguments: ["left", "right"]
	});
	assert.equal(getAgentCliFlags("review", argument => argument).side?.value, "<original-left|original-right>");
	assert.equal(getAgentCliFlags("compare", argument => argument).side, undefined);
});

test("CLI rejects missing, ambiguous and out-of-vault paths", () => {
	for (const side of ["", "left", "true", "original-top"]) {
		assert.deepEqual(parseAgentCliPaths("review", { original: "Plan.md", proposal: "Draft.md", side }),
			{ ok: false, error: "invalid_side", argument: "side" });
	}
	assert.deepEqual(parseAgentCliPaths("review", { proposal: "Draft.md" }), { ok: false, error: "missing_path", argument: "original" });
	assert.deepEqual(parseAgentCliPaths("compare", { left: "Draft.md", right: "Draft.md" }), { ok: false, error: "same_file" });
	for (const path of ["/tmp/Draft.md", "../Plan.md", "Folder/../Plan.md", "./Plan.md", "Folder//Plan.md", "C:/Temp/Draft.md", "C:\\Temp\\Draft.md", "Plan\n.md"]) {
		assert.deepEqual(parseAgentCliPaths("review", { original: "Plan.md", proposal: path }), {
			ok: false, error: "invalid_path", argument: "proposal"
		});
	}
});

test("CLI reuse compares original and proposal roles and excludes ordinary comparisons and drafting tabs", () => {
	const original = "Plan.md";
	const proposal = "Draft.md";
	for (const state of [
		{ leftPath: original, rightPath: proposal, mode: "review", originalSide: "left" },
		{ leftPath: proposal, rightPath: original, mode: "review", originalSide: "right" },
		{ leftPath: proposal, rightPath: original, mode: "accept", originalSide: "left" }
	]) {
		assert.equal(matchesAgentReview(parseDiffViewState(state), original, proposal), true);
		assert.equal(matchesAgentReview(parseDiffViewState(state), proposal, original), false);
	}
	for (const mode of ["compare", "proposal"]) {
		assert.equal(matchesAgentReview(parseDiffViewState({ leftPath: original, rightPath: proposal, mode }), original, proposal), false);
	}
	const swapped = swapDiffViewState(parseDiffViewState({ leftPath: proposal, rightPath: original, mode: "accept" }));
	assert.equal(matchesAgentReview(parseDiffViewState(swapped), original, proposal), true);
});

test("instructions contain literal safely encoded arguments for the configured vault and suffix", () => {
	const section = buildAgentInstructions("Research & `notes`\n2", "_review_");
	const example = section.match(/```json\n([\s\S]+?)\n```/u)?.[1];
	assert.ok(example);
	assert.match(section, /side-by-side-diff:status/u);
	assert.deepEqual(JSON.parse(example), [
		"obsidian", "vault=Research & `notes`\n2", "side-by-side-diff:review",
		"original=Notes/Plan.md", "proposal=Notes/Plan_review_20261120-143000.md"
	]);
});

test("create, append and update preserve the rest of the file, including BOM and CRLF", () => {
	const section = buildAgentInstructions("Research", "_review_");
	const fresh = planAgentInstructions(null, section);
	assert.deepEqual(fresh, { kind: "create", content: section + "\n", section });

	const existing = "\uFEFF# Rules\r\n\r\nUse this style.  \r\n";
	const append = planAgentInstructions(existing, section);
	assert.equal(append.kind, "add");
	if (append.kind !== "add") return;
	assert.equal(append.content, existing + "\r\n" + section.replaceAll("\n", "\r\n") + "\r\n");

	const trailing = "\r\n## More rules\r\nKeep this too.";
	const modified = buildAgentInstructions("Research", "_updates_");
	const update = planAgentInstructions(append.content + trailing, modified);
	assert.equal(update.kind, "update");
	if (update.kind !== "update") return;
	assert.equal(update.content, existing + "\r\n" + modified.replaceAll("\n", "\r\n") + "\r\n" + trailing);
	assert.equal(planAgentInstructions(update.content, modified).kind, "unchanged");
});

test("an incomplete, reversed or duplicated managed section is left for the user to resolve", () => {
	const section = buildAgentInstructions("Research", "_review_");
	const lines = section.split("\n");
	const start = lines[0];
	const end = lines.at(-1);
	for (const content of [start, end, `${end}\n${start}`, `${section}\n${section}`, `${section}\n${start}`]) {
		assert.ok(content);
		assert.deepEqual(planAgentInstructions(content, section), { kind: "invalid" });
	}
});

test("markers with trailing whitespace still delimit the same managed section", () => {
	const section = buildAgentInstructions("Research", "_review_").replaceAll("\n", "\r\n");
	const existing = "\uFEFF" + section.replace(/ -->/gu, " -->  \t") + "\r\n\r\n## Keep this\r\n";
	const updated = buildAgentInstructions("Research", "_updates_");
	assert.deepEqual(planAgentInstructions(existing, updated), {
		kind: "update",
		section: updated.replaceAll("\n", "\r\n"),
		content: "\uFEFF" + updated.replaceAll("\n", "\r\n") + "\r\n\r\n## Keep this\r\n"
	});
});
