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
		changeCopySuffix: "draft_",
		language: "auto",
		recentRightFilePaths: ["first.md", "second.md"]
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
		language: "de",
		recentRightFilePaths: ["one.md"]
	});
});
