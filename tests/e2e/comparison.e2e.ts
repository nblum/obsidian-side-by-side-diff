import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browser, $, $$, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const view = ".workspace-leaf.mod-active .file-diff-sbs-view";
const save = `${view} .file-diff-sbs-save-action`;
const accept = `${view} [data-diff-change='true'] button[aria-keyshortcuts='Alt+ArrowRight']`;
const ignore = `${view} [data-diff-change='true'] button[aria-keyshortcuts='Alt+ArrowLeft']`;
const undo = `${view} button[aria-keyshortcuts='Ctrl+Z']`;
const progress = `${view} .file-diff-sbs-review-navigation .file-diff-sbs-summary[role="status"]`;
const feedback = `${view} .file-diff-sbs-review-feedback`;
const original = await readFile(new URL("./vault/Original.md", import.meta.url), "utf8");
const comparison = await readFile(new URL("./vault/Comparison.md", import.meta.url), "utf8");

/** Reads the saved bytes independently of the plugin's staged buffers and Obsidian's cache. */
function readSaved(path: string): Promise<string> {
  return readFile(join(obsidianPage.getVaultPath(), path), "utf8");
}

/** Waits for transient Obsidian notices to stop covering the toolbar before clicking. */
async function saveFromToolbar(): Promise<void> {
  await $(save).waitForClickable();
  await $(save).click();
}

/** Selects a real suggestion, exercising Obsidian's close-before-choice lifecycle. */
async function chooseFile(name: string): Promise<void> {
  await $(".prompt-input").setValue(name);
  const suggestion = $(".suggestion-item");
  await expect(suggestion).toHaveText(expect.stringContaining(name));
  await suggestion.click();
  await expect($(".prompt-input")).not.toExist();
}

/** Opens a comparison through the registered command and both visible file selectors. */
async function openComparison(): Promise<void> {
  await browser.executeObsidianCommand("side-by-side-diff:compare-two-files");
  await chooseFile("Original.md");
  await expect($(`${view} .file-diff-sbs-single-pane`)).toHaveText(expect.stringContaining("Original wording."));
  await $(`${view} .file-diff-sbs-picker-card button`).click();
  await chooseFile("Comparison.md");
  await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText("Original.md");
  await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText("Comparison.md");
  await expect($$(accept)).toBeElementsArrayOfSize(1);
}

describe("comparison in Obsidian", () => {
  beforeEach(async () => {
    // A fresh vault and app for every test, including after a failed test with pending edits.
    await browser.reloadObsidian({ vault: "tests/e2e/vault" });
    await writeFile(join(obsidianPage.getVaultPath(), ".obsidian/plugins/side-by-side-diff/data.json"), JSON.stringify({
      language: "en",
      introductionSeen: true,
      defaultApplyDirection: "left-to-right",
      autoAdvanceAfterChange: false,
    }));
    await obsidianPage.enablePlugin("side-by-side-diff");
    await openComparison();
  });

  it("opens through both pickers and renders inline changes without saving", async () => {
    await expect($(save)).toBeDisabled();
    await expect($(progress)).toHaveText("Open: 1 · Accepted: 0 · Ignored: 0");
    await expect($(`${view} .file-diff-sbs-comparison-toolbar .file-diff-sbs-summary`)).not.toExist();
    await expect($(progress)).toHaveAttribute("aria-label", "Review progress (changed lines)");
    await expect($(`${view} [data-review-status='open'] .file-diff-sbs-review-marker`)).not.toExist();
    await expect($(`${view} [data-review-status='open'] .file-diff-sbs-action-cell`)).toHaveAttribute("role", "group");
    await expect($(`${view} [data-review-status='open'] .file-diff-sbs-action-cell`)).toHaveAttribute("aria-label", "Open");
    await expect($(`${view} [data-diff-side='left'] .file-diff-sbs-inline-left`)).toHaveText("Original");
    await expect($(`${view} [data-diff-side='right'] .file-diff-sbs-inline-right`)).toHaveText("Comparison");
    assert.equal(await readSaved("Original.md"), original);
    assert.equal(await readSaved("Comparison.md"), comparison);
  });

  it("shows the Ko-fi support link in About settings", async () => {
    const mainWindow = await browser.getWindowHandle();
    await browser.executeObsidianCommand("app:open-settings");
    // Recent Obsidian versions open Settings in a separate window.
    const settingsWindow = (await browser.getWindowHandles()).find(handle => handle !== mainWindow);
    if (settingsWindow !== undefined) await browser.switchToWindow(settingsWindow);
    try {
      await $(".vertical-tab-nav-item=Side-by-Side Diff").click();
      const link = $(".vertical-tab-content a[href='https://ko-fi.com/blumnico']");
      await expect(link).toBeDisplayed();
      await expect(link).toHaveText("Buy me a coffee");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener");
    } finally {
      if (settingsWindow !== undefined) {
        await browser.closeWindow();
        await browser.switchToWindow(mainWindow);
      }
    }
  });

  it("offers coffee support on the introduction's thank-you step", async () => {
    await browser.executeObsidianCommand("side-by-side-diff:show-introduction");
    const modal = ".file-diff-sbs-introduction-modal";
    const continueButton = $(`${modal} .file-diff-sbs-introduction-actions .mod-cta`);
    const link = $(`${modal} a[href='https://ko-fi.com/blumnico']`);
    await expect(link).not.toExist();
    for (let step = 0; step < 4; step += 1) {
      await continueButton.click();
    }
    await expect($(`${modal} h3`)).toHaveText("Thank you");
    await expect(link).toBeDisplayed();
    await expect(link).toHaveText("Buy me a coffee");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/introduction-thanks.png"));
    await continueButton.click();
    await expect($(modal)).not.toExist();
  });

  it("opens README help from the diff menu and preserves staged changes", async () => {
    await $(accept).click();
    await $(`${view} button[aria-label='File actions']`).click();
    await $(".menu-item-title=Help").click();
    const modal = ".file-diff-sbs-help-modal";
    await expect($(`${modal} h1`)).toHaveText("Side-by-Side Diff");
    const content = $(`${modal} .file-diff-sbs-help-content`);
    await expect(content).toHaveText(expect.stringContaining("Changes are never written automatically"));
    await browser.waitUntil(async () => browser.execute((selector) => {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(`${selector} img`));
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0 && image.src.startsWith("data:image/"));
    }, modal));
    await expect($(`${modal} a[href='https://github.com/nblum/obsidian-side-by-side-diff/blob/main/docs/visual-guide.md']`)).toExist();
    await expect($(`${modal} a[href='https://ko-fi.com/blumnico']`)).toHaveText("Buy me a coffee");
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/help-readme.png"));
    await $(`${modal} a[href='#keyboard-shortcuts']`).click();
    assert.equal(await browser.execute((selector) => {
      const heading = Array.from(document.querySelectorAll(`${selector} h2`)).find(element => element.textContent === "Keyboard shortcuts");
      const container = document.querySelector(`${selector} .modal-content`);
      if (!heading || !container) return false;
      const target = heading.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      return target.top >= bounds.top - 2 && target.bottom <= bounds.bottom;
    }, modal), true, "section links scroll within the help dialog");
    await browser.keys("Escape");
    await expect($(modal)).not.toExist();
    await expect($(save)).toBeEnabled();
    await expect($(`${view} [data-diff-pending='insert']`)).toHaveText(expect.stringContaining("Original wording."));
    assert.equal(await readSaved("Comparison.md"), comparison);
    await $(undo).click();
    await expect($(save)).toBeDisabled();
  });

  it("stages, undoes and explicitly saves a row without writing to the source", async () => {
    await $(accept).click();
    await expect($(save)).toBeEnabled();
    await expect($(feedback)).toHaveText("Change staged. Save to write it.");
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 0");
    await expect($(`${view} [data-review-status='accepted'] .file-diff-sbs-review-marker`)).toHaveAttribute("aria-label", "Accepted");
    await expect($(feedback)).toHaveAttribute("role", "status");
    await expect($(feedback)).toHaveAttribute("aria-live", "polite");
    await expect($$(".notice")).toBeElementsArrayOfSize(0);
    await expect($(save)).toBeClickable();
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/review-feedback.png"));
    await expect($(`${view} [data-diff-pending='insert']`)).toHaveText(expect.stringContaining("Original wording."));
    await expect($(`${view} [data-diff-pending='delete']`)).toHaveText(expect.stringContaining("Comparison wording."));
    assert.equal(await readSaved("Comparison.md"), comparison);

    await $(undo).click();
    await expect($(feedback)).toHaveText("Undone.");
    await expect($(progress)).toHaveText("Open: 1 · Accepted: 0 · Ignored: 0");
    await expect($$(".notice")).toBeElementsArrayOfSize(0);
    await expect($(save)).toBeDisabled();
    await expect($$(accept)).toBeElementsArrayOfSize(1);
    await expect($(`${view} [data-diff-pending]`)).not.toExist();
    assert.equal(await readSaved("Comparison.md"), comparison);

    await $(accept).click();
    await expect($(save)).toBeEnabled();
    await expect($(feedback)).toHaveText("Change staged. Save to write it.");
    await expect($$(".notice")).toBeElementsArrayOfSize(0);
    await saveFromToolbar();
    await browser.waitUntil(async () => await readSaved("Comparison.md") === original);
    await expect($(save)).toBeDisabled();
    await expect($(feedback)).toHaveText("");
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 0 · Ignored: 0");
    await expect($(`${view} [data-review-status]`)).not.toExist();
    await expect($(".notice-container")).toHaveText(expect.stringContaining("Changes saved."));
    await expect($(`${view} [data-diff-pending]`)).not.toExist();
    assert.equal(await readSaved("Original.md"), original);
  });

  it("ignores a row while preserving both displayed files and supports undo", async () => {
    await $(ignore).click();
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 0 · Ignored: 1");
    await expect($(`${view} [data-review-status='ignored'] .file-diff-sbs-review-marker`)).toHaveAttribute("aria-label", "Ignored");
    await expect($$(accept)).toBeElementsArrayOfSize(0);
    await expect($(save)).toBeDisabled();
    await expect($(`${view} .file-diff-sbs-grid`)).toHaveText(expect.stringContaining("Original wording."));
    await expect($(`${view} .file-diff-sbs-grid`)).toHaveText(expect.stringContaining("Comparison wording."));
    assert.equal(await readSaved("Original.md"), original);
    assert.equal(await readSaved("Comparison.md"), comparison);
    await $(undo).click();
    await expect($$(accept)).toBeElementsArrayOfSize(1);
  });

  it("reverses direction and saves into the left target without swapping the files", async () => {
    await $(`${view} .file-diff-sbs-direction-button`).click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-role`)).toHaveText(expect.stringContaining("Target"));
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-role`)).toHaveText("Source");
    await $(accept).click();
    await expect($(save)).toBeEnabled();
    assert.equal(await readSaved("Original.md"), original);
    await saveFromToolbar();
    await browser.waitUntil(async () => await readSaved("Original.md") === comparison);
    await expect($(save)).toBeDisabled();
    assert.equal(await readSaved("Comparison.md"), comparison);
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText("Original.md");
  });

  it("keeps a staged change after a save conflict and preserves the external edit", async () => {
    await $(accept).click();
    await expect($(save)).toBeEnabled();
    const external = comparison.replace("Comparison wording.", "Changed elsewhere.");
    await obsidianPage.write("Comparison.md", external);
    await saveFromToolbar();
    await expect($(".notice-container")).toHaveText(expect.stringContaining("Saving was canceled to prevent overwriting it."));
    await expect($(save)).toBeEnabled();
    await expect($(`${view} [data-diff-pending='insert']`)).toExist();
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 0");
    await expect($(`${view} [data-review-status='accepted']`)).toExist();
    assert.equal(await readSaved("Comparison.md"), external);
    assert.equal(await readSaved("Original.md"), original);
  });

  for (const reverse of [false, true]) {
    it(`keeps review identities after insertion, ignore, undo and save (${reverse ? "right to left" : "left to right"})`, async () => {
      const source = "A\ninsert\nB\nnew\nC\nnew\nZ\n";
      const target = "A\nB\nold\nC\nold\nZ\n";
      await obsidianPage.write("Original.md", reverse ? target : source);
      await obsidianPage.write("Comparison.md", reverse ? source : target);
      await expect($(progress)).toHaveText("Open: 3 · Accepted: 0 · Ignored: 0");
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      const ignoredRow = $$(ignore)[2];
      assert.ok(ignoredRow);
      await ignoredRow.click();
      await expect($(progress)).toHaveText("Open: 2 · Accepted: 0 · Ignored: 1");
      await $(accept).click();
      await expect($(progress)).toHaveText("Open: 1 · Accepted: 1 · Ignored: 1");
      await expect($$(`${view} [data-review-status='ignored']`)).toBeElementsArrayOfSize(1);
      await expect($$(`${view} [data-diff-change='true']`)).toBeElementsArrayOfSize(1);
      await browser.executeObsidianCommand("side-by-side-diff:next-change");
      await expect($(`${view} .file-diff-sbs-active-change`)).toHaveAttribute("data-review-status", "open");
      assert.equal(await browser.execute((selector) => {
        const widths = Array.from(document.querySelectorAll(`${selector} .file-diff-sbs-action-cell`), element => element.getBoundingClientRect().width);
        return widths.length > 0 && Math.max(...widths) - Math.min(...widths) < 1;
      }, view), true, "open, accepted and ignored rows keep the same action-column width");
      await $(undo).click();
      await expect($(progress)).toHaveText("Open: 2 · Accepted: 0 · Ignored: 1");
      await $(accept).click();
      await $(accept).click();
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 2 · Ignored: 1");
      const targetPath = reverse ? "Original.md" : "Comparison.md";
      assert.equal(await readSaved(targetPath), target, "review decisions remain staged");
      await saveFromToolbar();
      await browser.waitUntil(async () => await readSaved(targetPath) === "A\ninsert\nB\nnew\nC\nold\nZ\n");
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 0 · Ignored: 1");
      await expect($(save)).toBeDisabled();
      await browser.saveScreenshot(join(process.cwd(), `e2e-results/review-progress-${reverse ? "reverse" : "forward"}.png`));
    });
  }

  for (const reverse of [false, true]) {
    it(`retains ignored duplicate lines after saving (${reverse ? "right to left" : "left to right"})`, async () => {
      await obsidianPage.write("Original.md", "2\n2\n2\n0\n");
      await obsidianPage.write("Comparison.md", "0\n0\n0\n");
      await expect($(progress)).toHaveText("Open: 5 · Accepted: 0 · Ignored: 0");
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      for (const index of [1, 2, 4]) {
        await $(`${view} [data-diff-row-index='${String(index)}'] button[aria-keyshortcuts='Alt+ArrowLeft']`).click();
      }
      for (const index of [0, 5]) {
        await $(`${view} [data-diff-row-index='${String(index)}'] button[aria-keyshortcuts='Alt+ArrowRight']`).click();
      }
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 2 · Ignored: 3");
      await saveFromToolbar();
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 0 · Ignored: 3");
      await expect($$(`${view} [data-review-status='ignored']`)).toBeElementsArrayOfSize(3);
      await expect($$(accept)).toBeElementsArrayOfSize(0);
      assert.equal(await readSaved(reverse ? "Original.md" : "Comparison.md"), reverse ? "2\n2\n0\n0\n" : "2\n0\n0\n");
      await expect($(save)).toBeDisabled();
    });
  }

  it("counts a mixed block by changed rows and undoes the entire acceptance at once", async () => {
    await obsidianPage.write("Original.md", "A\nnew1\nnew2\nnew3\nnew4\nnew5\nZ\n");
    await obsidianPage.write("Comparison.md", "A\nold1\nold2\nold3\nold4\nold5\nZ\n");
    await expect($(progress)).toHaveText("Open: 5 · Accepted: 0 · Ignored: 0");
    const ignoredRow = $$(ignore)[1];
    assert.ok(ignoredRow);
    await ignoredRow.click();
    await expect($(progress)).toHaveText("Open: 4 · Accepted: 0 · Ignored: 1");
    await $(`${view} .file-diff-sbs-group-actions button`).click();
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 4 · Ignored: 1");
    await expect($$(`${view} [data-review-status='accepted']`)).toBeElementsArrayOfSize(4);
    await expect($(`${view} [data-review-status='ignored']`)).toHaveText(expect.stringContaining("old2"));
    await $(undo).click();
    await expect($(progress)).toHaveText("Open: 4 · Accepted: 0 · Ignored: 1");
    await $(undo).click();
    await expect($(progress)).toHaveText("Open: 5 · Accepted: 0 · Ignored: 0");
    await expect($(save)).toBeDisabled();
  });

  it("prompts before swapping with staged changes and discards only on request", async () => {
    await $(accept).click();
    await expect($(save)).toBeEnabled();
    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(".modal-title")).toHaveText("Unsaved changes");
    assert.equal(await readSaved("Comparison.md"), comparison);
    await $(".file-diff-sbs-unsaved-actions").$("button=Don't save").click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText("Comparison.md");
    await expect($(save)).toBeDisabled();
    assert.equal(await readSaved("Original.md"), original);
    assert.equal(await readSaved("Comparison.md"), comparison);
  });

  for (const reverse of [false, true]) {
    it(`edits the ${reverse ? "left" : "right"} target and saves with the keyboard shortcut`, async () => {
      if (reverse) {
        await $(`${view} .file-diff-sbs-direction-button`).click();
        await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-role`)).toHaveText(expect.stringContaining("Target"));
      }
      await $(`${view} .file-diff-sbs-file-edit-button`).click();
      const editor = $(`${view} .file-diff-sbs-document-editor`);
      await expect(editor).toHaveAttribute("contenteditable", "true");
      await expect($$(`${view} [contenteditable='true']`)).toBeElementsArrayOfSize(1);
      const targetText = reverse ? "Original wording." : "Comparison wording.";
      await editor.$(`span=${targetText}`).click();
      await browser.keys("Home");
      await browser.keys(["Shift", "End"]);
      await browser.keys("Edited wording.");
      await expect(editor).toHaveText(expect.stringContaining("Edited wording."));
      await expect($(save)).toBeEnabled();
      assert.equal(await readSaved("Original.md"), original);
      assert.equal(await readSaved("Comparison.md"), comparison);

      await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "s"]);
      const targetPath = reverse ? "Original.md" : "Comparison.md";
      const expected = (reverse ? original : comparison).replace(targetText, "Edited wording.");
      await browser.waitUntil(async () => await readSaved(targetPath) === expected);
      await expect($(save)).toBeDisabled();
      assert.equal(await readSaved(reverse ? "Comparison.md" : "Original.md"), reverse ? comparison : original);
    });
  }
});
