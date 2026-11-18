import assert from "node:assert/strict";
import { copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import assets from "../tests/e2e/screenshot-assets.json" with { type: "json" };

/** Publishes only complete, validated capture sets to the documentation asset directory. */
export async function updateScreenshots(captures = resolve("e2e-results/screenshots"), destination = resolve("assets")) {
  const run = JSON.parse(await readFile(resolve(captures, "manifest.json"), "utf8"));
  assert.equal(run.complete, true, "Run npm run screenshots successfully before updating assets.");
  assert.deepEqual(run.assets, assets, "The captures must match the current screenshot manifest.");

  // Validate the entire set before touching tracked assets; a failed capture never publishes a partial set.
  for (const { filename } of assets) {
    const metadata = await sharp(resolve(captures, filename), { animated: true }).metadata();
    assert.equal(metadata.format, filename.endsWith(".png") ? "png" : "webp");
    assert.ok(metadata.width >= 200 && (metadata.pageHeight ?? metadata.height) >= 80, `${filename} is too small.`);
    if (filename === "comparsion-record1.webp") assert.ok(metadata.pages >= 4, "The walkthrough must remain animated.");
  }
  for (const { filename } of assets) {
    await copyFile(resolve(captures, filename), resolve(destination, filename));
  }
  console.log(`Updated ${assets.length} documentation assets from Obsidian ${run.obsidianVersion}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await updateScreenshots();
