import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizePluginSettings } from "../src/settings-model.ts";

test("normalizes incomplete persisted settings using safe defaults", () => {
	assert.deepEqual(normalizePluginSettings(null), DEFAULT_SETTINGS);
	assert.deepEqual(normalizePluginSettings({
		showRibbonIcon: false,
		language: "fr",
		changeCopySuffix: "draft/",
		recentRightFilePaths: ["first.md", "first.md", 42, "second.md"]
	}), {
		showRibbonIcon: false,
		autoAdvanceAfterChange: true,
		alignMarkdownByHeadings: false,
		changeCopySuffix: "draft_",
		language: "auto",
		recentRightFilePaths: ["first.md", "second.md"],
		introductionSeen: false
	});
});

test("normalizes an empty change-copy suffix to the configured default", () => {
	assert.equal(normalizePluginSettings({ changeCopySuffix: "" }).changeCopySuffix, DEFAULT_SETTINGS.changeCopySuffix);
});

test("preserves valid settings while sanitizing every path separator", () => {
	assert.deepEqual(normalizePluginSettings({
		showRibbonIcon: false,
		autoAdvanceAfterChange: false,
		changeCopySuffix: "a\\b/c:d*e?f\"g<h>i|",
		language: "de",
		recentRightFilePaths: ["one.md"]
	}), {
		showRibbonIcon: false,
		autoAdvanceAfterChange: false,
		changeCopySuffix: "a_b_c_d_e_f_g_h_i_",
		alignMarkdownByHeadings: false,
		language: "de",
		recentRightFilePaths: ["one.md"],
		introductionSeen: false
	});
});

test("preserves a persisted introduction status", () => {
	assert.equal(normalizePluginSettings({ introductionSeen: true }).introductionSeen, true);
	assert.equal(normalizePluginSettings({ introductionSeen: "true" }).introductionSeen, false);
});

test("heading alignment is opt-in and preserves unrelated persisted settings", () => {
	assert.equal(DEFAULT_SETTINGS.alignMarkdownByHeadings, false);
	assert.equal(normalizePluginSettings({}).alignMarkdownByHeadings, false);
	assert.equal(normalizePluginSettings({ alignMarkdownByHeadings: "true" }).alignMarkdownByHeadings, false);
	assert.equal(normalizePluginSettings({ alignMarkdownByHeadings: false }).alignMarkdownByHeadings, false);
	const stored = { ...DEFAULT_SETTINGS, showRibbonIcon: false, language: "en", recentRightFilePaths: ["synthetic.md"], alignMarkdownByHeadings: true };
	assert.deepEqual(normalizePluginSettings(stored), stored);
});
