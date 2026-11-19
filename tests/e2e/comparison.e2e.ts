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
    await expect($(`${view} [data-diff-side='left'] .file-diff-sbs-inline-left`)).toHaveText("Original");
    await expect($(`${view} [data-diff-side='right'] .file-diff-sbs-inline-right`)).toHaveText("Comparison");
    assert.equal(await readSaved("Original.md"), original);
    assert.equal(await readSaved("Comparison.md"), comparison);
  });

  it("shows the Ko-fi support link in About settings", async () => {
    await browser.executeObsidianCommand("app:open-settings");
    await $(".vertical-tab-nav-item=Side-by-Side Diff").click();
    const link = $(".vertical-tab-content a[href='https://ko-fi.com/blumnico']");
    await expect(link).toBeDisplayed();
    await expect(link).toHaveText("Buy me a coffee");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
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
    await $(`${modal} .modal-close-button`).click();
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
    await expect($(".notice-container")).toHaveText(expect.stringContaining("Changes saved."));
    await expect($(`${view} [data-diff-pending]`)).not.toExist();
    assert.equal(await readSaved("Original.md"), original);
  });

  it("ignores a row while preserving both displayed files and supports undo", async () => {
    await $(ignore).click();
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
    assert.equal(await readSaved("Comparison.md"), external);
    assert.equal(await readSaved("Original.md"), original);
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
