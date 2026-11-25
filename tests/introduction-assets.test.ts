import { test } from "node:test";
import assert from "node:assert/strict";
import esbuild from "esbuild";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

const INTRODUCTION_ASSET_NAMES = [
	"compare-two-files-menu.png",
	"file-menu.webp",
	"file-selection.png",
	"grouped-changes.png",
	"keyboard-shortcuts.webp",
	"teaser.png"
] as const;

test("embeds all introduction images in the plugin bundle", async () => {
	const buildResult = await esbuild.build({
		...PLUGIN_BUNDLE_OPTIONS,
		outfile: "main.js",
		write: false,
		logLevel: "silent"
	});
	const outputFile = buildResult.outputFiles?.[0];
	assert.ok(outputFile, "Expected esbuild to create the plugin bundle.");
	const bundle = outputFile.text;
	assert.doesNotMatch(bundle, /getResourcePath\(/);
	const embeddedImages = bundle.match(/data:image\/(?:png|webp);base64,/g) ?? [];
	// Help can reuse introduction assets and adds five README illustrations.
	assert.equal(embeddedImages.length, INTRODUCTION_ASSET_NAMES.length + 5);
});
