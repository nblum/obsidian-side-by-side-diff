import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildKeyboardShortcutOverlay, renderKeyboardShortcuts } from "../scripts/render-keyboard-shortcuts.mjs";

test("the keyboard-shortcut illustration labels every documented shortcut", async () => {
  const overlay = await buildKeyboardShortcutOverlay();
  for (const text of ["Save", "Undo", "Accept", "Ignore", "Ctrl/Cmd", "Alt", "S", "Z", "↑", "↓", "→", "←"]) {
    assert.match(overlay, new RegExp(`>${text}</text>`), `missing ${text}`);
  }
});

test("the keyboard-shortcut illustration is derived from a capture of the expected size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sbs-keyboard-shortcuts-"));
  try {
    const source = join(dir, "active-change.webp");
    const destination = join(dir, "keyboard-shortcuts.webp");
    await sharp({ create: { width: 936, height: 722, channels: 3, background: "white" } }).webp().toFile(source);
    await renderKeyboardShortcuts(source, destination);
    const metadata = await sharp(destination).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 936);
    assert.equal(metadata.height, 722);
    const { channels } = await sharp(destination).stats();
    assert.ok(channels[0]!.min < 100, "the overlay must draw callouts onto the capture");

    const wrongSize = join(dir, "small.webp");
    await sharp({ create: { width: 400, height: 300, channels: 3, background: "white" } }).webp().toFile(wrongSize);
    await assert.rejects(renderKeyboardShortcuts(wrongSize, join(dir, "out.webp")), /callout coordinates/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
