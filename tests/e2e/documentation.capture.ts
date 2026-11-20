import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { browser, $, $$, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { Key } from "webdriverio";
import sharp from "sharp";
import assets from "./screenshot-assets.json" with { type: "json" };

const output = resolve("e2e-results/screenshots");
const view = ".workspace-leaf.mod-active .file-diff-sbs-view";
const save = `${view} .file-diff-sbs-save-action`;
const accept = `${view} button[aria-keyshortcuts='Alt+ArrowRight']`;
const undo = `${view} button[aria-keyshortcuts='Ctrl+Z']`;
const left = "Release notes.md";
const right = "Revised release notes.md";
const captured = new Set<string>();
const frames: Buffer[] = [];

/** Waits for fonts, paints, and stable geometry before capturing real rendered pixels. */
async function settle(selector: string): Promise<WebdriverIO.Element> {
  const element = $(selector);
  await expect(element).toBeDisplayed();
  await $(".workspace-ribbon").moveTo();
  await expect($$(".notice")).toBeElementsArrayOfSize(0);
  await browser.execute(async () => {
    await document.fonts.ready;
    await new Promise<void>(done => {
      requestAnimationFrame(() => { requestAnimationFrame(() => { done(); }); });
    });
  });
  await element.waitForStable();
  return element.getElement();
}

/** Encodes an actual element screenshot in the format of the existing documentation asset. */
async function capture(filename: string, selector = view): Promise<void> {
  assert.ok(assets.some(asset => asset.filename === filename), `Unknown screenshot asset: ${filename}`);
  const element = await settle(selector);
  const png = Buffer.from(await browser.takeElementScreenshot(element.elementId), "base64");
  const image = sharp(png);
  if (selector === view) {
    const height = await browser.execute((selector) => {
      const root = document.querySelector(selector);
      const content = root?.querySelector(".file-diff-sbs-grid, .file-diff-sbs-edit-grid, .file-diff-sbs-selection-grid");
      if (!root || !content) throw new Error("Expected a rendered comparison or selection grid.");
      return Math.ceil(content.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 12);
    }, selector);
    const metadata = await image.metadata();
    assert.ok(height <= metadata.height, "The example content must fit in the screenshot viewport.");
    image.extract({ left: 0, top: 0, width: metadata.width, height });
  }
  if (filename.endsWith(".png")) await image.png().toFile(join(output, filename));
  else await image.webp({ quality: 90 }).toFile(join(output, filename));
  captured.add(filename);
}

/** Records one equal-sized frame of the full application content for the animated walkthrough. */
async function recordFrame(): Promise<void> {
  await settle(".workspace");
  const element = await $(".workspace").getElement();
  const png = Buffer.from(await browser.takeElementScreenshot(element.elementId), "base64");
  const metadata = await sharp(png).metadata();
  // Omit the footer containing the temporary vault's random directory name.
  frames.push(await sharp(png).extract({ left: 0, top: 0, width: metadata.width, height: metadata.height - 48 }).png().toBuffer());
}

/** Uses the file picker's real suggestion UI. */
async function chooseFile(name: string): Promise<void> {
  await $(".prompt-input").setValue(name);
  const suggestion = $(".suggestion-item");
  await expect(suggestion).toHaveText(expect.stringContaining(name));
  await suggestion.click();
  await expect($(".prompt-input")).not.toExist();
}

describe("documentation screenshots (opt-in)", () => {
  before(async () => {
    await mkdir(output, { recursive: true });
    // Invalidate an earlier run before any capture; a failed run must not be publishable.
    await rm(join(output, "manifest.json"), { force: true });
    await rm(join(output, "index.html"), { force: true });
    await browser.reloadObsidian({ vault: "tests/e2e/documentation-vault" });
    await writeFile(join(obsidianPage.getVaultPath(), ".obsidian/plugins/side-by-side-diff/data.json"), JSON.stringify({
      language: "en", introductionSeen: true, defaultApplyDirection: "left-to-right",
      autoAdvanceAfterChange: false, alignMarkdownByHeadings: false,
    }));
    await obsidianPage.enablePlugin("side-by-side-diff");
    const puppeteer = await browser.getPuppeteer();
    const url = await browser.getUrl();
    const page = (await puppeteer.pages()).find(candidate => candidate.url() === url);
    assert.ok(page, "The active Obsidian renderer must be available for viewport sizing.");
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    assert.deepEqual(await browser.execute(() => [innerWidth, innerHeight]), [1280, 900]);
  });

  it("captures the documented workflows and produces a complete asset set", async () => {
    await obsidianPage.openFile(left);
    const title = $(`.nav-file-title[data-path='${left}']`);
    await title.click({ button: "right" });
    await expect($(".menu")).toHaveText(expect.stringContaining("Compare with another file"));
    await capture("file-menu.webp", ".menu");
    await $(".menu").$(".menu-item-title=Compare with another file").click();
    await expect($(`${view} .file-diff-sbs-picker-card`)).toExist();
    await capture("file-selection.png");
    await $(`${view} .file-diff-sbs-picker-card button`).click();
    await chooseFile(right);
    await expect($$(accept)).toBeElementsArrayOfSize(5);
    await expect($(`${view} .file-diff-sbs-summary`)).toHaveText("Open: 5 · Accepted: 0 · Ignored: 0");
    await expect($(`${view} [data-review-status='open'] .file-diff-sbs-review-marker`)).not.toExist();
    await capture("compare-mode.webp");
    await capture("grouped-changes.png", `${view} .file-diff-sbs-group`);
    await $(`${view} .file-diff-sbs-keep-both`).click();
    await expect($(`${view} .file-diff-sbs-summary`)).toHaveText("Open: 1 · Accepted: 4 · Ignored: 0");
    await capture("kept-variants.webp");
    await $(undo).click();
    await expect($$(accept)).toBeElementsArrayOfSize(5);
    await browser.executeObsidianCommand("side-by-side-diff:next-change");
    await browser.executeObsidianCommand("side-by-side-diff:next-change");
    await expect($(`${view} .file-diff-sbs-change-position`)).toHaveText("2/5");
    await capture("active-change.webp");
    // Record real hit boxes to keep the derived shortcut illustration aligned after toolbar changes.
    await writeFile(join(output, "keyboard-targets.json"), JSON.stringify(await browser.execute((selector) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error("Comparison missing");
      const origin = root.getBoundingClientRect();
      const bounds = (selector: string) => {
        const button = root.querySelector(selector);
        if (!button) throw new Error(`Shortcut target missing: ${selector}`);
        const rect = button.getBoundingClientRect();
        return [rect.left - origin.left, rect.top - origin.top, rect.right - origin.left, rect.bottom - origin.top].map(Math.round);
      };
      return { save: bounds(".file-diff-sbs-save-action"), undo: bounds("button[aria-keyshortcuts='Ctrl+Z']"),
        previous: bounds("button[aria-keyshortcuts='Alt+ArrowUp']"), next: bounds("button[aria-keyshortcuts='Alt+ArrowDown']"),
        accept: bounds(".file-diff-sbs-active-change button[aria-keyshortcuts='Alt+ArrowRight']"),
        ignore: bounds(".file-diff-sbs-active-change button[aria-keyshortcuts='Alt+ArrowLeft']") };
    }, view), null, 2));
    await $(`${view} .file-diff-sbs-direction-button`).click();
    await $(`${view} .file-diff-sbs-direction-button`).click();
    await expect($(`${view} .file-diff-sbs-change-position`)).not.toExist();

    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await expect($(`${view} [contenteditable='true']`)).toExist();
    await capture("inline-edit.png");
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await expect($$(accept)).toBeElementsArrayOfSize(5);

    await $(`${view} .file-diff-sbs-direction-button`).click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-role-target`)).toExist();
    await capture("reverse-direction.webp");
    await $(`${view} .file-diff-sbs-direction-button`).click();
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-role-target`)).toExist();

    await $(`${view} button[aria-keyshortcuts='Alt+ArrowLeft']`).click();
    await expect($$(accept)).toBeElementsArrayOfSize(4);
    await expect($(`${view} .file-diff-sbs-summary`)).toHaveText("Open: 4 · Accepted: 0 · Ignored: 1");
    await expect($(`${view} [data-review-status='ignored'] .file-diff-sbs-review-marker`)).toHaveAttribute("aria-label", "Ignored");
    await capture("ignored-changes.webp");
    await $(undo).click();
    await expect($$(accept)).toBeElementsArrayOfSize(5);
    await $(accept).click();
    await expect($(`${view} [data-diff-pending='insert']`)).toExist();
    await expect($(`${view} .file-diff-sbs-review-feedback`)).toHaveText("Change staged. Save to write it.");
    await expect($(`${view} .file-diff-sbs-summary`)).toHaveText("Open: 4 · Accepted: 1 · Ignored: 0");
    await expect($(`${view} [data-review-status='accepted'] .file-diff-sbs-review-marker`)).toHaveAttribute("aria-label", "Accepted");
    await capture("pending-changes.webp");
    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(".modal-title")).toHaveText("Unsaved changes");
    await capture("unsaved-changes.webp", ".modal");
    await $(".file-diff-sbs-unsaved-actions").$("button=Don't save").click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText(right);

    // Real multi-selection and context menu; this also drives the animated README walkthrough.
    await obsidianPage.openFile(left);
    await title.click();
    await browser.action("key").down(Key.Alt).perform(true);
    try {
      await title.click();
      await $(`.nav-file-title[data-path='${right}']`).click();
    }
    finally { await browser.releaseActions(); }
    await expect($$(".nav-file-title.is-selected")).toBeElementsArrayOfSize(2);
    await $(`.nav-file-title[data-path='${right}']`).click({ button: "right" });
    await expect($(".menu")).toHaveText(expect.stringContaining("Compare files"));
    await capture("compare-two-files-menu.png", ".menu");
    await recordFrame();
    await $(".menu").$(".menu-item-title=Compare files").click();
    await expect($$(accept)).toBeElementsArrayOfSize(5);
    // Selection ordering is defined by Obsidian; make the illustrated merge direction explicit.
    if (await $(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`).getText() !== left) {
      await $(`${view} .file-diff-sbs-swap-button`).click();
      await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText(left);
    }
    await recordFrame();
    while (await $$(accept).length > 0) {
      const remaining = await $$(accept).length;
      await $(accept).click();
      await expect($$(accept)).toBeElementsArrayOfSize(remaining - 1);
      await expect($(save)).toBeEnabled();
      await expect($(`${view} .file-diff-sbs-review-feedback`)).toHaveText("Change staged. Save to write it.");
    }
    await recordFrame();
    await $(save).click();
    await expect($(save)).toBeDisabled();
    const expected = await readFile(new URL("./documentation-vault/Release notes.md", import.meta.url), "utf8");
    assert.equal(await readFile(join(obsidianPage.getVaultPath(), right), "utf8"), expected);
    await capture("identical-files.webp");
    await recordFrame();

    const decoded = await Promise.all(frames.map(frame => sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    const first = decoded[0];
    assert.ok(first);
    for (const frame of decoded) assert.deepEqual(frame.info, first.info);
    await sharp(Buffer.concat(decoded.map(frame => frame.data)), {
      raw: { width: first.info.width, height: first.info.height * frames.length, channels: 4, pageHeight: first.info.height },
    }).webp({ quality: 85, loop: 0, delay: [1800, 2200, 1800, 2200] }).toFile(join(output, "comparsion-record1.webp"));
    captured.add("comparsion-record1.webp");
    await obsidianPage.write(left, "# Notes\nA clearer sentence.\nReview before saving.\n");
    await obsidianPage.write(right, "# Notes\nAn older sentence.\nKeep the previous draft.\n");
    await browser.execute((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error("Comparison missing");
      element.style.width = "390px";
    }, view);
    await expect($(`${view} .file-diff-sbs-root`)).toHaveAttribute("data-layout", "single-column");
    await expect($$(accept)).toBeElementsArrayOfSize(2);
    await expect($(`${view} .file-diff-sbs-group-header`)).toBeDisplayed();
    assert.equal(await browser.execute((selector) => {
      const group = document.querySelector(`${selector} .file-diff-sbs-group`);
      return group?.lastElementChild?.classList.contains("file-diff-sbs-group-header");
    }, view), true);
    await capture("single-column.webp");
    assert.deepEqual([...captured].sort(), assets.map(asset => asset.filename).sort());
    // This marker is written last; the publisher requires it before updating any tracked asset.
    await writeFile(join(output, "manifest.json"), JSON.stringify({
      complete: true, obsidianVersion: browser.getObsidianVersion(),
      viewport: { width: 1280, height: 900, deviceScaleFactor: 1 }, theme: "light", language: "en", assets,
    }, null, 2));
    await writeFile(join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Documentation screenshots</title><style>body{font:16px system-ui;margin:32px;max-width:1280px;background:#f5f5f5}article{margin:32px 0;padding:20px;background:white;border-radius:8px}img{max-width:100%;height:auto}h2{font-size:18px}</style><h1>Obsidian ${browser.getObsidianVersion()} documentation captures</h1>${assets.map(asset => `<article><h2>${asset.filename}</h2><p>${asset.description}</p><img src="${asset.filename}" alt="${asset.description}"></article>`).join("")}</html>`);
  });
});
