import { Notice, Plugin, TFile, moment, requireApiVersion } from "obsidian";
import type { Command } from "obsidian";
import { FilePickerModal } from "./modals";
import { SideBySideDiffView, type PaneMode } from "./diff-view";
import { isTextFile, VIEW_TYPE } from "./file-utils";
import { FileDiffSettingsTab, DEFAULT_SETTINGS, isLanguagePreference, normalizePluginSettings, sanitizeCopySuffix, type PluginSettings } from "./settings";
import { createTranslator, resolveLanguage } from "./i18n";
import type { Language, Translator } from "./i18n";
import type { ChangeNavigationDirection } from "./diff-navigation";
import { rememberRecentFilePath } from "./recent-files";
const ICON_ID = "square-split-horizontal";

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

  /** Loads settings and registers the view, commands and ribbon action. */
  override async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new SideBySideDiffView(leaf, this));
    this.ribbonIconEl = this.addRibbonIcon(
      ICON_ID,
      this.translate("ribbon.compareTwoFiles"),
      () => void this.compareTwoFiles()
    );
    this.updateRibbonVisibility();
    this.addSettingTab(new FileDiffSettingsTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!isTextFile(file)) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.compareActiveFile")).setIcon(ICON_ID).onClick(() => { void this.compareActiveFile(file); });
        });
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
      })
    ];
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
      console.error("Side-by-Side Diff konnte die zuletzt verwendete Datei nicht speichern.", error);
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
      this.translate("commands.previousChange")
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
        new Notice(this.translate("notice.refreshUnsaved"));
        continue;
      }
      void view.renderDiff(view.getScrollPosition());
    }
    if (!matchingViewFound) {
      new Notice(this.translate("notice.noOpenView"));
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
      new Notice(this.translate("notice.openTextFirst"));
      return;
    }
    await this.openDiffView(activeFile);
  }
  /** Creates or reuses a timestamped change copy and opens it editable on the right. */
  async proposeChanges(file: TFile | null = null): Promise<void> {
    const sourceFile = file ?? this.app.workspace.getActiveFile();
    if (!isTextFile(sourceFile)) {
      new Notice(this.translate("notice.openTextFirst"));
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
      console.error("Side-by-Side Diff konnte keine \xC4nderungskopie anlegen.", error);
      new Notice(this.translate("notice.copyFailed"));
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
  /** Opens the comparison in a new split leaf, optionally awaiting the right file. */
  async openDiffView(leftFile: TFile, rightFile: TFile | null = null, editRight = false, mode: PaneMode = "compare"): Promise<void> {
    if (rightFile && leftFile.path === rightFile.path) {
      new Notice(this.translate("notice.differentFiles"));
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
        state: { leftPath: leftFile.path, rightPath: rightFile === null ? null : rightFile.path, editRight, mode }
      });
      // Guard the foregrounding API so the declared minimum version remains supported.
      if (requireApiVersion("1.7.2")) {
        await this.app.workspace.revealLeaf(leaf);
      }
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Ansicht nicht \xF6ffnen.", error);
      new Notice(this.translate("notice.viewOpenFailed"));
    }
  }
}
export default FileDiffSideBySidePlugin;
