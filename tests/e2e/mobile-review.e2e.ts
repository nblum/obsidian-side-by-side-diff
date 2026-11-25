import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browser, $, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const view = ".workspace-leaf.mod-active .file-diff-sbs-view";
const save = `${view} .file-diff-sbs-save-action`;
const accept = `${view} [data-diff-change='true'] button[aria-keyshortcuts='Alt+ArrowRight']`;
const ignore = `${view} [data-diff-change='true'] button[aria-keyshortcuts='Alt+ArrowLeft']`;
const undo = `${view} button[aria-keyshortcuts='Ctrl+Z']`;
const progress = `${view} .file-diff-sbs-review-navigation [role='status']`;

/** Dispatches a touch pointer tap through WebDriver in the desktop app. */
async function tap(selector: string): Promise<void> {
  const button = await $(selector).getElement();
  await button.waitForClickable();
  await browser.action("pointer", { parameters: { pointerType: "touch" } })
    .move({ origin: button }).down().up().perform();
}

/** Uses Obsidian's actual file suggestion UI. */
async function chooseFile(name: string): Promise<void> {
  await $(".prompt-input").setValue(name);
  await expect($(".suggestion-item")).toHaveText(expect.stringContaining(name));
  await tap(".suggestion-item");
  await expect($(".prompt-input")).not.toExist();
}

/** Reads the file from the isolated vault on disk. */
function saved(name: string): Promise<string> {
  return readFile(join(obsidianPage.getVaultPath(), name), "utf8");
}

describe("mobile-style touch review in desktop Obsidian", () => {
  for (const reverse of [false, true]) {
    it(`opens vault files, reviews by touch and saves the target (${reverse ? "right to left" : "left to right"})`, async () => {
      await browser.reloadObsidian({ vault: "tests/e2e/vault" });
      await writeFile(join(obsidianPage.getVaultPath(), ".obsidian/plugins/side-by-side-diff/data.json"), JSON.stringify({
        language: "en", introductionSeen: true, defaultLayout: "auto", defaultApplyDirection: "left-to-right",
        autoAdvanceAfterChange: false
      }));
      await obsidianPage.enablePlugin("side-by-side-diff");
      await browser.execute(() => { document.body.classList.add("is-mobile"); });

      const source = reverse ? "Comparison.md" : "Original.md";
      const target = reverse ? "Original.md" : "Comparison.md";
      const sourceBefore = await saved(source);
      const targetBefore = await saved(target);
      assert.notEqual(sourceBefore, targetBefore);

      await browser.executeObsidianCommand("side-by-side-diff:compare-two-files");
      await chooseFile("Original.md");
      await $(view).waitForExist();
      await browser.execute((selector) => {
        const container = document.querySelector<HTMLElement>(selector);
        if (!container) throw new Error("Comparison view missing");
        container.style.width = "390px";
      }, view);
      await expect($(`${view} .file-diff-sbs-root`)).toHaveAttribute("data-layout", "single-column");
      await tap(`${view} .file-diff-sbs-picker-card button`);
      await chooseFile("Comparison.md");
      if (reverse) await tap(`${view} .file-diff-sbs-comparison-header .file-diff-sbs-direction-button`);

      await expect($(progress)).toHaveText("Open: 1 · Accepted: 0 · Ignored: 0");
      await tap(ignore);
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 0 · Ignored: 1");
      await expect($(save)).toBeDisabled();
      await tap(undo);
      await expect($(progress)).toHaveText("Open: 1 · Accepted: 0 · Ignored: 0");
      await tap(accept);
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 0");
      await expect($(save)).toBeEnabled();
      assert.equal(await saved(target), targetBefore, "accept must stage the change until Save is tapped");

      await tap(save);
      await browser.waitUntil(async () => (await saved(target)) === sourceBefore, {
        timeoutMsg: `Saving should copy the accepted text into ${target}`
      });
      assert.equal(await saved(source), sourceBefore);
    });
  }
});
