import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { $, browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import type { ObsidianCapabilityOptions } from "wdio-obsidian-service";

const runCli = promisify(execFile);
const setup = ".file-diff-sbs-agent-modal";
const cliPanel = ".file-diff-sbs-agent-cli";
const preview = `${setup} .file-diff-sbs-agent-preview`;
const view = ".workspace-leaf.mod-active .file-diff-sbs-view";
const viewType = "side-by-side-diff-view";
const marker = "<!-- side-by-side-diff:agent-instructions:start -->";

function vaultPath(path: string): string {
  return join(obsidianPage.getVaultPath(), path);
}

async function openIntroSetup(): Promise<void> {
  await browser.executeObsidianCommand("side-by-side-diff:show-introduction");
  const intro = $(".file-diff-sbs-introduction-modal");
  const next = intro.$(".file-diff-sbs-introduction-actions .mod-cta");
  for (let step = 0; step < 4; step += 1) {
    await next.click();
  }
  await expect(intro.$("h3")).toHaveText("Thank you");
  await intro.$("button=Set up").click();
  await expect($(preview)).toBeDisplayed();
}

/** Uses the bundled CLI with the test runner's isolated socket on Linux. */
async function connectCli(vault: string): Promise<(...args: string[]) => Promise<string>> {
  if (process.platform !== "linux") {
    // The WebDriver helper invokes the CLI parser for the connected window.
    return async (...args) => (await obsidianPage.runObsidianCli(args)).stdout;
  }
  const capabilities = browser.requestedCapabilities as { "wdio:obsidianOptions"?: ObsidianCapabilityOptions };
  const binary = capabilities["wdio:obsidianOptions"]?.binaryPath;
  assert.ok(binary);
  const runtime = process.env.XDG_RUNTIME_DIR;
  assert.ok(runtime !== undefined && runtime.includes("sbs-obsidian-runtime-"), "run the CLI test with scripts/run-obsidian-tests.mjs");
  const socket = join(runtime, ".obsidian-cli.sock");
  await browser.waitUntil(async () => {
    try {
      return (await stat(socket)).isSocket();
    } catch {
      return false;
    }
  }, { timeoutMsg: "The isolated Obsidian CLI socket did not start." });
  return async (...args) => {
    const { stdout } = await runCli(join(dirname(binary), "obsidian-cli"), [`vault=${vault}`, ...args], {
      cwd: obsidianPage.getVaultPath(), timeout: 10_000
    });
    return stdout;
  };
}

describe("agent support in Obsidian", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "tests/e2e/vault" });
    await writeFile(vaultPath(".obsidian/plugins/side-by-side-diff/data.json"), JSON.stringify({
      language: "en", introductionSeen: true, defaultLayout: "side-by-side",
      defaultApplyDirection: "right-to-left", changeCopySuffix: "_review_"
    }));
    await obsidianPage.enablePlugin("side-by-side-diff");
    await browser.executeObsidian(({ require }) => {
      const remote = require("@electron/remote") as { getCurrentWindow(): { setSize(width: number, height: number): void } };
      remote.getCurrentWindow().setSize(1440, 1000);
    });
  });

  it("offers to create AGENTS.md from the introduction and writes only after confirmation", async () => {
    await openIntroSetup();
    await expect($(cliPanel).$("a")).toHaveAttribute("href", "https://obsidian.md/help/cli");
    const supportsCli = await browser.executeObsidian(({ obsidian }) => obsidian.requireApiVersion("1.12.2"));
    await expect($(cliPanel)).toHaveAttribute("data-cli-status", supportsCli ? "enabled" : "unavailable");
    await expect($(setup).$("button=Create file")).toBeDisplayed();
    await expect($(preview)).toHaveText(expect.stringContaining("Plan_review_20261120-143000.md"));
    await expect($(preview)).toHaveText(expect.stringContaining("help side-by-side-diff:review"));
    await $(setup).$("button=Cancel").click();
    await assert.rejects(readFile(vaultPath("AGENTS.md")), { code: "ENOENT" });
    await $(".file-diff-sbs-introduction-modal").$("button=Set up").click();
    await $(setup).$("button=Create file").click();
    await expect($(setup)).not.toExist();
    const instructions = await readFile(vaultPath("AGENTS.md"), "utf8");
    assert.ok(instructions.startsWith(marker));
    assert.ok(instructions.includes("side-by-side-diff:review"));

    await $(".file-diff-sbs-introduction-modal").$("button=Set up").click();
    await expect($(setup).$("button=Close")).toBeDisplayed();
    assert.equal(await readFile(vaultPath("AGENTS.md"), "utf8"), instructions);
  });

  it("offers a file choice from settings, refreshes stale previews, and updates only its own section", async () => {
    await browser.executeObsidian(async ({ app }, agents, claude) => {
      await app.vault.create("AGENTS.md", agents);
      await app.vault.create("CLAUDE.md", claude);
    }, "# Vault rules\n", "# Claude rules\n");
    const mainWindow = await browser.getWindowHandle();
    await browser.executeObsidianCommand("app:open-settings");
    const settingsWindow = (await browser.getWindowHandles()).find(handle => handle !== mainWindow);
    if (settingsWindow !== undefined) await browser.switchToWindow(settingsWindow);
    await $(".vertical-tab-nav-item=Side-by-Side Diff").click();
    // Legacy Obsidian renders a button, while declarative settings make the row clickable.
    const legacy = $(".vertical-tab-content").$("button=Set up");
    if (await legacy.isExisting()) await legacy.click();
    else await $(".vertical-tab-content").$(".setting-item-name=Set up agent instructions").click();
    const setupWindow = (await browser.getWindowHandles()).find(handle => handle !== mainWindow && handle !== settingsWindow);
    if (setupWindow !== undefined) await browser.switchToWindow(setupWindow);
    if (!(await $(setup).isExisting()) && settingsWindow !== undefined) await browser.switchToWindow(mainWindow);
    await expect($(preview)).toBeDisplayed();
    await $(`${setup} select`).selectByAttribute("value", "CLAUDE.md");
    await expect($(setup)).toHaveText(expect.stringContaining("Add these instructions to CLAUDE.md?"));

    const concurrent = "# Claude rules\n\nThis arrived after the preview.  \n";
    await writeFile(vaultPath("CLAUDE.md"), concurrent);
    await $(setup).$("button=Add instructions").click();
    await expect($(`${setup} [role=status]`)).toHaveText(expect.stringContaining("The instruction file changed."));
    assert.equal(await readFile(vaultPath("CLAUDE.md"), "utf8"), concurrent);
    await $(setup).$("button=Add instructions").click();
    await expect($(setup)).not.toExist();
    const installed = await readFile(vaultPath("CLAUDE.md"), "utf8");
    assert.ok(installed.startsWith(concurrent + "\n" + marker));
    assert.equal(await readFile(vaultPath("AGENTS.md"), "utf8"), "# Vault rules\n");

    const old = installed.replaceAll("Plan_review_", "Plan_old_") + "\n## More rules\nKeep this.\n";
    await writeFile(vaultPath("CLAUDE.md"), old);
    if (settingsWindow !== undefined) {
      await browser.switchToWindow(settingsWindow);
      await browser.closeWindow();
      await browser.switchToWindow(mainWindow);
    } else {
      await browser.keys("Escape");
    }
    await openIntroSetup();
    await $(`${setup} select`).selectByAttribute("value", "CLAUDE.md");
    await $(setup).$("button=Update instructions").click();
    await expect($(setup)).not.toExist();
    assert.equal(await readFile(vaultPath("CLAUDE.md"), "utf8"), installed + "\n## More rules\nKeep this.\n");
  });

  it("uses the indexed spelling of an instruction file on a case-insensitive filesystem", async () => {
    await browser.executeObsidian(async ({ app }) => {
      await app.vault.create("claude.md", "# Claude rules\n");
      const adapter = app.vault.adapter;
      const stat = adapter.stat.bind(adapter);
      // Emulate the case-insensitive adapter on the Linux test host.
      adapter.stat = path => stat(path === "CLAUDE.md" ? "claude.md" : path);
    });
    await openIntroSetup();
    await expect($(setup)).toHaveText(expect.stringContaining("Add these instructions to claude.md?"));
    await $(setup).$("button=Add instructions").click();
    await expect($(setup)).not.toExist();
    assert.match(await readFile(vaultPath("claude.md"), "utf8"), /# Claude rules\n\n<!-- side-by-side-diff:agent-instructions:start -->/u);
    await assert.rejects(readFile(vaultPath("AGENTS.md")), { code: "ENOENT" });
  });

  it("removes the create action if a conflicting disk file is absent from the vault index", async () => {
    await openIntroSetup();
    await browser.executeObsidian(({ app }) => {
      const adapter = app.vault.adapter;
      const stat = adapter.stat.bind(adapter);
      // Model an adapter which sees a new file before Obsidian indexes it.
      adapter.stat = path => stat(path === "AGENTS.md" ? "Original.md" : path);
      const exists = adapter.exists.bind(adapter);
      adapter.exists = (path, sensitive) => exists(path === "AGENTS.md" ? "Original.md" : path, sensitive);
    });
    await $(setup).$("button=Create file").click();
    await expect($(`${setup} [role=status]`)).toHaveText(expect.stringContaining("read AGENTS.md"));
    await expect($(`${setup} [data-file-diff-status=error]`)).toBeDisplayed();
    await expect($(setup).$("button=Create file")).not.toExist();
  });

  it("shows progress during an instruction write, a failure, and success after retry", async () => {
    await openIntroSetup();
    await browser.executeObsidian(({ app }) => {
      const create = app.vault.create.bind(app.vault);
      let fail = true;
      app.vault.create = async (path, data, options) => {
        if (path === "AGENTS.md" && fail) {
          fail = false;
          await new Promise<void>(resolve => { setTimeout(resolve, 1500); });
          throw new Error("Simulated test-vault write failure.");
        }
        return create(path, data, options);
      };
    });
    const create = $(setup).$("button=Create file");
    await create.click();
    const progress = $(`${setup} [data-file-diff-status=progress]`);
    await expect(progress).toHaveText("Saving agent instructions to AGENTS.md…");
    const progressColor = await progress.getCSSProperty("border-left-color");
    const error = $(`${setup} [data-file-diff-status=error]`);
    await expect(error).toHaveText("Could not write AGENTS.md.");
    assert.notEqual((await error.getCSSProperty("border-left-color")).value, progressColor.value);
    await assert.rejects(readFile(vaultPath("AGENTS.md")), { code: "ENOENT" });
    await create.click();
    await expect($(setup)).not.toExist();
    const success = $(".notice [data-file-diff-status=success]");
    await expect(success).toHaveText("Agent instructions saved to AGENTS.md.");
    assert.match(await readFile(vaultPath("AGENTS.md"), "utf8"), /side-by-side-diff:agent-instructions:start/u);
  });

  it("guides users to the live CLI toggle and sees the updated status after they turn it on", async function () {
    if (process.env.OBSIDIAN_INSTALLER_VERSION === undefined) this.skip();
    await browser.executeObsidian(({ require }) => {
      const { ipcRenderer } = require("electron") as { ipcRenderer: { sendSync(channel: string, value: boolean): unknown } };
      ipcRenderer.sendSync("cli", false);
    });
    const mainWindow = await browser.getWindowHandle();
    await openIntroSetup();
    await expect($(cliPanel)).toHaveAttribute("data-cli-status", "disabled");
    await expect($(cliPanel)).toHaveText(expect.stringContaining("Settings → General → Advanced"));
    await $(cliPanel).$("button=Open General settings").click();
    await expect($(setup)).not.toExist();
    const settingsWindow = (await browser.getWindowHandles()).find(handle => handle !== mainWindow);
    if (settingsWindow !== undefined) await browser.switchToWindow(settingsWindow);
    const toggle = $("//div[contains(@class, 'setting-item-name') and normalize-space()='Command line interface']/../..").$(".checkbox-container");
    await expect(toggle).toBeDisplayed();
    await toggle.click();
    // The native registration prompt can be skipped in a test vault.
    await $("button=Skip").click();
    if (settingsWindow !== undefined) {
      await browser.closeWindow();
      await browser.switchToWindow(mainWindow);
    } else {
      await browser.keys("Escape");
    }
    await $(".file-diff-sbs-introduction-modal").$("button=Set up").click();
    await expect($(cliPanel)).toHaveAttribute("data-cli-status", "enabled");
    await expect($(cliPanel)).toHaveText(expect.stringContaining("verify CLI registration"));
  });

  it("reports the original side of a legacy acceptance view before and after swap", async () => {
    const leafState = () => browser.executeObsidian(({ app }, type) => {
      const state = app.workspace.getLeavesOfType(type)[0]?.getViewState().state;
      return { leftPath: state?.leftPath, rightPath: state?.rightPath, originalSide: state?.originalSide };
    }, viewType);
    await browser.executeObsidian(async ({ app }, type) => {
      await app.workspace.getLeaf(true).setViewState({ type, active: true, state: {
        mode: "accept", leftPath: "Comparison.md", rightPath: "Original.md", originalSide: "left"
      } });
    }, viewType);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-side-label`)).toHaveText("Original");
    assert.deepEqual(await leafState(), { leftPath: "Comparison.md", rightPath: "Original.md", originalSide: "right" });
    await $(`${view} button[data-review-action='ignore']`).click();
    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-side-label`)).toHaveText("Original");
    assert.deepEqual(await leafState(), { leftPath: "Original.md", rightPath: "Comparison.md", originalSide: "left" });
    if (process.env.OBSIDIAN_INSTALLER_VERSION !== undefined) {
      const vault = await browser.executeObsidian(({ app }) => app.vault.getName());
      const run = await connectCli(vault);
      const output = await run("side-by-side-diff:review", "original=Original.md", "proposal=Comparison.md");
      assert.deepEqual(JSON.parse(output), { ok: true, action: "review", vault,
        left: "Original.md", right: "Comparison.md", originalSide: "left", reused: true });
    }
    await expect($(`${view} [data-review-status='ignored']`)).toBeDisplayed();
  });

  it("takes paths through Obsidian's CLI and keeps proposal edits staged until save", async function () {
    if (process.env.OBSIDIAN_INSTALLER_VERSION === undefined) this.skip();
    const vault = await browser.executeObsidian(({ app }) => app.vault.getName());
    const original = "Original.md";
    const proposal = "Different proposal 100%.md";
    const originalContent = await readFile(vaultPath(original), "utf8");
    const partialContent = originalContent.replace("# Review", "# Revised review");
    const proposalContent = partialContent.replace("Original wording.", "Suggested wording.");
    const run = await connectCli(vault);
    const help = await run("help", "side-by-side-diff:review");
    assert.match(help, /original/u);
    assert.match(help, /proposal/u);
    assert.match(help, /side.*original-left\|original-right/u);
    const updateLanguage = (language: string) => browser.executeObsidian(({ app }, locale) => {
      const { plugins } = app as unknown as { plugins: { getPlugin(id: string): { updateLanguage(preference: string): void } } };
      plugins.getPlugin("side-by-side-diff").updateLanguage(locale);
    }, language);
    await updateLanguage("de");
    const germanHelp = await run("help", "side-by-side-diff:review");
    assert.match(germanHelp, /Vorschlag zur Prüfung öffnen/u);
    assert.match(germanHelp, /Seite des Originals/u);
    await updateLanguage("en");
    assert.equal(await run("help", "side-by-side-diff:review"), help);
    const cli = async (...args: string[]): Promise<unknown> => JSON.parse(await run(...args)) as unknown;
    await writeFile(vaultPath(proposal), proposalContent);

    const reviewArgs = ["side-by-side-diff:review", `original=${original}`, `proposal=${proposal}`];
    const paths = { left: proposal, right: original, originalSide: "right" };
    const opened = { ok: true, action: "review", vault, ...paths };
    const status = (open: number, accepted: number, ignored: number, hasUnsavedChanges: boolean) => ({
      ok: true, vault, views: [{ ...paths, mode: "review", counts: { open, accepted, ignored }, hasUnsavedChanges }]
    });
    assert.deepEqual(await cli("side-by-side-diff:status"), { ok: true, vault, views: [] });
    await browser.executeObsidian(({ app }, pendingPath) => {
      const { vault } = app;
      const lookup = vault.getAbstractFileByPath.bind(vault);
      const exists = vault.adapter.exists.bind(vault.adapter);
      // Hold back the indexed entry until the CLI has seen the on-disk file.
      vault.getAbstractFileByPath = path => path === pendingPath ? null : lookup(path);
      vault.adapter.exists = async (path, sensitive) => {
        const found = await exists(path, sensitive);
        if (path === pendingPath && found) {
          setTimeout(() => {
            vault.getAbstractFileByPath = lookup;
            vault.adapter.exists = exists;
          }, 150);
        }
        return found;
      };
    }, proposal);
    assert.deepEqual(await cli(...reviewArgs), { ...opened, reused: false });
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText(proposal);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText(original);
    assert.deepEqual(await cli("side-by-side-diff:status"), status(2, 0, 0, false));
    assert.equal(await readFile(vaultPath(original), "utf8"), originalContent);
    assert.equal(await readFile(vaultPath(proposal), "utf8"), proposalContent);
    await $(`${view} button[aria-keyshortcuts='Alt+ArrowRight']`).click();
    await expect($(`${view} [data-review-status='accepted']`)).toBeDisplayed();
    await $(`${view} button[data-review-action='ignore']`).click();
    await expect($(`${view} [data-review-status='ignored']`)).toBeDisplayed();
    await browser.executeObsidian(async ({ app }, path) => {
      const file = app.vault.getFileByPath(path);
      if (file === null) throw new Error("Original unavailable");
      await app.workspace.getLeaf(true).openFile(file);
    }, original);
    assert.deepEqual(await cli("side-by-side-diff:status"), status(0, 1, 1, true));
    await expect($(view)).not.toExist();
    assert.deepEqual(await cli(...reviewArgs, "side=original-left"), { ...opened, reused: true });
    await expect($(`${view} [data-review-status='accepted']`)).toBeDisplayed();
    assert.deepEqual(await cli("side-by-side-diff:status"), status(0, 1, 1, true));
    assert.equal(await readFile(vaultPath(original), "utf8"), originalContent);
    await $(`${view} .file-diff-sbs-save-action`).click();
    await browser.waitUntil(async () => await readFile(vaultPath(original), "utf8") === partialContent);
    assert.equal(await readFile(vaultPath(proposal), "utf8"), proposalContent);
    await expect($(`${view} .file-diff-sbs-save-action`)).toBeDisabled();
    assert.deepEqual(await cli("side-by-side-diff:status"), status(0, 0, 1, false));

    assert.deepEqual(await cli("side-by-side-diff:compare", `left=${original}`, `right=${proposal}`),
      { ok: true, action: "compare", vault, left: original, right: proposal });
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-file-name`)).toHaveText(original);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-file-name`)).toHaveText(proposal);
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-role-source`)).toBeDisplayed();
    const openDiffs = await cli("side-by-side-diff:status") as ReturnType<typeof status>;
    assert.equal(openDiffs.views.length, 2);
    assert.deepEqual(openDiffs.views.find(entry => entry.mode === "compare"), {
      mode: "compare", left: original, right: proposal, originalSide: "left",
      counts: { open: 1, accepted: 0, ignored: 0 }, hasUnsavedChanges: false
    });

    assert.deepEqual(await cli("side-by-side-diff:review", `original=${original}`, "proposal=Other.md"),
      { ok: false, error: "file_not_found", argument: "proposal" });
    assert.deepEqual(await cli("side-by-side-diff:review", `original=${original}`),
      { ok: false, error: "missing_path", argument: "proposal" });
    assert.deepEqual(await cli(...reviewArgs, "side=left"), { ok: false, error: "invalid_side", argument: "side" });
    assert.deepEqual(await cli("side-by-side-diff:compare", `left=${original}`, `right=${original}`),
      { ok: false, error: "same_file" });
    assert.deepEqual(await cli("side-by-side-diff:compare", `left=${original}`, "right=../Other.md"),
      { ok: false, error: "invalid_path", argument: "right" });
    await browser.executeObsidian(async ({ app }) => { await app.vault.createBinary("Image.png", new ArrayBuffer(0)); });
    assert.deepEqual(await cli("side-by-side-diff:compare", `left=${original}`, "right=Image.png"),
      { ok: false, error: "not_a_text_file", argument: "right" });
  });

  it("opens the original on the left, keeps its identity through swap, and saves into it", async function () {
    if (process.env.OBSIDIAN_INSTALLER_VERSION === undefined) this.skip();
    const vault = await browser.executeObsidian(({ app }) => app.vault.getName());
    const original = "Original.md";
    const proposal = "Original_review_20261120-143000.md";
    const originalContent = await readFile(vaultPath(original), "utf8");
    const proposalContent = originalContent.replace("Original wording.", "Suggested wording.");
    const run = await connectCli(vault);
    const cli = async (...args: string[]): Promise<unknown> => JSON.parse(await run(...args)) as unknown;
    await writeFile(vaultPath(proposal), proposalContent);

    const reviewArgs = ["side-by-side-diff:review", `original=${original}`, `proposal=${proposal}`, "side=original-left"];
    const status = "side-by-side-diff:status";
    const left = { left: original, right: proposal, originalSide: "left" };
    const right = { left: proposal, right: original, originalSide: "right" };
    const opening = { ok: true, action: "review", vault };
    const initialStatus = { mode: "review", counts: { open: 1, accepted: 0, ignored: 0 }, hasUnsavedChanges: false };
    assert.deepEqual(await cli(...reviewArgs), { ...opening, ...left, reused: false });
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-side-label`)).toHaveText("Original");
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-role-target`)).toBeDisplayed();
    assert.deepEqual(await cli(status), { ok: true, vault, views: [{ ...initialStatus, ...left }] });

    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-side-label`)).toHaveText("Original");
    await expect($(`${view} .file-diff-sbs-right-file .file-diff-sbs-role-target`)).toBeDisplayed();
    assert.deepEqual(await cli(status), { ok: true, vault, views: [{ ...initialStatus, ...right }] });
    assert.deepEqual(await cli(...reviewArgs), { ...opening, ...right, reused: true });

    await $(`${view} .file-diff-sbs-swap-button`).click();
    await expect($(`${view} .file-diff-sbs-left-file .file-diff-sbs-role-target`)).toBeDisplayed();
    await $(`${view} button[aria-keyshortcuts='Alt+ArrowRight']`).click();
    await expect($(`${view} [data-review-status='accepted']`)).toBeDisplayed();
    assert.equal(await readFile(vaultPath(original), "utf8"), originalContent);
    await $(`${view} .file-diff-sbs-save-action`).click();
    await browser.waitUntil(async () => await readFile(vaultPath(original), "utf8") === proposalContent);
    await expect($(".modal .modal-title")).toHaveText("Delete change copy?");
    await expect($(".modal .modal-content")).toHaveText(expect.stringContaining(proposal));
    await $(".modal").$("button=Cancel").click();
    await browser.executeObsidian(({ app }, type) => { app.workspace.detachLeavesOfType(type); }, viewType);
    assert.equal(await readFile(vaultPath(proposal), "utf8"), proposalContent);
    assert.deepEqual(await cli(status), { ok: true, vault, views: [] });
  });
});
