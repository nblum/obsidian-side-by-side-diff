import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import esbuild from "esbuild";
import type { SideBySideDiffView } from "../src/diff-view.ts";
import { PLUGIN_BUNDLE_OPTIONS } from "../scripts/bundle-options.mjs";

/** Supplies element identity and ancestry for pointer event tests without a browser. */
class SelectionElement {
  dataset: Record<string, string> = {};
  ancestors = new Map<string, SelectionElement>();
  closest(selector: string): SelectionElement | null { return this.ancestors.get(selector) ?? null; }
}

const bundle = await esbuild.build({ ...PLUGIN_BUNDLE_OPTIONS, entryPoints: ["src/diff-view.ts"], write: false, logLevel: "silent" });
assert.ok(bundle.outputFiles?.[0]);
const module = { exports: {} as { SideBySideDiffView: typeof SideBySideDiffView } };
runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports, Element: SelectionElement,
  require: () => ({ ItemView: class {}, Modal: class {}, SuggestModal: class {} })
});

/** Tracks pane activation and stale-selection removal when a new pointer selection starts. */
function createSelectionFixture() {
  const grid = new SelectionElement();
  const target = new SelectionElement();
  const code = new SelectionElement();
  code.dataset.diffSide = "left";
  target.ancestors.set(".file-diff-sbs-code[data-diff-side]", code);
  code.ancestors.set(".file-diff-sbs-grid", grid);
  const state = { editRight: false };
  let cleared = 0;
  const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
  Object.assign(view, {
    viewState: state,
    contentEl: {
      contains: (element: unknown) => element === grid,
      ownerDocument: { getSelection: () => ({ removeAllRanges: () => { cleared += 1; } }) }
    }
  });
  const event = { button: 0, target };
  return { view, state, grid, code, target, event: event as unknown as PointerEvent, cleared: () => cleared };
}

test("pointer selection activates only the starting pane and retains it for the visible selection", () => {
  for (const side of ["left", "right"]) {
    const fixture = createSelectionFixture();
    fixture.code.dataset.diffSide = side;
    fixture.view.handleSelectionStart(fixture.event);
    assert.equal(fixture.grid.dataset.diffSelectionSide, side);
    assert.equal(fixture.cleared(), 1);
    fixture.view.handleSelectionStart(fixture.event);
    assert.equal(fixture.cleared(), 1, "another click on the same side preserves native selection extension");
  }
});

test("starting a selection in the other pane clears the previous pane selection", () => {
  const fixture = createSelectionFixture();
  fixture.view.handleSelectionStart(fixture.event);
  fixture.code.dataset.diffSide = "right";
  fixture.view.handleSelectionStart(fixture.event);
  assert.equal(fixture.grid.dataset.diffSelectionSide, "right");
  assert.equal(fixture.cleared(), 2);
});

test("editors, controls, non-primary clicks and unrelated grids do not change the selectable pane", () => {
  for (const kind of ["editing", "control", "secondary", "outside", "invalid-side"]) {
    const fixture = createSelectionFixture();
    if (kind === "editing") fixture.state.editRight = true;
    if (kind === "control") fixture.target.ancestors.clear();
    if (kind === "secondary") Object.assign(fixture.event, { button: 2 });
    if (kind === "outside") fixture.code.ancestors.set(".file-diff-sbs-grid", new SelectionElement());
    if (kind === "invalid-side") fixture.code.dataset.diffSide = "other";
    fixture.view.handleSelectionStart(fixture.event);
    assert.equal(fixture.grid.dataset.diffSelectionSide, undefined, kind);
    assert.equal(fixture.cleared(), 0, kind);
  }
});

/** Models only the text and selection APIs used by the real copy handler. */
function createCopyFixture(side: "left" | "right", values: (string | null)[], startOffset: number, endOffset: number) {
  const codes = values.map((value) => ({
    nodeType: 1,
    dataset: { diffSide: side, diffPresent: String(value !== null) },
    textContent: value ?? " ",
    closest() { return this; }
  }));
  const start = { nodeType: 3, parentElement: codes[0] };
  const end = { nodeType: 3, parentElement: codes.at(-1) };
  const range = {
    startContainer: start, endContainer: end, startOffset, endOffset,
    cloneRange: () => {
      let code = codes[0]!;
      let from = 0;
      let to = 0;
      return {
        selectNodeContents(value: typeof code) { code = value; from = 0; to = code.textContent.length; },
        setStart(_node: unknown, offset: number) { from = offset; },
        setEnd(_node: unknown, offset: number) { to = offset; },
        toString: () => code.textContent.slice(from, to)
      };
    }
  };
  const selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range };
  const clipboard = new Map<string, string>();
  let prevented = false;
  let stopped = false;
  const event = {
    clipboardData: { setData: (format: string, value: string) => { clipboard.set(format, value); } },
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  };
  const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
  const state = { editRight: false };
  Object.assign(view, {
    viewState: state,
    contentEl: {
      ownerDocument: { getSelection: () => selection },
      contains: (element: unknown) => codes.includes(element as typeof codes[number]),
      querySelectorAll: (selector: string) => {
        assert.equal(selector, `.file-diff-sbs-code[data-diff-side='${side}']`);
        return codes;
      }
    }
  });
  return { view, event: event as unknown as ClipboardEvent, state, selection, range, codes, clipboard, prevented: () => prevented, stopped: () => stopped };
}

test("copying either comparison side preserves partial lines, whitespace and real blank lines while skipping gaps", () => {
  for (const side of ["left", "right"] as const) {
    const fixture = createCopyFixture(side, ["first line", null, "", "\t spaced  ", "last line"], 6, 4);
    fixture.view.handleCopy(fixture.event);
    assert.equal(fixture.clipboard.get("text/plain"), "line\n\n\t spaced  \nlast");
    assert.equal(fixture.clipboard.size, 1);
    assert.equal(fixture.prevented(), true);
    assert.equal(fixture.stopped(), true);
  }
});



test("copying a partial single line uses both selection boundaries", () => {
  const fixture = createCopyFixture("right", ["before changed after"], 7, 14);
  fixture.view.handleCopy(fixture.event);
  assert.equal(fixture.clipboard.get("text/plain"), "changed");
});

test("comparison copying leaves editing, collapsed, cross-side and unrelated selections to the browser", () => {
  for (const kind of ["editing", "collapsed", "cross-side", "outside", "no-clipboard", "no-range"] as const) {
    const fixture = createCopyFixture("left", ["left", "last"], 0, 4);
    if (kind === "editing") fixture.state.editRight = true;
    if (kind === "collapsed") fixture.selection.isCollapsed = true;
    if (kind === "cross-side") fixture.codes.at(-1)!.dataset.diffSide = "right";
    if (kind === "outside") fixture.range.endContainer.parentElement = undefined;
    if (kind === "no-clipboard") Object.assign(fixture.event, { clipboardData: null });
    if (kind === "no-range") fixture.selection.rangeCount = 0;
    fixture.view.handleCopy(fixture.event);
    assert.equal(fixture.clipboard.size, 0, kind);
    assert.equal(fixture.prevented(), false, kind);
    assert.equal(fixture.stopped(), false, kind);
  }
});

test("selections containing only alignment gaps do not replace the clipboard", () => {
  const fixture = createCopyFixture("left", [null], 0, 1);
  fixture.view.handleCopy(fixture.event);
  assert.equal(fixture.clipboard.size, 0);
  assert.equal(fixture.prevented(), false);
});



test("rendered comparison cells distinguish real empty lines from alignment gaps for copying", () => {
  for (const side of ["left", "right"] as const) {
    for (const value of ["text", "", null]) {
      const code = { dataset: {} as Record<string, string>, textContent: "" };
      const lineNumber = { textContent: "" };
      const cell = { dataset: {} as Record<string, string>, createSpan: ({ cls }: { cls: string }) => cls === "file-diff-sbs-code" ? code : lineNumber };
      const parent = { createDiv: () => cell };
      const view = Object.create(module.exports.SideBySideDiffView.prototype) as SideBySideDiffView;
      view.buildCell(parent as unknown as HTMLElement, value, null, value === null ? null : 1, side, "equal");
      assert.equal(code.dataset.diffSide, side);
      assert.equal(code.dataset.diffPresent, String(value !== null));
      assert.equal(lineNumber.textContent, value === null ? "" : "1");
      assert.equal(cell.dataset.diffOperation, "none");
    }
  }
});
