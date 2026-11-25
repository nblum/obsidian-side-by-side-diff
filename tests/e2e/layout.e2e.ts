import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browser, $, $$, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const view = ".workspace-leaf.mod-active .file-diff-sbs-view";
const root = `${view} .file-diff-sbs-root`;
const layout = `${view} .file-diff-sbs-layout-button`;
const progress = `${view} .file-diff-sbs-summary[role='status']`;
const accept = `${view} button[aria-keyshortcuts='Alt+ArrowRight']`;
const ignore = `${view} button[aria-keyshortcuts='Alt+ArrowLeft']`;
const undo = `${view} button[aria-keyshortcuts='Ctrl+Z']`;
const save = `${view} .file-diff-sbs-save-action`;

/** Selects a named file through the real picker, checking the chosen suggestion. */
async function chooseFile(name: string): Promise<void> {
  await $(".prompt-input").setValue(name);
  await expect($(".suggestion-item")).toHaveText(expect.stringContaining(name));
  await $(".suggestion-item").click();
  await expect($(".prompt-input")).not.toExist();
}

/** Chooses a preference using only the visible three-state button. */
async function chooseLayout(preference: string): Promise<void> {
  for (let step = 0; step < 3; step += 1) {
    if (await $(layout).getAttribute("data-layout-preference") === preference) return;
    await $(layout).click();
  }
  await expect($(layout)).toHaveAttribute("data-layout-preference", preference);
}

/** Opens both vault files through the actual command and picker controls. */
async function openComparison(): Promise<void> {
  await browser.executeObsidianCommand("side-by-side-diff:compare-two-files");
  for (const name of ["Original.md", "Comparison.md"]) {
    if (name === "Comparison.md") await $(`${view} .file-diff-sbs-picker-card button`).click();
    await chooseFile(name);
  }
  await expect($(layout)).toBeDisplayed();
}

/** Narrows the actual plugin container independently of window-manager minimum sizes. */
async function setWidth(width: number): Promise<void> {
  await browser.execute((selector, width) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error("Comparison missing");
    element.style.width = `${String(width)}px`;
  }, view, width);
}

/** Sets files through Obsidian so its modify events update the real comparison. */
async function replaceFiles(left: string, right: string): Promise<void> {
  await obsidianPage.write("Original.md", left);
  await obsidianPage.write("Comparison.md", right);
}

/** Checks the saved file independently of the review session. */
async function saved(name: string): Promise<string> {
  return readFile(join(obsidianPage.getVaultPath(), name), "utf8");
}

/** Replaces the first literal editor line through the real keyboard and native selection. */
async function replaceEditorHeading(): Promise<void> {
  await browser.execute((selector) => {
    const editor = document.querySelector<HTMLElement>(`${selector} .file-diff-sbs-document-editor`);
    const line = editor?.querySelector(".file-diff-sbs-edit-code");
    const selection = document.getSelection();
    if (!editor || !line || !selection) throw new Error("Target editor missing");
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(line);
    selection.removeAllRanges();
    selection.addRange(range);
  }, view);
  await browser.keys("# Edited target");
  await expect($(save)).toBeEnabled();
}

/** Copies a real DOM selection through the document's registered clipboard handler. */
async function copyWholeComparison(): Promise<string> {
  return browser.execute((selector) => {
    const grid = document.querySelector(`${selector} .file-diff-sbs-grid`);
    const selection = document.getSelection();
    if (!grid || !selection) throw new Error("Comparison selection missing");
    const range = document.createRange();
    range.selectNodeContents(grid);
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data });
    document.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error("The plugin did not handle the copy event");
    return data.getData("text/plain");
  }, view);
}

/** Checks actual reading and focus order, rather than only a CSS footer class. */
async function expectBlockFooter(): Promise<void> {
  await expect($(`${view} .file-diff-sbs-group-header`)).toBeDisplayed();
  const position = await browser.execute((selector) => {
    const group = document.querySelector(`${selector} .file-diff-sbs-group`);
    const controls = group?.querySelector(".file-diff-sbs-group-header");
    const rows = Array.from(group?.querySelectorAll(".file-diff-sbs-row") ?? []);
    const last = rows[rows.length - 1];
    if (!group || !controls || !last) throw new Error("Block content or actions missing");
    return { lastInDom: group.lastElementChild === controls,
      belowContent: controls.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1 };
  }, view);
  assert.deepEqual(position, { lastInDom: true, belowContent: true });
}

describe("single-column layout in Obsidian", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "tests/e2e/vault" });
    await writeFile(join(obsidianPage.getVaultPath(), ".obsidian/plugins/side-by-side-diff/data.json"), JSON.stringify({
      language: "en", introductionSeen: true, defaultLayout: "auto", autoAdvanceAfterChange: false
    }));
    await obsidianPage.enablePlugin("side-by-side-diff");
    // Electron's old installers do not expose Browser.getWindowForTarget to WebDriver.
    await browser.executeObsidian(({ require }) => {
      const remote = require("@electron/remote") as { getCurrentWindow(): { setSize(width: number, height: number): void } };
      remote.getCurrentWindow().setSize(1440, 1000);
    });
    await openComparison();
  });

  it("cycles three icon-only layout preferences with mouse, Space and Enter", async () => {
    const original = await saved("Original.md");
    const comparison = await saved("Comparison.md");
    await setWidth(390);
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await expect($(layout)).toHaveAttribute("data-layout-preference", "auto");
    await expect($(layout)).toHaveAttribute("aria-label", "Layout: Automatic. Switch to Side by side.");
    const icons: string[] = [];
    for (const key of ["click", " ", "Enter"]) {
      icons.push(await browser.execute((selector) => {
        const button = document.querySelector(selector);
        const svg = button?.querySelector("svg");
        if (!button || !svg || !svg.querySelector("rect") || !svg.querySelector("path")) throw new Error("Layout vector icon missing");
        if (button.textContent !== "") throw new Error("The layout control must not render a text label");
        return svg.innerHTML;
      }, layout));
      if (key === "click") await $(layout).click();
      else await browser.keys(key);
    }
    assert.equal(new Set(icons).size, 3, "Each preference has its own vector icon");
    await expect($(layout)).toHaveAttribute("data-layout-preference", "auto");
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await setWidth(1024);
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    await $(layout).click();
    await expect($(layout)).toHaveAttribute("data-layout-preference", "side-by-side");
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    await expect($(layout)).toHaveAttribute("aria-label", "Layout: Side by side. Switch to Single column.");
    await expect($(`${view} .file-diff-sbs-layout-select, ${view} .file-diff-sbs-layout-control`)).not.toExist();
    await expect($(save)).toBeDisabled();
    assert.equal(await saved("Original.md"), original);
    assert.equal(await saved("Comparison.md"), comparison);
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    const editor = `${view} .file-diff-sbs-document-editor`;
    await expect($(editor)).toBeDisplayed();
    await $(editor).click();
    await $(layout).click();
    await expect($(layout)).toHaveAttribute("data-layout-preference", "single-column");
    await browser.keys("Enter");
    await expect($(layout)).toHaveAttribute("data-layout-preference", "auto");
    await expect($(save)).toBeDisabled();
  });

  it("matches the layout-button size to Save across preferences and device styling", async () => {
    for (const mobile of [false, true]) {
      await browser.execute((mobile) => document.body.classList.toggle("is-mobile", mobile), mobile);
      for (const width of [390, 1024]) {
        await setWidth(width);
        for (const preference of ["side-by-side", "single-column", "auto"]) {
          await chooseLayout(preference);
          const dimensions = await browser.execute((selector) => {
            const button = document.querySelector(selector);
            const icon = button?.querySelector("svg");
            const save = button?.closest(".file-diff-sbs-root")?.querySelector(".file-diff-sbs-save-action");
            if (!button || !icon || !save) throw new Error("Layout button, icon or Save missing");
            const bounds = button.getBoundingClientRect();
            const iconBounds = icon.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height, iconWidth: iconBounds.width, iconHeight: iconBounds.height,
              saveHeight: save.getBoundingClientRect().height };
          }, layout);
          const size = dimensions.saveHeight;
          assert.deepEqual(dimensions, { width: size, height: size, iconWidth: size - 4, iconHeight: size - 4, saveHeight: size },
            `Layout ${preference}, container ${String(width)}, mobile styling ${String(mobile)}`);
          if (mobile) assert.ok(size >= 44);
        }
      }
    }
  });

  it("hides the edit entry in every single-column layout while retaining an existing editor", async () => {
    const edit = `${view} .file-diff-sbs-file-edit-button:not(.file-diff-sbs-compare-mode-button)`;
    for (const width of [1024, 390]) {
      await setWidth(width);
      for (const preference of ["auto", "side-by-side", "single-column"]) {
        await chooseLayout(preference);
        const resolved = await $(root).getAttribute("data-layout");
        if (resolved === "single-column" || width < 720) await expect($(edit)).not.toBeDisplayed();
        else await expect($(edit)).toBeDisplayed();
      }
    }
    await setWidth(1024);
    await chooseLayout("side-by-side");
    await $(edit).click();
    const editor = `${view} .file-diff-sbs-document-editor`;
    await expect($(editor)).toBeDisplayed();
    await browser.execute((selector) => { Reflect.set(window, "editEntryRegressionEditor", document.querySelector(selector)); }, editor);
    await chooseLayout("single-column");
    await expect($(`${view} .file-diff-sbs-compare-mode-button`)).toBeDisplayed();
    assert.equal(await browser.execute((selector) => document.querySelector(selector) === Reflect.get(window, "editEntryRegressionEditor"), editor), true);
    await $(`${view} .file-diff-sbs-compare-mode-button`).click();
    await expect($(editor)).not.toExist();
    await expect($(edit)).not.toBeDisplayed();
  });

  it("keeps button heights tied to the device rather than the comparison layout", async () => {
    await replaceFiles("new1\nnew2\nnew3\nnew4\n", "old1\nold2\nold3\nold4\n");
    for (const mobile of [false, true]) {
      await browser.execute((mobile) => document.body.classList.toggle("is-mobile", mobile), mobile);
      const measurements: Record<string, number>[] = [];
      for (const width of [1024, 390]) {
        await setWidth(width);
        for (const preference of ["side-by-side", "single-column", "auto"]) {
          await chooseLayout(preference);
          measurements.push(await browser.execute((selector) => {
            const root = document.querySelector(selector);
            if (!root) throw new Error("Comparison missing");
            const selectors = { save: ".file-diff-sbs-save-action", layout: ".file-diff-sbs-layout-button",
              undo: "button[aria-keyshortcuts='Ctrl+Z']", next: "button[aria-keyshortcuts='Alt+ArrowDown']",
              direction: ".file-diff-sbs-direction-button", row: ".file-diff-sbs-merge-button",
              group: ".file-diff-sbs-group-button" };
            return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
              const button = root.querySelector(selector);
              if (!button) throw new Error(`Missing ${key}`);
              return [key, button.getBoundingClientRect().height];
            }));
          }, view));
        }
      }
      const baseline = measurements[0];
      assert.ok(baseline);
      for (const measured of measurements) assert.deepEqual(measured, baseline, `Stable button heights with mobile styling ${String(mobile)}`);
      assert.equal(baseline.row, mobile ? 44 : 32);
      assert.equal(baseline.group, mobile ? 44 : 32);
      assert.equal(baseline.layout, baseline.save);
      if (mobile) assert.ok(Object.values(baseline).every(height => height >= 44));
    }
  });

  it("uses compact file rows and one direction control on narrow screens, restoring desktop actions at 720px", async () => {
    const header = `${view} .file-diff-sbs-comparison-header`;
    const edit = `${header} .file-diff-sbs-file-edit-button`;
    const swap = `${header} .file-diff-sbs-swap-button`;
    const direction = `${header} .file-diff-sbs-direction-button`;
    for (const width of [360, 390, 719]) {
      await setWidth(width);
      await expect($(edit)).not.toBeDisplayed();
      await expect($(swap)).not.toBeDisplayed();
      await expect($(`${header} .file-diff-sbs-side-label`)).not.toBeDisplayed();
      await expect($(`${header} .file-diff-sbs-file-path`)).not.toBeDisplayed();
      await expect($(`${header} .file-diff-sbs-compact-folder`)).not.toBeDisplayed();
      await expect($(`${header} .file-diff-sbs-left-file .file-diff-sbs-compact-role`)).toHaveText("SOURCE");
      await expect($(`${header} .file-diff-sbs-right-file .file-diff-sbs-compact-role`)).toHaveText("TARGET");
      const geometry = await browser.execute((selector) => {
        const header = document.querySelector(selector);
        const button = header?.querySelector(".file-diff-sbs-direction-button");
        if (!header || !button) throw new Error("File header missing");
        return { height: header.getBoundingClientRect().height, overflow: header.scrollWidth > header.clientWidth,
          width: button.getBoundingClientRect().width, buttonHeight: button.getBoundingClientRect().height };
      }, header);
      assert.ok(geometry.height < 100);
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.width, 44);
      assert.equal(geometry.buttonHeight, 44);
    }
    await $(direction).click();
    await expect($(`${header} .file-diff-sbs-left-file .file-diff-sbs-compact-role`)).toHaveText("TARGET");
    await expect($(`${header} .file-diff-sbs-right-file .file-diff-sbs-compact-role`)).toHaveText("SOURCE");
    await $(accept).click();
    await expect($(direction)).toBeDisabled();
    await $(save).click();
    await browser.waitUntil(async () => (await saved("Original.md")).includes("Comparison wording."), {
      timeoutMsg: "Saving after reversing the comparison must write the reviewed change to Original.md."
    });
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/compact-file-header.png"));
    await setWidth(720);
    await expect($(swap)).toBeDisplayed();
    await expect($(edit)).toBeDisplayed();
    await expect($(`${header} .file-diff-sbs-side-label`)).toBeDisplayed();
    await expect($(`${header} .file-diff-sbs-file-path`)).toBeDisplayed();
    await browser.execute((selector) => document.querySelector<HTMLButtonElement>(selector)?.focus(), swap);
    await setWidth(390);
    await browser.waitUntil(async () => browser.execute((selector) => document.activeElement === document.querySelector(selector), layout));
    await setWidth(720);
    await $(edit).click();
    const editor = `${view} .file-diff-sbs-document-editor`;
    await expect($(editor)).toBeDisplayed();
    await setWidth(390);
    await expect($(editor)).toBeDisplayed();
    await expect($(`${header} .file-diff-sbs-compare-mode-button`)).toBeDisplayed();
    await $(`${header} .file-diff-sbs-compare-mode-button`).click();
    await expect($(editor)).not.toExist();
    await expect($(edit)).not.toBeDisplayed();
  });

  it("shows folders only for identical filenames and constrains long names in compact headers", async () => {
    const name = "A deliberately long draft name with several words for checking narrow header wrapping.md";
    await browser.executeObsidian(async ({ app }, name) => {
      for (const folder of ["originals", "revisions"]) {
        await app.vault.createFolder(folder);
        await app.vault.create(`${folder}/${name}`, `${folder}\n`);
      }
    }, name);
    await browser.executeObsidianCommand("side-by-side-diff:compare-two-files");
    await chooseFile("originals");
    await $(`${view} .file-diff-sbs-picker-card button`).click();
    await chooseFile("revisions");
    await setWidth(360);
    const header = `${view} .file-diff-sbs-comparison-header`;
    await expect($(`${header} .file-diff-sbs-left-file .file-diff-sbs-compact-folder`)).toHaveText("originals");
    await expect($(`${header} .file-diff-sbs-right-file .file-diff-sbs-compact-folder`)).toHaveText("revisions");
    await expect($(`${header} .file-diff-sbs-file-name`)).toHaveAttribute("title", `originals/${name}`);
    const fits = await browser.execute((selector) => {
      const header = document.querySelector(selector);
      if (!header) throw new Error("File header missing");
      return header.scrollWidth <= header.clientWidth && Array.from(header.querySelectorAll(".file-diff-sbs-file-name")).every(name =>
        name.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(name).lineHeight) * 2 + 1);
    }, header);
    assert.equal(fits, true);
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/compact-ambiguous-file-header.png"));
  });

  for (const reverse of [false, true]) {
    for (const choice of ["Save", "Discard changes"]) {
      it(`offers ${choice} before leaving a dirty editor (${reverse ? "reverse" : "forward"})`, async () => {
        if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
        const target = reverse ? "Original.md" : "Comparison.md";
        const source = reverse ? "Comparison.md" : "Original.md";
        const original = await saved(target);
        const sourceText = await saved(source);
        await $(`${view} .file-diff-sbs-file-edit-button`).click();
        await replaceEditorHeading();
        await chooseLayout("single-column");
        await setWidth(390);
        const exit = `${view} .file-diff-sbs-compare-mode-button`;
        await expect($(exit)).toHaveText("Leave edit mode");
        await expect($(`${exit} svg`)).not.toExist();
        await $(exit).click();
        await expect($(".modal-title")).toHaveText("Unsaved changes");
        await expect($(".modal-content")).toHaveText(expect.stringContaining("Save changes before leaving edit mode?"));
        assert.equal(await saved(target), original);
        await $(".file-diff-sbs-unsaved-actions").$(`button=${choice}`).click();
        await expect($(".modal-title")).not.toExist();
        await expect($(`${view} .file-diff-sbs-document-editor`)).not.toExist();
        await expect($(root)).toHaveAttribute("data-layout", "single-column");
        assert.equal(await saved(target), choice === "Save" ? original.replace("# Review", "# Edited target") : original);
        assert.equal(await saved(source), sourceText);
        await expect($(save)).toBeDisabled();
      });
    }
  }

  it("keeps the live editor and its text when edit-exit confirmation is cancelled or dismissed", async () => {
    const original = await saved("Comparison.md");
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await replaceEditorHeading();
    await chooseLayout("single-column");
    const editor = `${view} .file-diff-sbs-document-editor`;
    await browser.execute((selector) => { Reflect.set(window, "cancelExitEditor", document.querySelector(selector)); }, editor);
    await setWidth(390);
    for (const cancel of ["button", "escape"]) {
      await $(`${view} .file-diff-sbs-compare-mode-button`).click();
      await expect($(".modal-title")).toHaveText("Unsaved changes");
      await browser.saveScreenshot(join(process.cwd(), "e2e-results/leave-edit-confirmation.png"));
      if (cancel === "button") await $(".file-diff-sbs-unsaved-actions").$("button=Cancel").click();
      else await browser.keys("Escape");
      await expect($(".modal-title")).not.toExist();
      await expect($(editor)).toHaveText(expect.stringContaining("# Edited target"));
      assert.equal(await browser.execute((selector) => document.querySelector(selector) === Reflect.get(window, "cancelExitEditor"), editor), true);
      assert.equal(await saved("Comparison.md"), original);
      await expect($(save)).toBeEnabled();
    }
  });

  it("keeps editing when saving from the exit dialog encounters an external-change conflict", async () => {
    const source = await saved("Original.md");
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await replaceEditorHeading();
    await $(`${view} .file-diff-sbs-compare-mode-button`).click();
    await expect($(".modal-title")).toHaveText("Unsaved changes");
    await obsidianPage.write("Comparison.md", "External changes must survive\n");
    await $(".file-diff-sbs-unsaved-actions").$("button=Save").click();
    await expect($(".modal-title")).not.toExist();
    await expect($(`${view} .file-diff-sbs-document-editor`)).toHaveText(expect.stringContaining("# Edited target"));
    await expect($(save)).toBeEnabled();
    assert.equal(await saved("Comparison.md"), "External changes must survive\n");
    assert.equal(await saved("Original.md"), source);
  });

  it("shares review-button styling in light and dark themes and exposes hover and keyboard focus", async () => {
    await replaceFiles("new1\nnew2\nnew3\nnew4\n", "old1\nold2\nold3\nold4\n");
    await setWidth(390);
    const groupAccept = `${view} .file-diff-sbs-group-actions [data-review-action='accept']`;
    for (const dark of [false, true]) {
      await browser.execute((dark) => {
        document.body.classList.toggle("theme-dark", dark);
        document.body.classList.toggle("theme-light", !dark);
      }, dark);
      for (const preference of ["side-by-side", "single-column"]) {
        await chooseLayout(preference);
        await $(".workspace-ribbon").moveTo();
        await browser.execute(async (selector) => {
          const buttons = Array.from(document.querySelectorAll(`${selector} [data-review-action]`));
          await Promise.all(buttons.flatMap(button => button.getAnimations().map(animation => animation.finished.catch(() => {}))));
        }, view);
        const styles = await browser.execute((selector) => {
          const row = document.querySelector(`${selector} [data-diff-change='true'] .file-diff-sbs-action-cell`);
          const group = document.querySelector(`${selector} .file-diff-sbs-group-actions`);
          if (!row || !group) throw new Error("Review actions missing");
          const describe = (parent: Element, action: string) => {
            const button = parent.querySelector(`[data-review-action='${action}']`);
            if (!button) throw new Error("Review button missing");
            const style = getComputedStyle(button);
            return { radius: style.borderRadius, border: style.borderWidth, font: style.fontFamily,
              fontSize: style.fontSize, weight: style.fontWeight, background: style.backgroundColor,
              color: style.color, height: button.getBoundingClientRect().height, shadow: style.boxShadow };
          };
          return { textColor: getComputedStyle(row).getPropertyValue("color"), rowAccept: describe(row, "accept"), rowIgnore: describe(row, "ignore"),
            groupAccept: describe(group, "accept"), groupIgnore: describe(group, "ignore"), keep: describe(group, "keep-both") };
        }, view);
        for (const button of [styles.rowAccept, styles.rowIgnore, styles.groupAccept, styles.groupIgnore, styles.keep]) {
          assert.equal(button.radius, "8px");
          assert.equal(button.border, "1px");
          assert.equal(button.font, styles.rowAccept.font);
          assert.equal(button.fontSize, styles.rowAccept.fontSize);
          assert.equal(button.weight, styles.rowAccept.weight);
          assert.equal(button.shadow, "none");
          assert.equal(button.color, styles.textColor);
          if (preference === "single-column") assert.equal(button.height, 32);
        }
        assert.equal(styles.rowAccept.background, styles.groupAccept.background);
        assert.equal(styles.rowIgnore.background, styles.groupIgnore.background);
        assert.notEqual(styles.rowAccept.background, styles.rowIgnore.background);
        assert.notEqual(styles.keep.background, styles.groupIgnore.background);
      }
      await $(groupAccept).scrollIntoView({ block: "center" });
      await $(".workspace-ribbon").moveTo();
      const beforeHover = await browser.execute((selector) => {
        const button = document.querySelector(selector);
        if (!button) throw new Error("Accept all missing");
        return getComputedStyle(button).backgroundColor;
      }, groupAccept);
      await $(groupAccept).moveTo();
      await browser.waitUntil(async () => browser.execute((selector, before) => {
        const button = document.querySelector(selector);
        return button !== null && getComputedStyle(button).backgroundColor !== before;
      }, groupAccept, beforeHover));
      await browser.execute((selector) => {
        const button = document.querySelector<HTMLButtonElement>(selector);
        if (!button) throw new Error("Accept all missing");
        button.focus({ preventScroll: true });
      }, groupAccept);
      await browser.keys("Tab");
      const focus = await browser.execute(() => {
        const button = document.activeElement;
        if (!button) throw new Error("Focused button missing");
        const style = getComputedStyle(button);
        return { action: button.getAttribute("data-review-action"), visible: button.matches(":focus-visible"),
          width: style.outlineWidth, outline: style.outlineStyle };
      });
      assert.deepEqual(focus, { action: "keep-both", visible: true, width: "2px", outline: "solid" });
      await browser.saveScreenshot(join(process.cwd(), `e2e-results/review-buttons-${dark ? "dark" : "light"}.png`));
    }
  });

  it("uses the same disabled treatment for row and block acceptance on a read-only target", async () => {
    await chooseLayout("single-column");
    await browser.execute((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Comparison missing");
      const data = new DataTransfer();
      data.items.add(new File(["outside1\noutside2\noutside3\noutside4\n"], "outside.md", { type: "text/markdown" }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
    }, view);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText("outside.md");
    await expect($(accept)).toBeDisabled();
    await expect($(`${view} .file-diff-sbs-group-actions [data-review-action='accept']`)).toBeDisabled();
    const disabled = await browser.execute((selector) => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`${selector} [data-review-action]:disabled`));
      return buttons.map(button => {
        const style = getComputedStyle(button);
        return { opacity: style.opacity, cursor: style.cursor, background: style.backgroundColor };
      });
    }, view);
    assert.ok(disabled.length >= 3);
    for (const button of disabled) {
      assert.equal(button.opacity, "0.5");
      assert.equal(button.cursor, "not-allowed");
      assert.equal(button.background, disabled[0]?.background);
    }
    await expect($(save)).toBeDisabled();
  });

  it("uses compact row controls aligned to opposite edges at phone widths", async () => {
    await replaceFiles("anchor\nnew1\nnew2\nend\n", "anchor\nold1\nold2\nend\n");
    for (const width of [360, 390]) {
      await setWidth(width);
      await expect($(root)).toHaveAttribute("data-layout", "single-column");
      const geometry = await browser.execute((selector) => {
        const actions = document.querySelector<HTMLElement>(`${selector} [data-diff-change='true'] .file-diff-sbs-action-cell`);
        const accept = actions?.querySelector("button[aria-keyshortcuts='Alt+ArrowRight']");
        const ignore = actions?.querySelector("button[aria-keyshortcuts='Alt+ArrowLeft']");
        if (!actions || !accept || !ignore) throw new Error("Row actions missing");
        const row = actions.getBoundingClientRect();
        const left = accept.getBoundingClientRect();
        const right = ignore.getBoundingClientRect();
        const style = getComputedStyle(actions);
        const rowElement = actions.closest(".file-diff-sbs-row");
        const cells = Array.from(rowElement?.querySelectorAll(".file-diff-sbs-cell") ?? []).filter(cell => cell.getBoundingClientRect().height > 0);
        const preceding = cells[cells.length - 1];
        const following = rowElement?.nextElementSibling;
        if (!preceding || !following?.matches(".file-diff-sbs-row")) throw new Error("Adjacent changes missing");
        return { heights: [left.height, right.height], widths: [left.width, right.width], rowHeight: row.height,
          leftInset: left.left - row.left - parseFloat(style.paddingLeft),
          rightInset: row.right - right.right - parseFloat(style.paddingRight),
          margins: [getComputedStyle(accept).marginTop, getComputedStyle(accept).marginBottom,
            getComputedStyle(ignore).marginTop, getComputedStyle(ignore).marginBottom],
          upperGap: left.top - preceding.getBoundingClientRect().bottom,
          lowerGap: following.getBoundingClientRect().top - left.bottom,
          contentBorder: getComputedStyle(preceding).borderBottomWidth };
      }, view);
      assert.ok(geometry.heights.every(height => height >= 31 && height <= 33), "row buttons use a compact 32-pixel height");
      assert.ok(geometry.widths.every(width => width >= 44));
      assert.ok(geometry.rowHeight < 44, "the action row itself must also become shorter");
      assert.ok(Math.abs(geometry.leftInset) <= 1, "Accept stays at the left edge");
      assert.ok(Math.abs(geometry.rightInset) <= 1, "Ignore stays at the right edge");
      assert.deepEqual(geometry.margins, ["3px", "3px", "3px", "3px"]);
      assert.equal(geometry.contentBorder, "0px", "the action strip joins the preceding change without a divider");
      assert.ok(geometry.upperGap >= 3 && geometry.upperGap <= 4);
      assert.ok(geometry.lowerGap >= geometry.upperGap + 4, "extra separation below attaches actions to the change above");
    }
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/compact-row-actions.png"));
  });

  for (const reverse of [false, true]) {
    for (const action of ["Accept all", "Ignore all"]) {
      it(`places ${action} below the block and restores desktop placement (${reverse ? "reverse" : "forward"})`, async () => {
        const count = action === "Accept all" ? 2 : 4;
        const original = Array.from({ length: count }, (_, index) => `new ${String(index)}`).join("\n") + "\n";
        const comparison = Array.from({ length: count }, (_, index) => `old ${String(index)}`).join("\n") + "\n";
        await replaceFiles(original, comparison);
        if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
        await chooseLayout("side-by-side");
        if (count === 2) await expect($(`${view} .file-diff-sbs-group-header`)).not.toExist();
        else assert.equal(await browser.execute((selector) => {
          const group = document.querySelector(`${selector} .file-diff-sbs-group`);
          return group?.firstElementChild?.classList.contains("file-diff-sbs-group-header");
        }, view), true);
        await chooseLayout("single-column");
        await setWidth(390);
        await expectBlockFooter();
        await expect($(`${view} .file-diff-sbs-keep-both`)).toBeDisplayed();
        await chooseLayout("side-by-side");
        if (count === 2) await expect($(`${view} .file-diff-sbs-group-header`)).not.toExist();
        else assert.equal(await browser.execute((selector) => {
          const group = document.querySelector(`${selector} .file-diff-sbs-group`);
          return group?.firstElementChild?.classList.contains("file-diff-sbs-group-header");
        }, view), true);
        await chooseLayout("single-column");
        await expectBlockFooter();
        await $(`${view} .file-diff-sbs-group-actions`).$(`button*=${action}`).click();
        await expect($(progress)).toHaveText(action === "Accept all"
          ? `Open: 0 · Accepted: ${String(count)} · Ignored: 0`
          : `Open: 0 · Accepted: 0 · Ignored: ${String(count)}`);
        await expect($(`${view} .file-diff-sbs-group-header`)).not.toExist();
        assert.equal(await saved("Original.md"), original);
        assert.equal(await saved("Comparison.md"), comparison);
        await $(undo).click();
        await expect($(progress)).toHaveText(`Open: ${String(count)} · Accepted: 0 · Ignored: 0`);
        await expectBlockFooter();
        await expect($(save)).toBeDisabled();
        await browser.saveScreenshot(join(process.cwd(), `e2e-results/block-footer-${count === 2 ? "small" : "large"}-${reverse ? "reverse" : "forward"}.png`));
      });
    }
  }

  it("stacks the initial preview and picker and retains the chosen layout after file selection", async () => {
    const original = await saved("Original.md");
    const comparison = await saved("Comparison.md");
    await obsidianPage.openFile("Original.md");
    await browser.executeObsidianCommand("side-by-side-diff:compare-active-file");
    await setWidth(390);
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await chooseLayout("single-column");
    await expect($(`${view} .file-diff-sbs-single-pane`)).toHaveText(expect.stringContaining("Original wording."));
    const stacked = await browser.execute((selector) => {
      const preview = document.querySelector(`${selector} .file-diff-sbs-single-pane`);
      const picker = document.querySelector(`${selector} .file-diff-sbs-picker-pane`);
      if (!preview || !picker) throw new Error("File-selection panes missing");
      return picker.getBoundingClientRect().top >= preview.getBoundingClientRect().bottom - 1;
    }, view);
    assert.equal(stacked, true);
    await $(`${view} .file-diff-sbs-picker-card button`).click();
    await chooseFile("Comparison.md");
    await expect($(layout)).toHaveAttribute("data-layout-preference", "single-column");
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await expect($(save)).toBeDisabled();
    assert.equal(await saved("Original.md"), original);
    assert.equal(await saved("Comparison.md"), comparison);
  });

  it("persists the layout default through settings without changing an existing comparison", async () => {
    const mainWindow = await browser.getWindowHandle();
    await browser.executeObsidianCommand("app:open-settings");
    const settingsWindow = (await browser.getWindowHandles()).find(handle => handle !== mainWindow);
    if (settingsWindow !== undefined) await browser.switchToWindow(settingsWindow);
    try {
      await $(".vertical-tab-nav-item=Side-by-Side Diff").click();
      const items = await $$(".setting-item").getElements();
      const names = await items.map(item => item.getText());
      const item = items[names.findIndex(name => name.includes("Default comparison layout"))];
      assert.ok(item, "The actual settings UI must expose the layout default");
      await item.$("select").selectByAttribute("value", "single-column");
      await browser.waitUntil(async () => {
        const settings = JSON.parse(await saved(".obsidian/plugins/side-by-side-diff/data.json")) as { defaultLayout?: unknown };
        return settings.defaultLayout === "single-column";
      }, { timeoutMsg: "The layout default was not persisted to plugin settings" });
    } finally {
      if (settingsWindow !== undefined) {
        await browser.closeWindow();
        await browser.switchToWindow(mainWindow);
      } else await $(".modal-close-button").click();
    }
    await expect($(layout)).toHaveAttribute("data-layout-preference", "auto");
    await openComparison();
    await setWidth(1024);
    await expect($(layout)).toHaveAttribute("data-layout-preference", "single-column");
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await expect($(save)).toBeDisabled();
  });

  it("preserves the visible logical row and focused review action during Auto layout transitions", async () => {
    const lines = Array.from({ length: 240 }, (_, index) => `line ${String(index)}`);
    const comparison = lines.slice();
    comparison[70] = "revised line 70";
    comparison[170] = "revised line 170";
    await replaceFiles(lines.join("\n"), comparison.join("\n"));
    await expect($(progress)).toHaveText("Open: 2 · Accepted: 0 · Ignored: 0");
    await setWidth(1024);
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    const before = await browser.execute((selector) => {
      const scroll = document.querySelector<HTMLElement>(`${selector} .file-diff-sbs-scroll`);
      const row = scroll?.querySelector<HTMLElement>("[data-diff-row-index='70']");
      const button = row?.querySelector<HTMLButtonElement>("button[aria-keyshortcuts='Alt+ArrowRight']");
      if (!scroll || !row || !button) throw new Error("Scroll/focus anchors missing");
      scroll.scrollTop += row.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 30;
      button.focus({ preventScroll: true });
      Object.assign(window, { focusedLayoutAction: button });
      const anchor = Array.from(scroll.querySelectorAll<HTMLElement>(".file-diff-sbs-row"))
        .find(candidate => candidate.getBoundingClientRect().bottom > scroll.getBoundingClientRect().top);
      const index = anchor?.dataset.diffRowIndex;
      if (!anchor || index === undefined) throw new Error("Visible row missing");
      return { index, offset: anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top };
    }, view);
    for (const width of [390, 1024]) {
      await setWidth(width);
      await expect($(root)).toHaveAttribute("data-layout", width < 720 ? "single-column" : "side-by-side");
      const after = await browser.execute((selector, index) => {
        const scroll = document.querySelector(`${selector} .file-diff-sbs-scroll`);
        const anchor = scroll?.querySelector(`[data-diff-row-index='${index}']`);
        if (!scroll || !anchor) throw new Error("Logical scroll anchor disappeared");
        return { focused: document.activeElement === Reflect.get(window, "focusedLayoutAction"),
          offset: anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top };
      }, view, before.index);
      assert.equal(after.focused, true, "Moving row controls must retain keyboard focus");
      assert.ok(Math.abs(after.offset - before.offset) <= 2, "The visible row must retain its viewport offset");
    }
    // The deliberately wide test container can place the summary outside the application viewport.
    assert.equal(await browser.execute(selector => document.querySelector(selector)?.textContent, progress),
      "Open: 2 · Accepted: 0 · Ignored: 0");
    await expect($(save)).toBeDisabled();
  });

  for (const reverse of [false, true]) {
    it(`preserves review, undo, navigation and guarded saving across layouts (${reverse ? "reverse" : "forward"})`, async () => {
      const original = "shared\nleft one\nanchor\nleft two\nend\n";
      const comparison = "shared\nright one\nanchor\nright two\nend\n";
      await replaceFiles(original, comparison);
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      await chooseLayout("single-column");
      await expect($(root)).toHaveAttribute("data-layout", "single-column");
      await expect($(progress)).toHaveText("Open: 2 · Accepted: 0 · Ignored: 0");
      assert.equal(await browser.execute((selector) => {
        const row = document.querySelector(`${selector} [data-diff-change='true']`);
        return row?.firstElementChild?.getAttribute("data-role");
      }, view), "target");
      await browser.executeObsidianCommand("side-by-side-diff:next-change");
      await expect($(`${view} .file-diff-sbs-change-position`)).toHaveText("1/2");
      await $(accept).click();
      await $(ignore).click();
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 1");
      await chooseLayout("side-by-side");
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 1");
      assert.equal(await saved("Original.md"), original);
      assert.equal(await saved("Comparison.md"), comparison);
      await $(undo).click();
      await expect($(progress)).toHaveText("Open: 1 · Accepted: 1 · Ignored: 0");
      await chooseLayout("single-column");
      await $(save).click();
      await expect($(progress)).toHaveText("Open: 1 · Accepted: 0 · Ignored: 0");
      assert.equal(await saved(reverse ? "Original.md" : "Comparison.md"), reverse
        ? "shared\nright one\nanchor\nleft two\nend\n" : "shared\nleft one\nanchor\nright two\nend\n");
    });

    it(`keeps both blocks and preserves one-step undo with stacked variants (${reverse ? "reverse" : "forward"})`, async () => {
      await replaceFiles("a\nb\nc\nd\n", "w\nx\ny\nz\n");
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      await chooseLayout("single-column");
      await $(`${view} .file-diff-sbs-keep-both`).click();
      await expect($(progress)).toHaveText("Open: 0 · Accepted: 4 · Ignored: 0");
      await chooseLayout("side-by-side");
      await $(undo).click();
      await expect($(progress)).toHaveText("Open: 4 · Accepted: 0 · Ignored: 0");
      await chooseLayout("single-column");
      await $(`${view} .file-diff-sbs-keep-both`).click();
      await $(save).click();
      await expect($(save)).toBeDisabled();
      assert.equal(await saved(reverse ? "Original.md" : "Comparison.md"), reverse
        ? "a\nb\nc\nd\n\nw\nx\ny\nz\n" : "w\nx\ny\nz\n\na\nb\nc\nd\n");
      await expect($(`${view} .file-diff-sbs-identical-actions`)).not.toExist();
    });

    it(`retains a backward multi-line editor selection and literal target bytes (${reverse ? "reverse" : "forward"})`, async () => {
      const source = "# Source\nsource-only\nend\n";
      const target = "first\r\n\r\n  \r\nhard break  \r\nlast\r\n\r\n";
      await replaceFiles(reverse ? target : source, reverse ? source : target);
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      await setWidth(1024);
      await $(`${view} .file-diff-sbs-file-edit-button`).click();
      const editor = `${view} .file-diff-sbs-document-editor`;
      await expect($(editor)).toBeDisplayed();
      const before = await browser.execute((selector) => {
        const editor = document.querySelector<HTMLElement>(selector);
        const selection = document.getSelection();
        const codes = Array.from(editor?.querySelectorAll(".file-diff-sbs-edit-code") ?? []);
        const start = codes.find(code => code.textContent === "first")?.firstChild;
        const end = codes.find(code => code.textContent === "last")?.firstChild;
        if (!editor || !selection || !start || !end) throw new Error("Editor selection boundaries missing");
        editor.focus();
        selection.setBaseAndExtent(end, 2, start, 1);
        Object.assign(window, { editorLayoutSelection: { editor, anchor: selection.anchorNode, focus: selection.focusNode } });
        return { anchor: selection.anchorOffset, focus: selection.focusOffset, text: selection.toString() };
      }, editor);
      await setWidth(390);
      await expect($(root)).toHaveAttribute("data-layout", "single-column");
      for (const preference of ["side-by-side", "single-column"]) {
        await chooseLayout(preference);
        await expect($(root)).toHaveAttribute("data-layout", preference);
        const after = await browser.execute((selector) => {
          const editor = document.querySelector(selector);
          const selection = document.getSelection();
          const saved = Reflect.get(window, "editorLayoutSelection") as { editor: HTMLElement; anchor: Node; focus: Node };
          if (!editor || !selection) throw new Error("Editor selection disappeared");
          return { sameEditor: editor === saved.editor, sameAnchor: selection.anchorNode === saved.anchor,
            sameFocus: selection.focusNode === saved.focus, anchor: selection.anchorOffset, focus: selection.focusOffset,
            text: selection.toString() };
        }, editor);
        assert.deepEqual(after, { sameEditor: true, sameAnchor: true, sameFocus: true, ...before });
        await expect($(save)).toBeDisabled();
      }
      const targetName = reverse ? "Original.md" : "Comparison.md";
      const sourceName = reverse ? "Comparison.md" : "Original.md";
      assert.equal(await saved(targetName), target, "Presentation changes must not normalize literal file bytes");
      await browser.execute((selector) => {
        const editor = document.querySelector<HTMLElement>(selector);
        const selection = document.getSelection();
        if (!editor || !selection) throw new Error("Editor selection missing");
        editor.focus();
        selection.collapseToEnd();
      }, editor);
      await browser.keys(" inserted");
      await $(save).click();
      await expect($(save)).toBeDisabled();
      assert.equal(await saved(targetName), "first\r\n\r\n  \r\nhard break  \r\nla insertedst\r\n\r\n");
      assert.equal(await saved(sourceName), source);
    });

    it(`copies both variants and staged text without deleted previews (${reverse ? "reverse" : "forward"})`, async () => {
      const source = "shared\nnew value\n\nhard break  \nend\n";
      const target = "shared\nold value\n\nhard break  \nend\n";
      await replaceFiles(reverse ? target : source, reverse ? source : target);
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      await chooseLayout("single-column");
      await expect($(`${view} .file-diff-sbs-copy-select`)).not.toExist();
      assert.equal(await copyWholeComparison(), "shared\nold value\nnew value\n\nhard break  \nend");
      await $(accept).click();
      await expect($(`${view} [data-diff-pending='delete'] .file-diff-sbs-code`)).toHaveText("old value");
      assert.equal(await copyWholeComparison(), "shared\nnew value\n\nhard break  \nend");
      assert.equal(await saved(reverse ? "Original.md" : "Comparison.md"), target);
      assert.equal(await saved(reverse ? "Comparison.md" : "Original.md"), source);
      await $(undo).click();
      await expect($(`${view} [data-diff-pending='delete']`)).not.toExist();
      assert.equal(await copyWholeComparison(), "shared\nold value\nnew value\n\nhard break  \nend");
      await expect($(save)).toBeDisabled();
    });
  }

  for (const choice of ["Save", "Don't save"]) {
    it(`opens the editor with staged changes only after choosing ${choice}, then switches layout`, async () => {
      const original = await saved("Original.md");
      const comparison = await saved("Comparison.md");
      await $(accept).click();
      await chooseLayout("side-by-side");
      await expect($(".modal-title")).not.toExist();
      await $(`${view} .file-diff-sbs-file-edit-button`).click();
      await expect($(".modal-title")).toHaveText("Unsaved changes");
      assert.equal(await saved("Comparison.md"), comparison);
      await $(".file-diff-sbs-unsaved-actions").$(`button=${choice}`).click();
      await expect($(".modal-title")).not.toExist();
      await expect($(`${view} .file-diff-sbs-document-editor`)).toBeDisplayed();
      await chooseLayout("single-column");
      await expect($(root)).toHaveAttribute("data-layout", "single-column");
      await expect($(save)).toBeDisabled();
      assert.equal(await saved("Comparison.md"), choice === "Save" ? original : comparison);
      assert.equal(await saved("Original.md"), original);
    });
  }

  it("follows container width and keeps controls visible at phone and tablet sizes", async () => {
    for (const width of [360, 390, 600, 719, 720, 768, 1024]) {
      await setWidth(width);
      await expect($(root)).toHaveAttribute("data-layout", width < 720 ? "single-column" : "side-by-side");
      if (width < 720) {
        const dimensions = await browser.execute((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          const scroll = element?.querySelector<HTMLElement>(".file-diff-sbs-scroll");
          const button = element?.querySelector<HTMLElement>("button[aria-keyshortcuts='Alt+ArrowRight']");
          if (!element || !scroll || !button) throw new Error("Comparison controls missing");
          return { scroll: scroll.scrollWidth, client: scroll.clientWidth, button: button.getBoundingClientRect().width };
        }, view);
        assert.ok(dimensions.scroll <= dimensions.client + 1, `no horizontal overflow at ${String(width)}`);
        assert.ok(dimensions.button >= 44, "touch target width");
      }
    }
    await setWidth(390);
    await chooseLayout("side-by-side");
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/layout-explicit.png"));
  });

  it("copies both visible variants through shared rows and excludes labels, previews and hidden duplicates", async () => {
    await replaceFiles("first shared\nleft  \n\nanchor\nleft tail\n", "first shared\nright\n\nanchor\nright tail\n");
    await setWidth(390);
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    for (const side of ["left", "right"]) {
      const copied = await browser.execute((selector, side) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error("Comparison missing");
        const codes = Array.from(element.querySelectorAll<HTMLElement>(".file-diff-sbs-code"));
        const start = codes.find(code => code.dataset.diffShared === "true" && code.closest<HTMLElement>(".file-diff-sbs-cell")?.dataset.role === "target");
        const end = codes.slice().reverse().find(code => code.dataset.diffSide === side && code.dataset.diffPresent === "true");
        if (!start?.firstChild || !end?.firstChild) throw new Error("Copy boundaries missing");
        const range = document.createRange();
        range.setStart(start.firstChild, 6);
        range.setEnd(end.firstChild.firstChild ?? end.firstChild, 4);
        const selection = document.getSelection();
        if (!selection) throw new Error("Selection missing");
        selection.removeAllRanges();
        selection.addRange(range);
        const clipboardData = new DataTransfer();
        const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData });
        document.dispatchEvent(event);
        return { value: clipboardData.getData("text/plain"), prevented: event.defaultPrevented };
      }, view, side);
      assert.equal(copied.value, side === "left" ? "shared\nright\nleft  \n\nanchor\nright tail\nleft" : "shared\nright\nleft  \n\nanchor\nrigh");
      assert.equal(copied.prevented, true);
    }
    const wholeProjection = await browser.execute((selector) => {
      const grid = document.querySelector(`${selector} .file-diff-sbs-grid`);
      const selection = document.getSelection();
      if (!grid || !selection) throw new Error("Comparison selection missing");
      const range = document.createRange();
      range.selectNodeContents(grid);
      selection.removeAllRanges();
      selection.addRange(range);
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data }));
      return data.getData("text/plain");
    }, view);
    assert.equal(wholeProjection, "first shared\nright\nleft  \n\nanchor\nright tail\nleft tail");
    await browser.saveScreenshot(join(process.cwd(), "e2e-results/layout-single-column.png"));
  });

  it("restores an explicit layout independently of Auto and preserves its file roles", async () => {
    await chooseLayout("single-column");
    await setWidth(1024);
    const restored = await browser.executeObsidian(async ({ app }) => {
      const comparison = app.workspace.getLeavesOfType("side-by-side-diff-view")[0];
      if (!comparison) throw new Error("Comparison missing");
      const state = comparison.view.getState();
      const next = app.workspace.getLeaf(true);
      await next.setViewState({ type: "side-by-side-diff-view", active: true, state });
      return next.view.getState();
    });
    assert.equal(restored.layout, "single-column");
    assert.equal(restored.leftPath, "Original.md");
    assert.equal(restored.rightPath, "Comparison.md");
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
    await expect($(layout)).toHaveAttribute("data-layout-preference", "single-column");
  });

  it("copies both variants in native mouse selections starting in shared text", async () => {
    await replaceFiles("Start shared\nleft\nEnd shared\n", "Start shared\nright\nEnd shared\n");
    await chooseLayout("single-column");
    const points = await browser.execute((selector) => {
      const codes = Array.from(document.querySelectorAll(`${selector} [data-role='target'] .file-diff-sbs-code[data-diff-shared='true']`));
      const start = codes[0]?.firstChild;
      const end = codes[codes.length - 1]?.firstChild;
      if (!start || !end) throw new Error("Selection anchors missing");
      const range = document.createRange();
      range.setStart(start, 0);
      range.collapse(true);
      const first = range.getBoundingClientRect();
      range.setStart(end, end.textContent?.length ?? 0);
      range.collapse(true);
      const last = range.getBoundingClientRect();
      return { start: { x: Math.round(first.left + 1), y: Math.round(first.top + first.height / 2) },
        end: { x: Math.round(last.left + 1), y: Math.round(last.top + last.height / 2) } };
    }, view);
    await browser.action("pointer").move(points.start).down().move({ ...points.end, duration: 500 }).up().perform();
    const copied = await browser.execute(() => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data }));
      return { selection: document.getSelection()?.toString(), text: data.getData("text/plain") };
    });
    assert.ok(copied.selection);
    assert.equal(copied.text, "Start shared\nright\nleft\nEnd shared");
    assert.ok(copied.selection.includes("right"));
    assert.ok(copied.selection.includes("left"));
  });

  it("retains staged content and its original save baseline after layout changes and an external edit", async () => {
    await $(accept).click();
    await chooseLayout("single-column");
    const external = "Changed elsewhere.\n";
    await obsidianPage.write("Comparison.md", external);
    await chooseLayout("side-by-side");
    await chooseLayout("single-column");
    await $(save).click();
    await expect($(".notice-container")).toHaveText(expect.stringContaining("Saving was canceled to prevent overwriting it."));
    await expect($(save)).toBeEnabled();
    await expect($(progress)).toHaveText("Open: 0 · Accepted: 1 · Ignored: 0");
    assert.equal(await saved("Comparison.md"), external);
  });

  it("labels a dropped external snapshot by filename and respects the actual target's permissions", async () => {
    await chooseLayout("single-column");
    await browser.execute((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Comparison missing");
      const data = new DataTransfer();
      data.items.add(new File(["outside text\n"], "outside.md", { type: "text/markdown" }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
    }, view);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText("outside.md");
    await expect($(`${view} [data-role='target'] .file-diff-sbs-variant-label`)).toHaveText("Target · will be changed · outside.md");
    await expect($(accept)).toBeDisabled();
    await expect($(`${view} .file-diff-sbs-file-edit-button`)).toBeDisabled();
    await $(`${view} .file-diff-sbs-direction-button`).click();
    await expect($(`${view} [data-role='source'] .file-diff-sbs-variant-label`)).toHaveText("Source · outside.md");
    await expect($(accept)).toBeEnabled();
    await expect($(`${view} .file-diff-sbs-file-edit-button`)).toBeEnabled();
    await chooseLayout("side-by-side");
    await chooseLayout("single-column");
    await expect($(accept)).toBeEnabled();
  });

  it("retains fixed proposal direction and saves only the proposal through layout changes", async () => {
    await obsidianPage.openFile("Original.md");
    const original = await saved("Original.md");
    await browser.executeObsidianCommand("side-by-side-diff:propose-changes");
    const editor = `${view} .file-diff-sbs-document-editor`;
    await expect($(editor)).toBeDisplayed();
    await chooseLayout("single-column");
    await expect($(`${view} .file-diff-sbs-direction-button`)).not.toExist();
    const proposal = await $(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`).getText();
    assert.ok(proposal.startsWith("Original_changes_"));
    await $(editor).click();
    await browser.keys(" proposal");
    await chooseLayout("side-by-side");
    await chooseLayout("single-column");
    await $(save).click();
    await expect($(save)).toBeDisabled();
    assert.equal(await saved("Original.md"), original);
    assert.ok((await saved(proposal)).includes(" proposal"));
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText("Original.md");
    await expect($(`${view} .file-diff-sbs-direction-button`)).not.toExist();
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
  });

  it("defers responsive layout changes until composition ends without replacing the editor", async () => {
    await setWidth(1024);
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    await $(`${view} .file-diff-sbs-file-edit-button`).click();
    await browser.execute((selector) => {
      const editor = document.querySelector(`${selector} .file-diff-sbs-document-editor`);
      if (!editor) throw new Error("Editor missing");
      Object.assign(window, { compositionTestEditor: editor });
      editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "中" }));
    }, view);
    await setWidth(390);
    await browser.execute(async () => {
      await new Promise<void>(done => { requestAnimationFrame(() => { requestAnimationFrame(() => { done(); }); }); });
    });
    await expect($(root)).toHaveAttribute("data-layout", "side-by-side");
    const same = await browser.execute((selector) => {
      const editor = document.querySelector(`${selector} .file-diff-sbs-document-editor`);
      if (!editor) throw new Error("Editor missing");
      editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中" }));
      return Reflect.get(window, "compositionTestEditor") === editor;
    }, view);
    assert.equal(same, true);
    await expect($(root)).toHaveAttribute("data-layout", "single-column");
  });

  for (const reverse of [false, true]) {
    it(`keeps the live target editor, text, selection and undo while resizing and switching (${reverse ? "reverse" : "forward"})`, async () => {
      if (reverse) await $(`${view} .file-diff-sbs-direction-button`).click();
      const sourceName = reverse ? "Comparison.md" : "Original.md";
      const targetName = reverse ? "Original.md" : "Comparison.md";
      const sourceContent = await saved(sourceName);
      await chooseLayout("side-by-side");
      await $(`${view} .file-diff-sbs-file-edit-button`).click();
      await chooseLayout("single-column");
      const editor = `${view} .file-diff-sbs-document-editor`;
      await expect($(editor)).toBeDisplayed();
      await browser.execute((selector) => {
        const editor = document.querySelector<HTMLElement>(selector);
        if (!editor) throw new Error("Editor missing");
        // Store identity only in this temporary test window.
        Object.assign(window, { layoutTestEditor: editor });
        editor.focus();
        const code = editor.querySelector(".file-diff-sbs-edit-code");
        if (!code) throw new Error("Editor line missing");
        const range = document.createRange();
        range.selectNodeContents(code);
        range.collapse(false);
        const selection = document.getSelection();
        if (!selection) throw new Error("Selection missing");
        selection.removeAllRanges();
        selection.addRange(range);
      }, editor);
      await browser.keys(" typed");
      await expect($(save)).toBeEnabled();
      await chooseLayout("auto");
      for (const width of [390, 1024, 390]) await setWidth(width);
      await expect($(root)).toHaveAttribute("data-layout", "single-column");
      const identity = await browser.execute((selector) => {
        const editor = document.querySelector<HTMLElement>(selector);
        if (!editor) throw new Error("Editor missing");
        return { same: Reflect.get(window, "layoutTestEditor") === editor, text: editor.textContent };
      }, editor);
      assert.equal(identity.same, true);
      assert.ok(identity.text.includes(" typed"));
      await $(`${view} .file-diff-sbs-reference-toggle`).click();
      await expect($(`${view} .file-diff-sbs-edit-reference-pane`)).not.toBeDisplayed();
      await $(editor).click();
      await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "z"]);
      await expect($(editor)).not.toHaveText(expect.stringContaining(" typed"));
      await browser.keys(" saved");
      await $(save).click();
      await expect($(save)).toBeDisabled();
      assert.equal(await saved(sourceName), sourceContent);
      assert.ok((await saved(targetName)).includes(" saved"));
      await browser.saveScreenshot(join(process.cwd(), `e2e-results/layout-editor-${reverse ? "reverse" : "forward"}.png`));
    });
  }
});
