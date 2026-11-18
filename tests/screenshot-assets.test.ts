import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import assets from "./e2e/screenshot-assets.json" with { type: "json" };
import { updateScreenshots } from "../scripts/update-screenshots.mjs";

test("a missing completion marker or incomplete capture set never overwrites documentation assets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-screenshot-assets-"));
  try {
    const captures = join(dir, "captures");
    const destination = join(dir, "assets");
    await mkdir(captures);
    await mkdir(destination);
    const filename = assets[0]!.filename;
    await writeFile(join(destination, filename), "existing documentation image");
    await assert.rejects(updateScreenshots(captures, destination), /ENOENT/);
    assert.equal(await readFile(join(destination, filename), "utf8"), "existing documentation image");

    await writeFile(join(captures, "manifest.json"), JSON.stringify({ complete: false, assets }));
    await assert.rejects(updateScreenshots(captures, destination), /successfully/);

    await writeFile(join(captures, "manifest.json"), JSON.stringify({ complete: true, assets }));
    await sharp({ create: { width: 400, height: 100, channels: 3, background: "white" } })
      .webp().toFile(join(captures, filename));
    await assert.rejects(updateScreenshots(captures, destination), /missing|not exist|ENOENT/i);
    assert.equal(await readFile(join(destination, filename), "utf8"), "existing documentation image");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
