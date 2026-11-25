import { Platform, Plugin, TFile, addIcon, moment, requireApiVersion } from "obsidian";
import { showStatusNotice } from "./status-message";
import type { CliData, CliFlags, CliHandler, Command, Menu, TAbstractFile } from "obsidian";
import { FilePickerModal, IntroductionModal } from "./modals";
import { SideBySideDiffView, type PaneMode } from "./diff-view";
import { isTextFile, VIEW_TYPE } from "./file-utils";
import { FileDiffSettingsTab, DEFAULT_SETTINGS, isLanguagePreference, normalizePluginSettings, sanitizeCopySuffix, type PluginSettings } from "./settings";
import { createTranslator, resolveLanguage } from "./i18n";
import type { Language, Translator } from "./i18n";
import type { ChangeNavigationDirection } from "./diff-navigation";
import { rememberRecentFilePath } from "./recent-files";
import { validateComparisonProtocolRequest } from "./protocol";
import { extendTabMenus } from "./tab-context-menu";
import { registerDiffLayoutIcons } from "./layout-icons";
import { AGENT_CLI_COMMANDS, getAgentCliFlags, matchesAgentReview, parseAgentCliPaths, updateAgentCliHelp } from "./agent-cli";
import type { AgentAction, AgentCliError } from "./agent-cli";
import { AgentInstructionsModal } from "./agent-instructions-modal";
import { AboutModal } from "./about-modal";
import { parseDiffViewState, type OriginalSide } from "./diff-view-state";
const ICON_ID = "square-split-horizontal";
const AGENT_VAULT_INDEX_WAIT_MS = 1_000;
const AGENT_VAULT_INDEX_CHECK_MS = 50;

/** Formats a timestamp for deterministic change-copy names. */
function formatCopyTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear().toString()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
/** Registers the plugin commands, view, settings, and vault actions. */
export class FileDiffSideBySidePlugin extends Plugin {
  override settings: PluginSettings = DEFAULT_SETTINGS;
  language: Language = "en";
  translator: Translator = createTranslator("en");
  ribbonIconEl: HTMLElement | null = null;
  commandEntries: Command[] = [];
  private agentReviewQueue: Promise<void> = Promise.resolve();
  private refreshAgentCliHelp?: () => void;

  /** Loads settings and registers the view, commands and ribbon action. */
  override async onload(): Promise<void> {
    await this.loadSettings();
    registerDiffLayoutIcons(addIcon);
    this.registerView(VIEW_TYPE, (leaf) => new SideBySideDiffView(leaf, this));
    this.registerObsidianProtocolHandler("side-by-side-diff", (params) => {
      void this.openProtocolComparison(params);
    });
    this.registerAgentCli();
    this.ribbonIconEl = this.addRibbonIcon(
      ICON_ID,
      this.translate("ribbon.compareTwoFiles"),
      () => void this.compareTwoFiles()
    );
    this.updateRibbonVisibility();
    this.addSettingTab(new FileDiffSettingsTab(this.app, this));
    const restoreTabMenus = typeof Platform !== "undefined" && Platform.isMobileApp ? null : extendTabMenus((menu, view) => {
      // getState also identifies files in deferred views of tabs not opened this session.
      const path: unknown = view.getState().file;
      const file = typeof path === "string" ? this.app.vault.getAbstractFileByPath(path) : null;
      if (isTextFile(file)) {
        this.addCompareWithActiveFile(menu, file);
      }
    });
    if (restoreTabMenus) {
      this.register(restoreTabMenus);
    }
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file, source) => {
        if (!isTextFile(file)) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.compareActiveFile")).setIcon(ICON_ID).onClick(() => { void this.compareActiveFile(file); });
        });
        if (source === "file-explorer-context-menu" || (!restoreTabMenus && source === "tab-header")) {
          this.addCompareWithActiveFile(menu, file);
        }
        // Keep proposal and refresh actions scoped to the active document.
        if (file.path !== this.app.workspace.getActiveFile()?.path) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.proposeChanges")).setIcon(ICON_ID).onClick(() => { void this.proposeChanges(file); });
        });
        const changeCopy = this.findLatestChangeCopy(file);
        if (changeCopy) {
          menu.addItem((item) => {
            item.setTitle(this.translate("menu.acceptChanges")).setIcon(ICON_ID).onClick(() => { void this.openDiffView(changeCopy, file, false, "accept"); });
          });
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.refresh")).setIcon("refresh-cw").onClick(() => { this.refreshDiffViews(file); });
        });
      })
    );
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        const textFiles = files.filter((selectedFile: TAbstractFile) => isTextFile(selectedFile));
        const firstFile = textFiles[0];
        const secondFile = textFiles[1];
        if (textFiles.length !== 2 || !firstFile || !secondFile) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.compareSelectedFiles")).setIcon(ICON_ID).onClick(() => { void this.openDiffView(firstFile, secondFile); });
        });
      })
    );
    this.commandEntries = [
      this.addCommand({
        id: "compare-active-file",
        name: this.translate("commands.compareActiveFile"),
        callback: () => { void this.compareActiveFile(); }
      }),
      this.addCommand({
        id: "compare-two-files",
        name: this.translate("commands.compareTwoFiles"),
        callback: () => { void this.compareTwoFiles(); }
      }),
      this.addCommand({
        id: "propose-changes",
        name: this.translate("commands.proposeChanges"),
        callback: () => { void this.proposeChanges(); }
      }),
      this.addCommand({
        id: "save-comparison",
        name: this.translate("commands.saveComparison"),
        callback: () => { this.saveActiveComparison(); }
      }),
      this.addCommand({
        id: "next-change",
        name: this.translate("commands.nextChange"),
        callback: () => { this.navigateActiveComparison("next"); }
      }),
      this.addCommand({
        id: "previous-change",
        name: this.translate("commands.previousChange"),
        callback: () => { this.navigateActiveComparison("previous"); }
      }),
      this.addCommand({
        id: "show-introduction",
        name: this.translate("commands.showIntroduction"),
        callback: () => { this.showIntroduction(); }
      }),
      this.addCommand({
        id: "show-about",
        name: this.translate("commands.showAbout"),
        callback: () => { this.showAbout(); }
      })
    ];
    this.app.workspace.onLayoutReady(() => { void this.showIntroductionIfNeeded(); });
  }
  /** Adds a direct comparison with the active text file, capturing both menu-time files. */
  addCompareWithActiveFile(menu: Menu, file: TFile): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!isTextFile(activeFile) || activeFile.path === file.path) {
      return;
    }
    menu.addItem((item) => {
      item.setTitle(this.translate("menu.compareWithActiveFile")).setIcon(ICON_ID).onClick(() => { void this.openDiffView(activeFile, file); });
    });
  }
  /** Opens the introduction once for installations that have not seen it yet. */
  async showIntroductionIfNeeded(): Promise<void> {
    if (this.settings.introductionSeen) {
      return;
    }
    this.showIntroduction();
    this.settings.introductionSeen = true;
    try {
      await this.saveSettings();
    } catch (error) {
      console.error("Side-by-Side Diff: Could not save the introduction status.", error);
    }
  }
  /** Opens the guided introduction after the workspace can display modal dialogs. */
  showIntroduction(): void {
    new IntroductionModal(this.app, this.translator, () => { this.showAgentInstructions(); }).open();
  }
  /** Opens information about the installed plugin from settings or the command palette. */
  showAbout(): void {
    new AboutModal(this.app, this.manifest, this.translator, this.language).open();
  }
  /** Opens the same opt-in setup from settings and the introduction. */
  showAgentInstructions(): void {
    new AgentInstructionsModal(this.app, this.translator, this.settings.changeCopySuffix).open();
  }
  /** Saves changes in the currently active comparison view. */
  saveActiveComparison(): void {
    const view = this.app.workspace.getActiveViewOfType(SideBySideDiffView);
    view?.saveChanges();
  }
  /** Navigates the currently active comparison to an adjacent changed row. */
  navigateActiveComparison(direction: ChangeNavigationDirection): void {
    const view = this.app.workspace.getActiveViewOfType(SideBySideDiffView);
    view?.navigateChange(direction);
  }
  /** Remembers a selected right-hand file without interrupting the comparison. */
  async rememberRecentRightFile(file: TFile): Promise<void> {
    this.settings.recentRightFilePaths = rememberRecentFilePath(this.settings.recentRightFilePaths, file.path);
    try {
      await this.saveSettings();
    } catch (error) {
      console.error("Side-by-Side Diff: Could not remember the last selected file.", error);
    }
  }
  /** Loads persisted plugin settings and applies defaults for new options. */
  async loadSettings(): Promise<void> {
    const storedData: unknown = await this.loadData();
    this.settings = normalizePluginSettings(storedData);
    this.language = resolveLanguage(this.settings.language, moment.locale());
    this.translator = createTranslator(this.language);
  }
  /** Translates one UI key using the currently selected language. */
  translate(key: string, variables: Record<string, string | number> = {}): string {
    return this.translator(key, variables);
  }
  /** Applies a language preference and refreshes safe open comparison views. */
  updateLanguage(preference: string): void {
    this.settings.language = isLanguagePreference(preference) ? preference : "auto";
    this.language = resolveLanguage(this.settings.language, moment.locale());
    this.translator = createTranslator(this.language);
    this.updateLocalizedLabels();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (!(view instanceof SideBySideDiffView) || view.hasUnsavedChanges()) {
        continue;
      }
      void view.renderDiff(view.getScrollPosition());
    }
  }
  /** Updates labels that Obsidian keeps outside the rendered comparison views. */
  updateLocalizedLabels(): void {
    const commandNames = [
      this.translate("commands.compareActiveFile"),
      this.translate("commands.compareTwoFiles"),
      this.translate("commands.proposeChanges"),
      this.translate("commands.saveComparison"),
      this.translate("commands.nextChange"),
      this.translate("commands.previousChange"),
      this.translate("commands.showIntroduction"),
      this.translate("commands.showAbout")
    ];
    this.commandEntries.forEach((command, index) => {
      const commandName = commandNames[index];
      if (commandName !== undefined) {
        command.name = commandName;
      }
    });
    const ribbonLabel = this.translate("ribbon.compareTwoFiles");
    this.ribbonIconEl?.setAttribute("aria-label", ribbonLabel);
    this.ribbonIconEl?.setAttribute("title", ribbonLabel);
    this.refreshAgentCliHelp?.();
  }
  /** Persists the current plugin settings in the vault configuration. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
  /** Refreshes open comparison views for a file from the document context menu. */
  refreshDiffViews(file: TFile): void {
    let matchingViewFound = false;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (!(view instanceof SideBySideDiffView)) {
        continue;
      }
      if (view.state.leftPath !== file.path && view.state.rightPath !== file.path) {
        continue;
      }
      matchingViewFound = true;
      if (view.hasUnsavedChanges()) {
        showStatusNotice(this.translate("notice.refreshUnsaved"), "warning");
        continue;
      }
      void view.renderDiff(view.getScrollPosition());
    }
    if (!matchingViewFound) {
      showStatusNotice(this.translate("notice.noOpenView"), "warning");
    }
  }
  /** Shows or hides the plugin icon in Obsidian's left ribbon. */
  updateRibbonVisibility(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.toggleVisibility(this.settings.showRibbonIcon);
    }
  }
  /** Starts a comparison with the currently active text file on the left. */
  async compareActiveFile(file: TFile | null = null): Promise<void> {
    const activeFile = file ?? this.app.workspace.getActiveFile();
    if (activeFile === null) {
      // Without an active document, let the user choose the first comparison file.
      const leftFile = await this.pickFile(this.getTextFiles(), this.translate("picker.leftFile"));
      if (leftFile) {
        await this.openDiffView(leftFile);
      }
      return;
    }
    if (!isTextFile(activeFile)) {
      showStatusNotice(this.translate("notice.openTextFirst"), "warning");
      return;
    }
    await this.openDiffView(activeFile);
  }
  /** Creates or reuses a timestamped change copy and opens it editable on the right. */
  async proposeChanges(file: TFile | null = null): Promise<void> {
    const sourceFile = file ?? this.app.workspace.getActiveFile();
    if (!isTextFile(sourceFile)) {
      showStatusNotice(this.translate("notice.openTextFirst"), "warning");
      return;
    }
    try {
      const existingCopy = this.findLatestChangeCopy(sourceFile);
      if (existingCopy) {
        await this.openDiffView(sourceFile, existingCopy, true, "proposal");
        return;
      }
      const content = await this.app.vault.read(sourceFile);
      const copyFile = await this.app.vault.create(this.getChangeCopyPath(sourceFile), content);
      await this.openDiffView(sourceFile, copyFile, true, "proposal");
    } catch (error) {
      console.error("Side-by-Side Diff: Could not create the change copy.", error);
      showStatusNotice(this.translate("notice.copyFailed"), "error");
    }
  }
  /** Finds the newest existing change copy next to the source file. */
  findLatestChangeCopy(sourceFile: TFile): TFile | null {
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const prefix = `${sourceFile.basename}${suffix}`;
    const parentPath = sourceFile.parent?.path ?? "";
    return this.getTextFiles().filter(
      (file) => file.path !== sourceFile.path && (file.parent?.path ?? "") === parentPath && file.extension === sourceFile.extension && file.basename.startsWith(prefix)
    ).sort((a, b) => b.stat.mtime - a.stat.mtime || b.path.localeCompare(a.path, this.language))[0] ?? null;
  }
  /** Builds a unique vault path for a timestamped change copy. */
  getChangeCopyPath(sourceFile: TFile): string {
    const parentPath = sourceFile.parent?.path ?? "";
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const extension = sourceFile.extension.length > 0 ? `.${sourceFile.extension}` : "";
    const baseName = `${sourceFile.basename}${suffix}${formatCopyTimestamp(/* @__PURE__ */ new Date())}`;
    let counter = 0;
    let fileName = `${baseName}${extension}`;
    let path = parentPath.length > 0 ? `${parentPath}/${fileName}` : fileName;
    while (this.app.vault.getAbstractFileByPath(path)) {
      counter += 1;
      fileName = `${baseName}-${counter.toString()}${extension}`;
      path = parentPath.length > 0 ? `${parentPath}/${fileName}` : fileName;
    }
    return path;
  }
  /** Opens the active file immediately and lets the right file be selected in the view. */
  async compareTwoFiles(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (isTextFile(activeFile)) {
      await this.openDiffView(activeFile);
      return;
    }
    const files = this.getTextFiles();
    const leftFile = await this.pickFile(files, this.translate("picker.leftFile"));
    if (!leftFile) {
      return;
    }
    await this.openDiffView(leftFile);
  }
  /** Returns all non-binary vault files in stable path order. */
  getTextFiles(): TFile[] {
    return this.app.vault.getFiles().filter(isTextFile).sort((a, b) => a.path.localeCompare(b.path, this.language));
  }
  /** Opens a file picker and resolves with the selected file or null. */
  pickFile(files: TFile[], placeholder: string): Promise<TFile | null> {
    return new Promise<TFile | null>((resolve) => {
      const modal = new FilePickerModal(this.app, files, resolve, this.language);
      modal.setPlaceholder(placeholder);
      modal.open();
    });
  }
  /** Opens a comparison requested through obsidian://side-by-side-diff. */
  async openProtocolComparison(params: Record<string, string>): Promise<void> {
    const request = validateComparisonProtocolRequest(params, this.app.vault.getName());
    if (!request.ok) {
      showStatusNotice(this.translate(`notice.protocol.${request.error}`), "error");
      return;
    }
    const left = this.app.vault.getAbstractFileByPath(request.left);
    const right = this.app.vault.getAbstractFileByPath(request.right);
    if (!(left instanceof TFile) || !(right instanceof TFile)) {
      const missing = !(left instanceof TFile) ? request.left : request.right;
      showStatusNotice(this.translate("notice.protocol.fileMissing", { path: missing }), "error");
      return;
    }
    if (!isTextFile(left) || !isTextFile(right)) {
      showStatusNotice(this.translate("notice.protocol.textFilesOnly"), "error");
      return;
    }
    await this.openDiffView(left, right);
  }
  /** Registers parameterized CLI commands where the public desktop API exists. */
  private registerAgentCli(): void {
    if (requireApiVersion("1.12.2") && typeof this.registerCliHandler === "function" && !Platform.isMobileApp) {
      const getFlags = (action: keyof typeof AGENT_CLI_COMMANDS): CliFlags | null => action === "status"
        ? null : getAgentCliFlags(action, argument => this.translate(`agent.cli.${argument}`));
      const handlers = {
        compare: (params): Promise<string> => this.openAgentDiff("compare", params),
        review: (params): Promise<string> => this.openAgentDiff("review", params),
        status: (): Promise<string> => this.getAgentDiffStatus()
      } satisfies Record<keyof typeof AGENT_CLI_COMMANDS, CliHandler>;
      const actions = ["compare", "review", "status"] as const;
      for (const action of actions) {
        this.registerCliHandler(AGENT_CLI_COMMANDS[action], this.translate(`agent.cli.${action}`), getFlags(action), handlers[action]);
      }
      this.refreshAgentCliHelp = (): void => {
        for (const action of actions) {
          const description = `[${this.manifest.name}]: ${this.translate(`agent.cli.${action}`)}`;
          updateAgentCliHelp(this.app, AGENT_CLI_COMMANDS[action], handlers[action], description, getFlags(action));
        }
      };
    }
  }
  /** Gives externally written files a short window to appear in Obsidian's vault index. */
  private async findAgentFile(path: string): Promise<TFile | null> {
    const vault = this.app.vault;
    let file = vault.getAbstractFileByPath(path);
    if (!file) {
      const exists = await vault.adapter.exists(path, true).catch(() => false);
      file = vault.getAbstractFileByPath(path);
      const deadline = performance.now() + AGENT_VAULT_INDEX_WAIT_MS;
      while (!file && exists && performance.now() < deadline) {
        await new Promise<void>(resolve => { setTimeout(resolve, AGENT_VAULT_INDEX_CHECK_MS); });
        file = vault.getAbstractFileByPath(path);
      }
    }
    return file instanceof TFile && file.path === path ? file : null;
  }
  /** Resolves both indexed vault files and returns the result to the invoking agent. */
  private async openAgentDiff(action: AgentAction, params: CliData): Promise<string> {
    const request = parseAgentCliPaths(action, params);
    if (!request.ok) return JSON.stringify(request);
    const { left, right, originalSide, arguments: [leftArg, rightArg] } = request;
    await new Promise<void>(resolve => { this.app.workspace.onLayoutReady(resolve); });
    const [leftFile, rightFile] = await Promise.all([this.findAgentFile(left), this.findAgentFile(right)]);
    if (!leftFile) {
      return JSON.stringify({ ok: false, error: "file_not_found", argument: leftArg } satisfies AgentCliError);
    }
    if (!rightFile) {
      return JSON.stringify({ ok: false, error: "file_not_found", argument: rightArg } satisfies AgentCliError);
    }
    if (!isTextFile(leftFile) || !isTextFile(rightFile)) {
      const argument = isTextFile(leftFile) ? rightArg : leftArg;
      return JSON.stringify({ ok: false, error: "not_a_text_file", argument } satisfies AgentCliError);
    }
    if (action === "review") {
      // Let the previous open finish publishing its view state before looking for duplicates.
      const review = this.agentReviewQueue.then(() => this.openAgentReview(leftFile, rightFile, originalSide));
      this.agentReviewQueue = review.then(() => undefined, () => undefined);
      return review;
    }
    const opened = await this.openDiffView(leftFile, rightFile);
    return JSON.stringify(opened
      ? { ok: true, action, vault: this.app.vault.getName(), left, right }
      : { ok: false, error: "view_open_failed" } satisfies AgentCliError);
  }
  /** Reuses a matching review without replacing its live state, or opens the requested pane order. */
  private async openAgentReview(leftFile: TFile, rightFile: TFile, originalSide: OriginalSide): Promise<string> {
    const workspace = this.app.workspace;
    const [original, proposal] = originalSide === "left" ? [leftFile, rightFile] : [rightFile, leftFile];
    const existing = workspace.getLeavesOfType(VIEW_TYPE).find(leaf =>
      matchesAgentReview(parseDiffViewState(leaf.getViewState().state), original.path, proposal.path)
    );
    const success = { ok: true, action: "review", vault: this.app.vault.getName() };
    const failure = { ok: false, error: "view_open_failed" } satisfies AgentCliError;
    if (existing) {
      try {
        if (requireApiVersion("1.7.2")) await workspace.revealLeaf(existing);
        workspace.setActiveLeaf(existing, { focus: true });
        const state = parseDiffViewState(existing.getViewState().state);
        return JSON.stringify({ ...success, left: state.leftPath, right: state.rightPath, originalSide: state.originalSide, reused: true });
      } catch (error) {
        console.error("[Side-by-Side Diff] Could not focus the review", error);
        return JSON.stringify(failure);
      }
    }
    const opened = await this.openDiffView(leftFile, rightFile, false, "review", originalSide);
    return JSON.stringify(opened ? { ...success, left: leftFile.path, right: rightFile.path, originalSide, reused: false } : failure);
  }
  /** Reports session state for every open diff without changing the active tab. */
  private async getAgentDiffStatus(): Promise<string> {
    const workspace = this.app.workspace;
    await new Promise<void>(resolve => { workspace.onLayoutReady(resolve); });
    if (requireApiVersion("1.7.2")) {
      const leaves = workspace.getLeavesOfType(VIEW_TYPE);
      await Promise.all(leaves.map(leaf => leaf.loadIfDeferred()));
    }
    const views = workspace.getLeavesOfType(VIEW_TYPE).flatMap(({ view }) => {
      if (!(view instanceof SideBySideDiffView)) return [];
      const { leftPath, rightPath, mode, originalSide } = view.state;
      return [{ left: leftPath, right: rightPath, mode, originalSide: originalSide ?? "left",
        counts: view.getReviewCounts(), hasUnsavedChanges: view.hasUnsavedChanges() }];
    });
    return JSON.stringify({ ok: true, vault: this.app.vault.getName(), views });
  }
  /** Opens the comparison in a new split leaf, optionally awaiting the right file. */
  async openDiffView(leftFile: TFile, rightFile: TFile | null = null, editRight = false, mode: PaneMode = "compare", originalSide?: OriginalSide): Promise<boolean> {
    if (rightFile && leftFile.path === rightFile.path) {
      showStatusNotice(this.translate("notice.differentFiles"), "warning");
      return false;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
        state: { leftPath: leftFile.path, rightPath: rightFile?.path ?? null, editRight, mode, ...(originalSide === undefined ? {} : { originalSide }) }
      });
      // Guard the foregrounding API so the declared minimum version remains supported.
      if (requireApiVersion("1.7.2")) {
        await this.app.workspace.revealLeaf(leaf);
      }
      return true;
    } catch (error) {
      console.error("Side-by-Side Diff: Could not open the comparison view.", error);
      showStatusNotice(this.translate("notice.viewOpenFailed"), "error");
      return false;
    }
  }
}
export default FileDiffSideBySidePlugin;
