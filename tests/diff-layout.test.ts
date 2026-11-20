import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextDiffLayout, isDiffLayout, resolveDiffLayout, type DiffLayout } from "../src/diff-layout.ts";
import { parseDiffViewState, swapDiffViewState } from "../src/diff-view-state.ts";
import { normalizePluginSettings } from "../src/settings-model.ts";

// Widths include phones, split panes, tablets, and both sides of the breakpoint.
test("Auto layout follows the container while explicit choices survive any width", () => {
  for (const width of [360, 390, 600, 719, 720, 768, 1024]) {
    assert.equal(resolveDiffLayout("auto", width), width < 720 ? "single-column" : "side-by-side");
    assert.equal(resolveDiffLayout("side-by-side", width), "side-by-side");
    assert.equal(resolveDiffLayout("single-column", width), "single-column");
  }
  assert.equal(resolveDiffLayout("auto", 0), "side-by-side");
});

test("old or malformed layout state uses the configured default, explicit state survives swap", () => {
  for (const layout of ["auto", "side-by-side", "single-column"] as const) {
    assert.equal(isDiffLayout(layout), true);
    assert.equal(parseDiffViewState({}, "left-to-right", layout).layout, layout);
    assert.equal(normalizePluginSettings({ defaultLayout: layout }).defaultLayout, layout);
    const state = parseDiffViewState({ layout, mode: "proposal" }, "left-to-right", "auto");
    assert.equal(swapDiffViewState(state).layout, layout);
    assert.equal(swapDiffViewState(state).mode, "accept");
  }
  for (const invalid of [null, "unified", true, {}, 1]) {
    assert.equal(isDiffLayout(invalid), false);
    assert.equal(parseDiffViewState({ layout: invalid }, "left-to-right", "single-column").layout, "single-column");
    assert.equal(normalizePluginSettings({ defaultLayout: invalid }).defaultLayout, "auto");
  }
});


test("the layout control cycles explicit preferences independently of the resolved Auto layout", () => {
  let preference: DiffLayout = "auto";
  const seen: string[] = [];
  for (let step = 0; step < 6; step += 1) {
    seen.push(preference);
    preference = getNextDiffLayout(preference);
  }
  assert.deepEqual(seen, ["auto", "side-by-side", "single-column", "auto", "side-by-side", "single-column"]);
  assert.equal(preference, "auto");
});
