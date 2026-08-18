var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// locales/de.json
var require_de = __commonJS({
  "locales/de.json"(exports2, module2) {
    module2.exports = {
      fileFallback: "Datei",
      "ribbon.compareTwoFiles": "Zwei Dateien vergleichen",
      "commands.compareActiveFile": "Aktuelle Datei mit anderer Datei vergleichen",
      "commands.compareTwoFiles": "Zwei Dateien vergleichen",
      "commands.proposeChanges": "\xC4nderungen f\xFCr aktuelle Datei vorschlagen",
      "menu.compareActiveFile": "Mit anderer Datei vergleichen",
      "menu.proposeChanges": "\xC4nderungen vorschlagen",
      "menu.acceptChanges": "\xC4nderungen \xFCbernehmen",
      "menu.refresh": "Aktualisieren",
      "picker.leftFile": "Linke Datei ausw\xE4hlen",
      "picker.rightFile": "Rechte Datei ausw\xE4hlen",
      "modal.deleteIdentical.title": "Identische Datei l\xF6schen?",
      "modal.deleteIdentical.confirm": "Soll \u201E{path}\u201C in den Papierkorb verschoben werden?",
      "modal.deleteIdentical.note": "Die Datei wird nicht endg\xFCltig gel\xF6scht und kann aus dem Papierkorb wiederhergestellt werden.",
      "modal.deleteIdentical.trash": "In Papierkorb verschieben",
      "modal.cancel": "Abbrechen",
      "modal.unsaved.title": "Ungespeicherte \xC4nderungen",
      "modal.unsaved.question": "Sollen die \xC4nderungen vor dem Schlie\xDFen gespeichert werden?",
      "modal.unsaved.save": "Speichern",
      "modal.unsaved.discard": "Nicht speichern",
      "view.leftUnavailable": "Die linke Datei ist nicht mehr verf\xFCgbar.",
      "view.rightUnavailable": "Die rechte Datei ist nicht mehr verf\xFCgbar.",
      "view.readFailed": "Die Dateien konnten nicht gelesen werden.",
      "view.selection.leftFixed": "Linke Datei festgelegt \u2013 rechte Datei ausw\xE4hlen",
      "view.selection.none": "Noch kein Vergleich",
      "view.selection.chooseFile": "Datei ausw\xE4hlen",
      "view.selection.rightFile": "Rechte Datei ausw\xE4hlen",
      "view.selection.description": "W\xE4hle die Datei, die mit dem aktiven Dokument verglichen werden soll.",
      "view.selection.openSearch": "Dateisuche \xF6ffnen",
      "view.labels.comparison": "Vergleich",
      "view.labels.original": "Original",
      "view.labels.proposal": "Vorschlag",
      "view.labels.edit": "bearbeiten",
      "view.title.selection": "{label} \xB7 {name}",
      "view.title.comparison": "{leftLabel} \xB7 {leftName} \u2194 {rightLabel} \xB7 {rightName}",
      "view.hint.edit": "Rechte Datei bearbeiten \xB7 \xC4nderungen anschlie\xDFend speichern",
      "view.hint.accept": "\u2192 \xFCbernimmt Vorschl\xE4ge ins Original \xB7 \xD7 ignoriert links, rechts bleibt unver\xE4ndert",
      "view.hint.compare": "\u2192 \xFCbernimmt nach rechts \xB7 \xD7 ignoriert links, rechts bleibt unver\xE4ndert",
      "view.summary.changedOne": "{count} ge\xE4nderte Zeile",
      "view.summary.changedMany": "{count} ge\xE4nderte Zeilen",
      "view.summary.ignored": "{count} ignoriert",
      "actions.edit": "Bearbeitungsmodus",
      "actions.editTitle": "Editiermodus f\xFCr die rechte Datei aktivieren",
      "actions.swap": "Tauschen",
      "actions.swapTitle": "Linke und rechte Datei tauschen",
      "actions.savePending": "\xC4nderungen speichern",
      "actions.savePendingTitle": "Vorgemerkte \xC4nderungen in die Dateien schreiben",
      "actions.compareMode": "Vergleichsmodus",
      "actions.compareModeTitle": "Editiermodus verlassen und Vergleichsmodus \xF6ffnen",
      "actions.saveRight": "\xC4nderungen speichern",
      "actions.saveRightTitle": "Die \xC4nderungen in der rechten Datei speichern",
      "actions.acceptProposal": "Vorschlag ins Original \xFCbernehmen",
      "actions.copyLeftToRight": "\xC4nderung von links nach rechts \xFCbernehmen",
      "actions.dismiss": "Linke \xC4nderung ignorieren und die rechte Seite unver\xE4ndert lassen",
      "editor.rightFileAria": "Rechte Datei bearbeiten",
      "messages.identical.title": "Die Dateien sind identisch.",
      "messages.identical.edit": "Bearbeite die rechte Datei direkt und speichere anschlie\xDFend.",
      "messages.identical.trash": "Eine der beiden Dateien kann in den Papierkorb verschoben werden.",
      "messages.identical.deleteLeft": "Linke Datei l\xF6schen",
      "messages.identical.deleteRight": "Rechte Datei l\xF6schen",
      "messages.resolved.title": "Alle \xC4nderungsvorschl\xE4ge wurden bearbeitet.",
      "messages.resolved.pending": "Die \xC4nderungen sind vorgemerkt und k\xF6nnen jetzt gespeichert werden.",
      "messages.resolved.none": "Es sind keine offenen \xC4nderungen mehr vorhanden.",
      "notice.selectedFileLoadFailed": "Die ausgew\xE4hlte Datei konnte nicht geladen werden.",
      "notice.saveFirst": "Bitte zuerst die \xC4nderungen speichern.",
      "notice.pendingFileUnavailable": "Eine Datei mit vorgemerkten \xC4nderungen ist nicht mehr verf\xFCgbar.",
      "notice.saveFailed": "Die \xC4nderungen konnten nicht gespeichert werden.",
      "notice.saved": "\xC4nderungen gespeichert.",
      "notice.comparedFilesUnavailable": "Die verglichenen Dateien sind nicht mehr verf\xFCgbar.",
      "notice.staged": "\xC4nderung vorgemerkt. Zum Schreiben speichern.",
      "notice.changeFailed": "Die \xC4nderung konnte nicht gespeichert werden.",
      "notice.fileTrashed": "\u201E{name}\u201C wurde in den Papierkorb verschoben.",
      "notice.fileTrashFailed": "Die Datei konnte nicht in den Papierkorb verschoben werden.",
      "notice.refreshUnsaved": "Bitte zuerst die \xC4nderungen speichern, bevor die Ansicht aktualisiert wird.",
      "notice.noOpenView": "F\xFCr dieses Dokument ist keine Vergleichsansicht ge\xF6ffnet.",
      "notice.openTextFirst": "Bitte zuerst eine Textdatei \xF6ffnen.",
      "notice.copyFailed": "Die \xC4nderungskopie konnte nicht angelegt werden.",
      "notice.differentFiles": "Bitte zwei unterschiedliche Dateien ausw\xE4hlen.",
      "notice.viewOpenFailed": "Die Diff-Ansicht konnte nicht ge\xF6ffnet werden. Details stehen in der Entwicklerkonsole.",
      "settings.ribbon.name": "Im linken Hauptmen\xFC anzeigen",
      "settings.ribbon.description": "Zeigt das File-Diff-Symbol in der linken Ribbon-Leiste an.",
      "settings.suffix.name": "Suffix f\xFCr \xC4nderungskopien",
      "settings.suffix.description": "Dieser Text steht vor dem Zeitstempel, zum Beispiel _changes_20260817-143000.",
      "settings.language.name": "Sprache",
      "settings.language.description": "Legt die Sprache der Plugin-Oberfl\xE4che fest.",
      "settings.language.auto": "Automatisch",
      "settings.language.de": "Deutsch",
      "settings.language.en": "English"
    };
  }
});

// locales/en.json
var require_en = __commonJS({
  "locales/en.json"(exports2, module2) {
    module2.exports = {
      fileFallback: "File",
      "ribbon.compareTwoFiles": "Compare two files",
      "commands.compareActiveFile": "Compare current file with another file",
      "commands.compareTwoFiles": "Compare two files",
      "commands.proposeChanges": "Suggest changes for current file",
      "menu.compareActiveFile": "Compare with another file",
      "menu.proposeChanges": "Suggest changes",
      "menu.acceptChanges": "Accept changes",
      "menu.refresh": "Refresh",
      "picker.leftFile": "Select left file",
      "picker.rightFile": "Select right file",
      "modal.deleteIdentical.title": "Move identical file to trash?",
      "modal.deleteIdentical.confirm": "Move \u201C{path}\u201D to the trash?",
      "modal.deleteIdentical.note": "The file will not be permanently deleted and can be restored from the trash.",
      "modal.deleteIdentical.trash": "Move to trash",
      "modal.cancel": "Cancel",
      "modal.unsaved.title": "Unsaved changes",
      "modal.unsaved.question": "Save changes before closing?",
      "modal.unsaved.save": "Save",
      "modal.unsaved.discard": "Don't save",
      "view.leftUnavailable": "The left file is no longer available.",
      "view.rightUnavailable": "The right file is no longer available.",
      "view.readFailed": "The files could not be read.",
      "view.selection.leftFixed": "Left file fixed \u2013 select a right file",
      "view.selection.none": "No comparison yet",
      "view.selection.chooseFile": "Select file",
      "view.selection.rightFile": "Select right file",
      "view.selection.description": "Choose the file to compare with the active document.",
      "view.selection.openSearch": "Open file search",
      "view.labels.comparison": "Comparison",
      "view.labels.original": "Original",
      "view.labels.proposal": "Proposal",
      "view.labels.edit": "edit",
      "view.title.selection": "{label} \xB7 {name}",
      "view.title.comparison": "{leftLabel} \xB7 {leftName} \u2194 {rightLabel} \xB7 {rightName}",
      "view.hint.edit": "Edit the right file \xB7 save changes afterwards",
      "view.hint.accept": "\u2192 accepts proposals into the original \xB7 \xD7 ignores the left side, right side remains unchanged",
      "view.hint.compare": "\u2192 accepts to the right \xB7 \xD7 ignores the left side, right side remains unchanged",
      "view.summary.changedOne": "{count} changed line",
      "view.summary.changedMany": "{count} changed lines",
      "view.summary.ignored": "{count} ignored",
      "actions.edit": "Edit mode",
      "actions.editTitle": "Enable editing for the right file",
      "actions.swap": "Swap",
      "actions.swapTitle": "Swap the left and right files",
      "actions.savePending": "Save changes",
      "actions.savePendingTitle": "Write staged changes to the files",
      "actions.compareMode": "Comparison mode",
      "actions.compareModeTitle": "Leave edit mode and open comparison mode",
      "actions.saveRight": "Save changes",
      "actions.saveRightTitle": "Save changes to the right file",
      "actions.acceptProposal": "Accept proposal into the original",
      "actions.copyLeftToRight": "Accept change from left to right",
      "actions.dismiss": "Ignore the left change and keep the right side unchanged",
      "editor.rightFileAria": "Edit right file",
      "messages.identical.title": "The files are identical.",
      "messages.identical.edit": "Edit the right file directly and save afterwards.",
      "messages.identical.trash": "Either file can be moved to the trash.",
      "messages.identical.deleteLeft": "Delete left file",
      "messages.identical.deleteRight": "Delete right file",
      "messages.resolved.title": "All change suggestions have been processed.",
      "messages.resolved.pending": "The changes are staged and can now be saved.",
      "messages.resolved.none": "There are no open changes left.",
      "notice.selectedFileLoadFailed": "The selected file could not be loaded.",
      "notice.saveFirst": "Please save the changes first.",
      "notice.pendingFileUnavailable": "A file with staged changes is no longer available.",
      "notice.saveFailed": "The changes could not be saved.",
      "notice.saved": "Changes saved.",
      "notice.comparedFilesUnavailable": "The compared files are no longer available.",
      "notice.staged": "Change staged. Save to write it.",
      "notice.changeFailed": "The change could not be saved.",
      "notice.fileTrashed": "\u201C{name}\u201D was moved to the trash.",
      "notice.fileTrashFailed": "The file could not be moved to the trash.",
      "notice.refreshUnsaved": "Please save the changes before refreshing the view.",
      "notice.noOpenView": "No comparison view is open for this document.",
      "notice.openTextFirst": "Please open a text file first.",
      "notice.copyFailed": "The change copy could not be created.",
      "notice.differentFiles": "Please select two different files.",
      "notice.viewOpenFailed": "The diff view could not be opened. See the developer console for details.",
      "settings.ribbon.name": "Show in left ribbon",
      "settings.ribbon.description": "Show the File Diff icon in Obsidian's left ribbon.",
      "settings.suffix.name": "Change-copy suffix",
      "settings.suffix.description": "Text before the timestamp, for example _changes_20260817-143000.",
      "settings.language.name": "Language",
      "settings.language.description": "Choose the language of the plugin interface.",
      "settings.language.auto": "Automatic",
      "settings.language.de": "Deutsch",
      "settings.language.en": "English"
    };
  }
});

// i18n.js
var require_i18n = __commonJS({
  "i18n.js"(exports2, module2) {
    var DE_TRANSLATIONS = require_de();
    var EN_TRANSLATIONS = require_en();
    var TRANSLATIONS = { de: DE_TRANSLATIONS, en: EN_TRANSLATIONS };
    function detectSystemLanguage(locale = "") {
      const fallbackLocale = typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function" ? Intl.DateTimeFormat().resolvedOptions().locale : "de";
      const detectedLocale = String(locale || fallbackLocale || "de").toLowerCase();
      return detectedLocale.startsWith("de") ? "de" : "en";
    }
    function resolveLanguage2(preference, locale = "") {
      return preference === "de" || preference === "en" ? preference : detectSystemLanguage(locale);
    }
    function createTranslator2(language) {
      const dictionary = TRANSLATIONS[language] || TRANSLATIONS.en;
      return (key, variables = {}) => {
        const template = dictionary[key] || TRANSLATIONS.en[key] || key;
        return template.replace(
          /\{([a-zA-Z0-9_.-]+)\}/g,
          (placeholder, variableName) => Object.prototype.hasOwnProperty.call(variables, variableName) ? String(variables[variableName]) : placeholder
        );
      };
    }
    module2.exports = { createTranslator: createTranslator2, resolveLanguage: resolveLanguage2 };
  }
});

// main.js
var { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, SuggestModal, TFile, moment } = require("obsidian");
var { createTranslator, resolveLanguage } = require_i18n();
var VIEW_TYPE = "side-by-side-diff-view";
var ICON_ID = "square-split-horizontal";
var MAX_DIFF_CELLS = 1e6;
var DEFAULT_SETTINGS = {
  showRibbonIcon: true,
  changeCopySuffix: "_changes_",
  language: "auto"
};
var BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  "7z",
  "avif",
  "bmp",
  "class",
  "doc",
  "docx",
  "exe",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "otf",
  "pdf",
  "png",
  "rar",
  "tar",
  "ttf",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip"
]);
function isTextFile(file) {
  return file instanceof TFile && !BINARY_EXTENSIONS.has(file.extension.toLowerCase());
}
function formatCopyTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function sanitizeCopySuffix(value) {
  return String(value || "_changes_").replace(/[\\/:*?"<>|]/g, "_");
}
function splitLines(content) {
  if (content.length === 0) {
    return [];
  }
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length > 0 ? lines : [""];
}
function joinLines(lines, originalContent) {
  if (lines.length === 0) {
    return "";
  }
  const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] || "\n";
  const hasFinalLineEnding = /(?:\r\n|\r|\n)$/.test(originalContent);
  return lines.join(lineEnding) + (hasFinalLineEnding ? lineEnding : "");
}
function convertLineEndings(content, originalContent) {
  const lineEnding = originalContent.match(/\r\n|\r|\n/)?.[0] || "\n";
  return content.replace(/\r\n?/g, "\n").replace(/\n/g, lineEnding);
}
function indexDiffRows(rows) {
  let leftIndex = 0;
  let rightIndex = 0;
  return rows.map((row) => {
    const indexedRow = {
      ...row,
      leftIndex,
      rightIndex,
      leftLineNumber: row.left === null ? null : leftIndex + 1,
      rightLineNumber: row.right === null ? null : rightIndex + 1
    };
    if (row.left !== null) {
      leftIndex += 1;
    }
    if (row.right !== null) {
      rightIndex += 1;
    }
    return indexedRow;
  });
}
function getDiffRowKey(row) {
  return JSON.stringify([row.leftIndex, row.rightIndex, row.left, row.right]);
}
function alignSequences(left, right, equals) {
  if (left.length * right.length > MAX_DIFF_CELLS) {
    return alignByIndex(left, right, equals);
  }
  const table = Array.from(
    { length: left.length + 1 },
    () => new Uint32Array(right.length + 1)
  );
  for (let leftIndex2 = left.length - 1; leftIndex2 >= 0; leftIndex2 -= 1) {
    for (let rightIndex2 = right.length - 1; rightIndex2 >= 0; rightIndex2 -= 1) {
      table[leftIndex2][rightIndex2] = equals(left[leftIndex2], right[rightIndex2]) ? table[leftIndex2 + 1][rightIndex2 + 1] + 1 : Math.max(table[leftIndex2 + 1][rightIndex2], table[leftIndex2][rightIndex2 + 1]);
    }
  }
  const operations = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && equals(left[leftIndex], right[rightIndex])) {
      operations.push({ kind: "equal", left: left[leftIndex], right: right[rightIndex] });
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftIndex < left.length && (rightIndex >= right.length || table[leftIndex + 1][rightIndex] >= table[leftIndex][rightIndex + 1])) {
      operations.push({ kind: "left", left: left[leftIndex], right: null });
      leftIndex += 1;
    } else {
      operations.push({ kind: "right", left: null, right: right[rightIndex] });
      rightIndex += 1;
    }
  }
  return groupOperations(operations);
}
function alignByIndex(left, right, equals) {
  const rows = [];
  const rowCount = Math.max(left.length, right.length);
  for (let index = 0; index < rowCount; index += 1) {
    const leftValue = index < left.length ? left[index] : null;
    const rightValue = index < right.length ? right[index] : null;
    rows.push({
      left: leftValue,
      right: rightValue,
      equal: leftValue !== null && rightValue !== null && equals(leftValue, rightValue)
    });
  }
  return rows;
}
function groupOperations(operations) {
  const rows = [];
  let index = 0;
  while (index < operations.length) {
    const operation = operations[index];
    if (operation.kind === "equal") {
      rows.push({ left: operation.left, right: operation.right, equal: true });
      index += 1;
      continue;
    }
    const removed = [];
    const added = [];
    while (index < operations.length && operations[index].kind !== "equal") {
      if (operations[index].kind === "left") {
        removed.push(operations[index].left);
      } else {
        added.push(operations[index].right);
      }
      index += 1;
    }
    const rowCount = Math.max(removed.length, added.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const leftValue = rowIndex < removed.length ? removed[rowIndex] : null;
      const rightValue = rowIndex < added.length ? added[rowIndex] : null;
      rows.push({ left: leftValue, right: rightValue, equal: false });
    }
  }
  return rows;
}
function applyAlignedRowChange(leftLines, rightLines, row, direction) {
  const nextLeftLines = [...leftLines];
  const nextRightLines = [...rightLines];
  const leftToRight = direction === "left-to-right";
  const sourceValue = leftToRight ? row.left : row.right;
  const targetValue = leftToRight ? row.right : row.left;
  const targetLines = leftToRight ? nextRightLines : nextLeftLines;
  const targetIndex = leftToRight ? row.rightIndex : row.leftIndex;
  if (sourceValue === null) {
    targetLines.splice(targetIndex, 1);
  } else if (targetValue === null) {
    targetLines.splice(targetIndex, 0, sourceValue);
  } else if (targetIndex >= targetLines.length) {
    targetLines.push(sourceValue);
  } else {
    targetLines[targetIndex] = sourceValue;
  }
  return { leftLines: nextLeftLines, rightLines: nextRightLines };
}
function getIgnoredDiffRow(row) {
  if (row.right === null) {
    return null;
  }
  return { ...row, left: null, leftLineNumber: null, equal: true };
}
function getLineSyncPlan(leftCount, rightCount, preferredIndex = null) {
  const targetCount = Math.max(leftCount, rightCount);
  const requestedIndex = Number.isInteger(preferredIndex) ? preferredIndex : Math.min(leftCount, rightCount);
  return {
    targetCount,
    insertionIndex: Math.max(0, Math.min(requestedIndex, targetCount)),
    leftGapCount: Math.max(0, rightCount - leftCount),
    rightGapCount: Math.max(0, leftCount - rightCount)
  };
}
function serializeEditableLines(lines) {
  return lines.filter((line) => !(line.isAlignmentGap && line.value.trim() === "")).filter((line) => line.value !== "" || line.rightPresent !== false).map((line) => line.value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")).join("\n");
}
function tokenizeLine(line) {
  return line.match(/\s+|[^\s]+/g) || [];
}
function appendInlineDiff(parent, left, right, side) {
  if (left === null || right === null) {
    parent.textContent = side === "left" ? left || " " : right || " ";
    return;
  }
  const tokens = alignSequences(tokenizeLine(left), tokenizeLine(right), (a, b) => a === b);
  for (const token of tokens) {
    const value = side === "left" ? token.left : token.right;
    if (value === null) {
      continue;
    }
    const span = parent.createSpan({ text: value });
    if (!token.equal) {
      span.addClass(`file-diff-sbs-inline-${side}`);
    }
  }
}
var DeleteIdenticalFileModal = class extends Modal {
  /** Creates a confirmation modal for the selected file. */
  constructor(app, file, onConfirm, translate) {
    super(app);
    this.file = file;
    this.onConfirm = onConfirm;
    this.translate = translate;
  }
  /** Renders the warning and the confirm/cancel actions. */
  onOpen() {
    this.titleEl.setText(this.translate("modal.deleteIdentical.title"));
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteIdentical.confirm", { path: this.file.path })
    });
    this.contentEl.createEl("p", {
      text: this.translate("modal.deleteIdentical.note"),
      cls: "file-diff-sbs-delete-note"
    });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-delete-actions" });
    const deleteButton = actions.createEl("button", {
      text: this.translate("modal.deleteIdentical.trash"),
      cls: "mod-warning"
    });
    deleteButton.addEventListener("click", () => {
      this.close();
      void this.onConfirm();
    });
    const cancelButton = actions.createEl("button", { text: this.translate("modal.cancel") });
    cancelButton.addEventListener("click", () => this.close());
  }
  /** Clears modal content when it closes. */
  onClose() {
    this.contentEl.empty();
  }
};
var FilePickerModal = class extends SuggestModal {
  /** Creates a picker with the files that are valid for comparison. */
  constructor(app, files, onChoose, locale = "de") {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.locale = locale;
    this.finished = false;
  }
  /** Filters files by name or path and sorts them deterministically. */
  getSuggestions(query) {
    const search = (query || "").trim().toLowerCase();
    return this.files.filter((file) => !search || file.path.toLowerCase().includes(search)).sort((a, b) => a.path.localeCompare(b.path, this.locale));
  }
  /** Displays both the filename and its vault-relative path. */
  renderSuggestion(file, element) {
    element.createDiv({ text: file.name });
    element.createEl("small", { text: file.path, cls: "file-diff-sbs-picker-path" });
  }
  /** Resolves the picker with the selected file. */
  onChooseSuggestion(file) {
    this.finished = true;
    this.onChoose(file);
  }
  /** Resolves cancellation when the picker is closed without a selection. */
  onClose() {
    super.onClose();
    if (!this.finished) {
      this.onChoose(null);
    }
  }
};
var UnsavedChangesModal = class extends Modal {
  /** Creates a save-or-discard prompt for pending comparison changes. */
  constructor(app, translate) {
    super(app);
    this.resolveChoice = null;
    this.finished = false;
    this.translate = translate;
  }
  /** Opens the prompt and resolves with the selected close action. */
  waitForChoice() {
    return new Promise((resolve) => {
      this.resolveChoice = resolve;
      this.open();
    });
  }
  /** Renders the save and discard actions. */
  onOpen() {
    this.titleEl.setText(this.translate("modal.unsaved.title"));
    this.contentEl.createEl("p", { text: this.translate("modal.unsaved.question") });
    const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-unsaved-actions" });
    const saveButton = actions.createEl("button", { text: this.translate("modal.unsaved.save"), cls: "mod-cta" });
    saveButton.addEventListener("click", () => this.choose("save"));
    const discardButton = actions.createEl("button", { text: this.translate("modal.unsaved.discard") });
    discardButton.addEventListener("click", () => this.choose("discard"));
  }
  /** Resolves the prompt and closes it after a button choice. */
  choose(choice) {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.resolveChoice?.(choice);
    this.resolveChoice = null;
    this.close();
  }
  /** Defaults to discarding when the prompt is closed with Escape. */
  onClose() {
    if (!this.finished) {
      this.finished = true;
      this.resolveChoice?.("discard");
      this.resolveChoice = null;
    }
    this.contentEl.empty();
  }
};
var SideBySideDiffView = class extends ItemView {
  /** Initializes the view and subscribes to relevant vault changes. */
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = {};
    this.renderToken = 0;
    this.dismissedRows = /* @__PURE__ */ new Set();
    this.pendingFileContents = /* @__PURE__ */ new Map();
    this.rightEditorState = null;
    this.saveButton = null;
    this.editInputSnapshot = null;
    this.editSyncFrame = null;
    this.registerDomEvent(this.contentEl.ownerDocument, "keydown", (event) => this.handleGlobalKeydown(event), { capture: true });
    this.registerDomEvent(this.contentEl, "beforeinput", (event) => this.handleBeforeInput(event));
    this.registerDomEvent(this.contentEl, "input", (event) => this.handleInput(event));
    this.registerDomEvent(this.contentEl, "keyup", (event) => this.handleEditKeyup(event));
    this.registerEvent(this.app.vault.on("modify", (file) => this.refreshForPath(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.refreshForPath(file.path)));
  }
  /** Translates one UI key using the plugin's current language. */
  translate(key, variables = {}) {
    return this.plugin.translate(key, variables);
  }
  /** Returns the registered Obsidian view type. */
  getViewType() {
    return VIEW_TYPE;
  }
  /** Returns a useful tab title for the current comparison. */
  getDisplayText() {
    const labels = this.getPaneLabels();
    const getFileName = (path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? file.name : path?.split("/").pop() || this.translate("fileFallback");
    };
    if (this.state.leftPath && this.state.rightPath) {
      return `${labels.left} \xB7 ${getFileName(this.state.leftPath)} \u2194 ${labels.right} \xB7 ${getFileName(this.state.rightPath)}`;
    }
    return this.state.leftPath ? `${labels.left} \xB7 ${getFileName(this.state.leftPath)}` : "Side-by-Side Diff";
  }
  /** Returns the serializable paths needed to restore the view. */
  getState() {
    return {
      leftPath: this.state.leftPath,
      rightPath: this.state.rightPath,
      editRight: Boolean(this.state.editRight),
      mode: this.state.mode || "compare"
    };
  }
  /** Stores new paths and redraws the comparison. */
  async setState(state, result) {
    await super.setState(state, result);
    this.state = state || {};
    await this.renderDiff();
  }
  /** Renders the initial comparison when the leaf opens. */
  async onOpen() {
    await this.renderDiff();
  }
  /** Clears the view when its leaf closes. */
  async onClose() {
    if (this.state.editRight && this.rightEditorState?.editor) {
      this.synchronizeEditablePanes(this.rightEditorState.editor);
    }
    if (this.hasUnsavedChanges()) {
      const choice = await new UnsavedChangesModal(this.app, this.translate.bind(this)).waitForChoice();
      if (choice === "save") {
        await this.saveChangesBeforeClose();
      }
    }
    this.disposeRightEditorObserver();
    this.contentEl.empty();
  }
  /** Rerenders only when a compared path changed. */
  refreshForPath(path) {
    if (path === this.state.leftPath || path === this.state.rightPath) {
      void this.renderDiff(this.getScrollPosition());
    }
  }
  /** Handles view shortcuts before Obsidian's global key handlers can consume them. */
  handleGlobalKeydown(event) {
    if (!event.target || !this.contentEl.contains(event.target)) {
      return;
    }
    this.handleKeydown(event);
  }
  /** Captures the edit position before a browser input changes the right-side line structure. */
  handleBeforeInput(event) {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    const selection = this.contentEl.ownerDocument.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const startLine = this.getEditableBoundaryLine(editor, range.startContainer, range.startOffset, "start");
    const endLine = this.getEditableBoundaryLine(editor, range.endContainer, range.endOffset, "end");
    if (!startLine || !endLine) {
      return;
    }
    const rightLines = this.getEditableLines(editor);
    const startIndex = rightLines.indexOf(startLine);
    if (startIndex < 0) {
      return;
    }
    const endIndex = rightLines.indexOf(endLine);
    const code = startLine.querySelector(".file-diff-sbs-edit-code");
    const startOffset = code && code.contains(range.startContainer) ? this.getEditableCodeOffset(code, range.startContainer, range.startOffset) : 0;
    const isDeletion = String(event.inputType || "").startsWith("delete");
    let preferredIndex = startIndex;
    if (isDeletion) {
      preferredIndex = !range.collapsed || startLine !== endLine ? startIndex : event.inputType === "deleteContentBackward" && startOffset === 0 ? startIndex : startIndex + 1;
    } else if (startOffset > 0) {
      preferredIndex = startIndex + 1;
    }
    this.editInputSnapshot = {
      editor,
      rightCount: rightLines.length,
      preferredIndex,
      selectionRemovesLines: isDeletion && !range.collapsed && endIndex > startIndex
    };
  }
  /** Inserts compensating blank lines after the browser has changed the right-side line count. */
  handleInput(event) {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    if (!editor) {
      return;
    }
    const snapshot = this.editInputSnapshot?.editor === editor ? this.editInputSnapshot : null;
    this.editInputSnapshot = null;
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    this.markDeletedSelectionGap(editor, snapshot);
    const editedLine = this.getEditableLine(event.target);
    const editedCode = editedLine?.querySelector(".file-diff-sbs-edit-code");
    if (editedLine && editedCode && editedCode.textContent) {
      editedLine.dataset.rightPresent = "true";
    }
    const leftCount = this.getEditableLines(leftPane).length;
    const rightCount = this.getEditableLines(editor).length;
    if (leftCount !== rightCount) {
      this.synchronizeEditablePanes(editor, snapshot?.preferredIndex);
    } else {
      this.updateEditableLineNumbers(editor);
      this.synchronizeEditableLineHeights(editor);
    }
    this.updateSaveButtonState();
  }
  /** Schedules a post-edit alignment pass after the browser has finished changing the DOM. */
  scheduleEditablePaneSync(editor) {
    if (this.editSyncFrame !== null) {
      return;
    }
    this.editSyncFrame = this.contentEl.ownerDocument.defaultView.requestAnimationFrame(() => {
      this.editSyncFrame = null;
      if (!this.state.editRight || !editor.isConnected) {
        return;
      }
      const snapshot = this.editInputSnapshot?.editor === editor ? this.editInputSnapshot : null;
      this.editInputSnapshot = null;
      this.synchronizeEditablePanes(editor, snapshot?.preferredIndex);
    });
  }
  /** Schedules a final alignment pass after keyboard-driven editing has completed. */
  handleEditKeyup(event) {
    if (!this.state.editRight) {
      return;
    }
    const editor = this.getEditableEditor(event.target);
    if (editor) {
      this.scheduleEditablePaneSync(editor);
    }
  }
  /** Disconnects the observer used to keep the two editable panes aligned. */
  disposeRightEditorObserver() {
    this.rightEditorState?.observer?.disconnect();
    this.rightEditorState = null;
    this.saveButton = null;
    if (this.editSyncFrame !== null) {
      this.contentEl.ownerDocument.defaultView.cancelAnimationFrame(this.editSyncFrame);
      this.editSyncFrame = null;
    }
    this.editInputSnapshot = null;
  }
  /** Saves pending diff changes or the editable right side when the user presses Ctrl/Cmd+S. */
  handleKeydown(event) {
    if (this.state.editRight && event.key === "Enter" && this.insertEditableLineBreak()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.state.editRight && (event.key === "Backspace" || event.key === "Delete")) {
      const editor = this.getEditableEditor(event.target);
      if (editor) {
        this.scheduleEditablePaneSync(editor);
      }
    }
    if (!event.ctrlKey && !event.metaKey || event.key.toLowerCase() !== "s") {
      return;
    }
    const canSave = this.state.editRight ? this.hasRightEditorChanges() : this.hasPendingChanges();
    if (!canSave) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void (this.state.editRight ? this.saveRightEdits() : this.savePendingChanges());
  }
  /** Keeps the view in sync when a compared file is renamed. */
  handleRename(file, oldPath) {
    let changed = false;
    if (this.state.leftPath === oldPath) {
      this.state.leftPath = file.path;
      changed = true;
    }
    if (this.state.rightPath === oldPath) {
      this.state.rightPath = file.path;
      changed = true;
    }
    if (changed) {
      void this.renderDiff(this.getScrollPosition());
    }
  }
  /** Loads the active comparison or the initial left-hand file selection. */
  async renderDiff(scrollPosition = null) {
    this.disposeRightEditorObserver();
    const token = ++this.renderToken;
    this.contentEl.empty();
    this.contentEl.addClass("file-diff-sbs-view");
    const leftFile = this.app.vault.getAbstractFileByPath(this.state.leftPath);
    if (!(leftFile instanceof TFile)) {
      this.renderMessage(this.translate("view.leftUnavailable"));
      return;
    }
    try {
      const storedLeftContent = await this.app.vault.cachedRead(leftFile);
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      if (token !== this.renderToken) {
        return;
      }
      if (!this.state.rightPath) {
        this.buildSelectionLayout(leftFile, splitLines(leftContent));
        this.restoreScrollPosition(scrollPosition);
        return;
      }
      const rightFile = this.app.vault.getAbstractFileByPath(this.state.rightPath);
      if (!(rightFile instanceof TFile)) {
        this.renderMessage(this.translate("view.rightUnavailable"));
        return;
      }
      const storedRightContent = await this.app.vault.cachedRead(rightFile);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      if (token !== this.renderToken) {
        return;
      }
      this.buildLayout(leftFile, rightFile, splitLines(leftContent), splitLines(rightContent));
      this.restoreScrollPosition(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Dateien nicht lesen.", error);
      this.renderMessage(this.translate("view.readFailed"));
    }
  }
  /** Captures the current diff scroll position before a rerender. */
  getScrollPosition() {
    const scroll = this.contentEl.querySelector(".file-diff-sbs-scroll, .file-diff-sbs-selection-scroll");
    const editor = this.contentEl.querySelector(".file-diff-sbs-document-editor");
    return scroll ? {
      top: scroll.scrollTop,
      left: scroll.scrollLeft,
      editorTop: editor?.scrollTop || 0,
      editorLeft: editor?.scrollLeft || 0
    } : null;
  }
  /** Restores a previously captured scroll position after the diff is rebuilt. */
  restoreScrollPosition(position) {
    if (!position) {
      return;
    }
    const scroll = this.contentEl.querySelector(".file-diff-sbs-scroll, .file-diff-sbs-selection-scroll");
    if (scroll) {
      scroll.scrollTop = position.top;
      scroll.scrollLeft = position.left;
    }
    const editor = this.contentEl.querySelector(".file-diff-sbs-document-editor");
    if (editor) {
      editor.scrollTop = position.editorTop || 0;
      editor.scrollLeft = position.editorLeft || 0;
    }
  }
  /** Opens a file picker for the right-hand pane. */
  selectRightFile(leftFile) {
    const files = this.app.vault.getFiles().filter((file) => isTextFile(file) && file.path !== leftFile.path).sort((a, b) => a.path.localeCompare(b.path, this.plugin.language));
    const modal = new FilePickerModal(this.app, files, (rightFile) => {
      if (rightFile) {
        void this.applyRightFile(leftFile, rightFile);
      }
    }, this.plugin.language);
    modal.setPlaceholder(this.translate("picker.rightFile"));
    modal.open();
  }
  /** Applies the selected right file and redraws the comparison view. */
  async applyRightFile(leftFile, rightFile) {
    const nextState = { leftPath: leftFile.path, rightPath: rightFile.path, editRight: false, mode: "compare" };
    this.state = nextState;
    this.pendingFileContents.clear();
    this.dismissedRows.clear();
    try {
      await this.renderDiff();
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Auswahl nicht anwenden.", error);
      new Notice(this.translate("notice.selectedFileLoadFailed"));
    }
  }
  /** Enables editing for the current right-hand file without changing either file. */
  async enableRightEditMode() {
    if (!this.state.rightPath || this.state.editRight) {
      return;
    }
    this.dismissedRows.clear();
    await this.setState({ ...this.state, editRight: true }, {});
  }
  /** Leaves editing without discarding unsaved changes in the right-hand rows. */
  async disableRightEditMode() {
    if (!this.state.editRight) {
      return;
    }
    const hasUnsavedChanges = this.rightEditorState && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    if (hasUnsavedChanges) {
      new Notice(this.translate("notice.saveFirst"));
      return;
    }
    await this.setState({ ...this.state, editRight: false }, {});
  }
  /** Returns whether editing or diff actions have produced unsaved changes. */
  hasUnsavedChanges() {
    const editorChanged = this.state.editRight && this.rightEditorState && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue;
    return Boolean(editorChanged || this.hasPendingChanges());
  }
  /** Writes all current changes without rebuilding the view during close. */
  async saveChangesBeforeClose() {
    try {
      if (this.state.editRight && this.rightEditorState) {
        const rightFile = this.app.vault.getAbstractFileByPath(this.state.rightPath);
        if (!(rightFile instanceof TFile)) {
          new Notice(this.translate("view.rightUnavailable"));
          return;
        }
        const currentContent = await this.app.vault.read(rightFile);
        const editedContent = convertLineEndings(this.serializeRightEditor(this.rightEditorState.editor), currentContent);
        await this.app.vault.modify(rightFile, editedContent);
        this.pendingFileContents.delete(rightFile.path);
      }
      if (this.hasPendingChanges() && !await this.writePendingChanges()) {
        new Notice(this.translate("notice.pendingFileUnavailable"));
      }
    } catch (error) {
      console.error("Side-by-Side Diff konnte \xC4nderungen vor dem Schlie\xDFen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Saves all edited right-side rows back to the right-hand vault file. */
  async saveRightEdits() {
    if (!this.hasRightEditorChanges()) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
    const rightFile = this.app.vault.getAbstractFileByPath(this.state.rightPath);
    if (!(rightFile instanceof TFile)) {
      new Notice(this.translate("view.rightUnavailable"));
      return;
    }
    try {
      const currentContent = await this.app.vault.read(rightFile);
      if (!this.rightEditorState) {
        return;
      }
      const editedContent = convertLineEndings(this.serializeRightEditor(this.rightEditorState.editor), currentContent);
      await this.app.vault.modify(rightFile, editedContent);
      this.pendingFileContents.delete(rightFile.path);
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die rechten \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Inserts a real editable line at the current single-line selection. */
  insertEditableLineBreak() {
    const selection = this.contentEl.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    const line = this.getEditableLine(range.startContainer);
    if (!line || line !== this.getEditableLine(range.endContainer)) {
      return false;
    }
    const code = line.querySelector(".file-diff-sbs-edit-code");
    if (!code || !code.contains(range.startContainer) || !code.contains(range.endContainer)) {
      return false;
    }
    const text = code.textContent || "";
    const startOffset = this.getEditableCodeOffset(code, range.startContainer, range.startOffset);
    const endOffset = this.getEditableCodeOffset(code, range.endContainer, range.endOffset);
    const before = text.slice(0, startOffset);
    const after = text.slice(endOffset);
    line.dataset.rightPresent = "true";
    code.textContent = before;
    const newLine = line.cloneNode(false);
    newLine.dataset.rightPresent = "true";
    newLine.textContent = "";
    const lineNumber = line.ownerDocument.createElement("span");
    lineNumber.className = "file-diff-sbs-line-number file-diff-sbs-edit-line-number";
    lineNumber.setAttribute("contenteditable", "false");
    const newCode = line.ownerDocument.createElement("span");
    newCode.className = "file-diff-sbs-edit-code";
    newCode.textContent = after;
    newLine.append(lineNumber, newCode);
    line.after(newLine);
    const editor = line.parentElement;
    if (editor) {
      const newLineIndex = this.getEditableLines(editor).indexOf(newLine);
      this.synchronizeEditablePanes(editor, newLineIndex);
    }
    this.setEditableCaret(newCode, 0);
    this.updateSaveButtonState();
    return true;
  }
  /** Finds the editable diff line containing a DOM selection boundary. */
  getEditableLine(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest(".file-diff-sbs-edit-line") || null;
  }
  /** Finds the shared document editor for an input or keyboard event target. */
  getEditableEditor(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest(".file-diff-sbs-document-editor") || null;
  }
  /** Resolves selections that start or end directly on the contenteditable container. */
  getEditableBoundaryLine(editor, node, offset, direction) {
    const line = this.getEditableLine(node);
    if (line) {
      return line;
    }
    if (node !== editor) {
      return null;
    }
    const lines = this.getEditableLines(editor);
    if (lines.length === 0) {
      return null;
    }
    const rawIndex = direction === "end" ? Math.max(0, offset - 1) : offset;
    return lines[Math.min(rawIndex, lines.length - 1)] || null;
  }
  /** Marks Chromium's retained empty line as a visual gap after multi-line deletion. */
  markDeletedSelectionGap(editor, snapshot) {
    if (!snapshot?.selectionRemovesLines) {
      return;
    }
    const lines = this.getEditableLines(editor);
    const line = lines[snapshot.preferredIndex] || null;
    const code = line?.querySelector(".file-diff-sbs-edit-code");
    if (!line || !code || code.textContent?.trim()) {
      return;
    }
    line.dataset.rightPresent = "false";
    line.classList.add("file-diff-sbs-edit-gap");
  }
  /** Returns the text offset of a DOM selection boundary inside an editable code span. */
  getEditableCodeOffset(code, node, offset) {
    if (!code.contains(node)) {
      return 0;
    }
    const range = code.ownerDocument.createRange();
    range.selectNodeContents(code);
    range.setEnd(node, offset);
    return range.toString().length;
  }
  /** Returns the editable line elements belonging directly to a pane or editor. */
  getEditableLines(parent) {
    return Array.from(parent.children).filter((child) => child.classList.contains("file-diff-sbs-cell") || child.classList.contains("file-diff-sbs-edit-line"));
  }
  /** Finds the read-only left pane belonging to an editable comparison grid. */
  getEditableLeftPane(editor) {
    const grid = editor.closest(".file-diff-sbs-edit-grid");
    return grid?.querySelector(".file-diff-sbs-edit-pane:not(.file-diff-sbs-edit-right-pane)") || null;
  }
  /** Keeps both edit panes aligned by inserting blank lines at the changed position. */
  synchronizeEditablePanes(editor, preferredIndex = null) {
    this.normalizeEditableEditor(editor);
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    const leftLines = this.getEditableLines(leftPane);
    const rightLines = this.getEditableLines(editor);
    const syncPlan = getLineSyncPlan(leftLines.length, rightLines.length, preferredIndex);
    while (this.getEditableLines(leftPane).length < syncPlan.targetCount) {
      const currentLines = this.getEditableLines(leftPane);
      const reference = currentLines[syncPlan.insertionIndex] || null;
      const gap = this.createEditableLeftGap(leftPane);
      leftPane.insertBefore(gap, reference);
    }
    while (this.getEditableLines(editor).length < syncPlan.targetCount) {
      const currentLines = this.getEditableLines(editor);
      const reference = currentLines[syncPlan.insertionIndex] || null;
      const gap = this.createEditableRightGap(editor);
      editor.insertBefore(gap, reference);
    }
    this.updateEditableLineNumbers(editor);
    this.synchronizeEditableLineHeights(editor);
  }
  /** Matches paired line heights so wrapped content keeps following rows aligned. */
  synchronizeEditableLineHeights(editor) {
    const leftPane = this.getEditableLeftPane(editor);
    if (!leftPane) {
      return;
    }
    const leftLines = this.getEditableLines(leftPane);
    const rightLines = this.getEditableLines(editor);
    const lineCount = Math.min(leftLines.length, rightLines.length);
    for (let index = 0; index < lineCount; index += 1) {
      leftLines[index].style.minHeight = "";
      rightLines[index].style.minHeight = "";
    }
    for (let index = 0; index < lineCount; index += 1) {
      const height = Math.max(leftLines[index].getBoundingClientRect().height, rightLines[index].getBoundingClientRect().height);
      if (height > 0) {
        leftLines[index].style.minHeight = `${height}px`;
        rightLines[index].style.minHeight = `${height}px`;
      }
    }
  }
  /** Converts browser-generated direct editor nodes into normal editable line elements. */
  normalizeEditableEditor(editor) {
    for (const node of Array.from(editor.childNodes)) {
      if (node.nodeType === 1 && node.classList.contains("file-diff-sbs-edit-line")) {
        continue;
      }
      const text = node.innerText || node.textContent || "";
      const line = this.createEditableRightGap(editor);
      line.querySelector(".file-diff-sbs-edit-code").textContent = text;
      editor.insertBefore(line, node);
      editor.removeChild(node);
    }
  }
  /** Creates a blank read-only line that preserves left-side vertical alignment. */
  createEditableLeftGap(parent) {
    const cell = parent.createDiv({ cls: "file-diff-sbs-cell file-diff-sbs-edit-gap" });
    cell.createSpan({ cls: "file-diff-sbs-line-number" });
    cell.createSpan({ cls: "file-diff-sbs-code", text: " " });
    return cell;
  }
  /** Creates a blank editable line that preserves right-side vertical alignment. */
  createEditableRightGap(parent) {
    const line = this.buildEditableRightLine(parent, { left: "", right: "", equal: true });
    line.dataset.rightPresent = "false";
    line.classList.add("file-diff-sbs-edit-gap");
    return line;
  }
  /** Updates right-side line numbers after a manual line insertion. */
  updateEditableLineNumbers(editor) {
    let lineNumber = 0;
    for (const line of this.getEditableLines(editor)) {
      const numberElement = line.querySelector(".file-diff-sbs-edit-line-number");
      if (!numberElement) {
        continue;
      }
      if (line.dataset.rightPresent === "false") {
        numberElement.textContent = "";
        continue;
      }
      lineNumber += 1;
      numberElement.textContent = String(lineNumber);
    }
  }
  /** Places the caret at a character offset inside an editable code span. */
  setEditableCaret(code, offset) {
    const editor = code.closest(".file-diff-sbs-document-editor");
    editor?.focus();
    const document2 = code.ownerDocument;
    const selection = document2.getSelection();
    if (!selection) {
      return;
    }
    const range = document2.createRange();
    const textNode = code.firstChild;
    if (textNode) {
      range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0));
    } else {
      range.setStart(code, 0);
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  /** Returns the currently displayed content, including changes pending for a file. */
  getDisplayedContent(path, storedContent) {
    return this.pendingFileContents.has(path) ? this.pendingFileContents.get(path) : storedContent;
  }
  /** Returns whether the comparison contains changes waiting to be saved. */
  hasPendingChanges() {
    return this.pendingFileContents.size > 0;
  }
  /** Resolves the vault files represented by pending comparison changes. */
  getPendingFiles() {
    return Array.from(this.pendingFileContents.entries()).map(([path, content]) => ({
      file: this.app.vault.getAbstractFileByPath(path),
      content
    }));
  }
  /** Writes pending comparison changes and clears them after all files succeed. */
  async writePendingChanges() {
    const pendingFiles = this.getPendingFiles();
    if (pendingFiles.some(({ file }) => !(file instanceof TFile))) {
      return false;
    }
    for (const { file, content } of pendingFiles) {
      await this.app.vault.modify(file, content);
    }
    this.pendingFileContents.clear();
    return true;
  }
  /** Saves all changes staged through the comparison controls. */
  async savePendingChanges() {
    if (!this.hasPendingChanges()) {
      return;
    }
    const scrollPosition = this.getScrollPosition();
    try {
      if (!await this.writePendingChanges()) {
        new Notice(this.translate("notice.pendingFileUnavailable"));
        return;
      }
      new Notice(this.translate("notice.saved"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte vorgemerkte \xC4nderungen nicht speichern.", error);
      new Notice(this.translate("notice.saveFailed"));
    }
  }
  /** Stages one changed aligned row for saving instead of modifying a file immediately. */
  async applyRowChange(rowIndex, direction) {
    const scrollPosition = this.getScrollPosition();
    const leftFile = this.app.vault.getAbstractFileByPath(this.state.leftPath);
    const rightFile = this.app.vault.getAbstractFileByPath(this.state.rightPath);
    if (!(leftFile instanceof TFile) || !(rightFile instanceof TFile)) {
      new Notice(this.translate("notice.comparedFilesUnavailable"));
      return;
    }
    try {
      const [storedLeftContent, storedRightContent] = await Promise.all([
        this.app.vault.cachedRead(leftFile),
        this.app.vault.cachedRead(rightFile)
      ]);
      const leftContent = this.getDisplayedContent(leftFile.path, storedLeftContent);
      const rightContent = this.getDisplayedContent(rightFile.path, storedRightContent);
      const rows = indexDiffRows(
        alignSequences(splitLines(leftContent), splitLines(rightContent), (a, b) => a === b)
      );
      const row = rows[rowIndex];
      if (!row || row.equal) {
        return;
      }
      const leftToRight = direction === "left-to-right";
      const { leftLines: nextLeftLines, rightLines: nextRightLines } = applyAlignedRowChange(
        splitLines(leftContent),
        splitLines(rightContent),
        row,
        direction
      );
      const targetFile = leftToRight ? rightFile : leftFile;
      const targetContent = leftToRight ? rightContent : leftContent;
      const targetLines = leftToRight ? nextRightLines : nextLeftLines;
      this.pendingFileContents.set(targetFile.path, joinLines(targetLines, targetContent));
      new Notice(this.translate("notice.staged"));
      await this.renderDiff(scrollPosition);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die \xC4nderung nicht \xFCbernehmen.", error);
      new Notice(this.translate("notice.changeFailed"));
    }
  }
  /** Shows a short error message inside the view. */
  renderMessage(message) {
    this.contentEl.createDiv({ cls: "file-diff-sbs-message", text: message });
  }
  /** Shows the left file and an inline picker before a right file is selected. */
  buildSelectionLayout(leftFile, leftLines) {
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    const toolbar = root.createDiv({ cls: "file-diff-sbs-toolbar" });
    const title = toolbar.createDiv({ cls: "file-diff-sbs-title" });
    title.createSpan({
      text: this.translate("view.title.selection", {
        label: this.translate("view.labels.comparison"),
        name: leftFile.name
      }),
      cls: "file-diff-sbs-title-main"
    });
    title.createEl("small", { text: this.translate("view.selection.leftFixed") });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: this.translate("view.selection.none") });
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    this.buildFileHeader(header, leftFile, this.translate("view.labels.comparison"));
    const rightHeader = header.createDiv({ cls: "file-diff-sbs-file-header" });
    rightHeader.createSpan({ text: this.translate("view.labels.comparison"), cls: "file-diff-sbs-side-label" });
    const chooseHeaderButton = rightHeader.createEl("button", { text: this.translate("view.selection.chooseFile") });
    chooseHeaderButton.addEventListener("click", () => void this.selectRightFile(leftFile));
    const scroll = root.createDiv({ cls: "file-diff-sbs-selection-scroll" });
    const panes = scroll.createDiv({ cls: "file-diff-sbs-selection-grid" });
    this.buildSingleFilePane(panes.createDiv({ cls: "file-diff-sbs-single-pane" }), leftLines);
    const rightPane = panes.createDiv({ cls: "file-diff-sbs-picker-pane" });
    const pickerCard = rightPane.createDiv({ cls: "file-diff-sbs-picker-card" });
    pickerCard.createEl("h3", { text: this.translate("view.selection.rightFile") });
    pickerCard.createEl("p", { text: this.translate("view.selection.description") });
    const chooseButton = pickerCard.createEl("button", {
      text: this.translate("view.selection.openSearch"),
      cls: "mod-cta"
    });
    chooseButton.addEventListener("click", () => void this.selectRightFile(leftFile));
  }
  /** Returns pane labels for proposal, acceptance and regular comparison modes. */
  getPaneLabels() {
    if (this.state.mode === "proposal") {
      return {
        left: this.translate("view.labels.original"),
        right: this.translate("view.labels.proposal")
      };
    }
    if (this.state.mode === "accept") {
      return {
        left: this.translate("view.labels.proposal"),
        right: this.translate("view.labels.original")
      };
    }
    return {
      left: this.translate("view.labels.comparison"),
      right: this.translate("view.labels.comparison")
    };
  }
  /** Renders one file without diff decorations while the other pane is pending. */
  buildSingleFilePane(parent, lines) {
    for (let index = 0; index < lines.length; index += 1) {
      const row = parent.createDiv({ cls: "file-diff-sbs-single-row" });
      row.createSpan({ cls: "file-diff-sbs-line-number", text: String(index + 1) });
      row.createSpan({ cls: "file-diff-sbs-code", text: lines[index] || " " });
    }
  }
  /** Builds toolbar, file headers and the aligned diff rows. */
  buildLayout(leftFile, rightFile, leftLines, rightLines) {
    const paneLabels = this.getPaneLabels();
    const root = this.contentEl.createDiv({ cls: "file-diff-sbs-root" });
    const rows = indexDiffRows(alignSequences(leftLines, rightLines, (a, b) => a === b));
    const changedRows = rows.filter((row) => !row.equal);
    const dismissedCount = changedRows.filter((row) => this.dismissedRows.has(getDiffRowKey(row))).length;
    const visibleChangedCount = changedRows.length - dismissedCount;
    const summaryParts = [this.translate(
      visibleChangedCount === 1 ? "view.summary.changedOne" : "view.summary.changedMany",
      { count: visibleChangedCount }
    )];
    if (dismissedCount > 0) {
      summaryParts.push(this.translate("view.summary.ignored", { count: dismissedCount }));
    }
    const summary = summaryParts.join(" \xB7 ");
    const toolbar = root.createDiv({ cls: "file-diff-sbs-toolbar" });
    const title = toolbar.createDiv({ cls: "file-diff-sbs-title" });
    title.createSpan({
      text: this.translate("view.title.comparison", {
        leftLabel: paneLabels.left,
        leftName: leftFile.name,
        rightLabel: paneLabels.right,
        rightName: rightFile.name
      }),
      cls: "file-diff-sbs-title-main"
    });
    title.createEl("small", {
      text: this.state.editRight ? this.translate("view.hint.edit") : this.state.mode === "accept" ? this.translate("view.hint.accept") : this.translate("view.hint.compare")
    });
    toolbar.createDiv({ cls: "file-diff-sbs-summary", text: summary });
    const actionToolbar = root.createDiv({ cls: "file-diff-sbs-action-toolbar" });
    const actions = actionToolbar.createDiv({ cls: "file-diff-sbs-actions" });
    if (!this.state.editRight) {
      const editButton = actions.createEl("button", { text: this.translate("actions.edit") });
      editButton.title = this.translate("actions.editTitle");
      editButton.addEventListener("click", () => void this.enableRightEditMode());
      const swapButton = actions.createEl("button", { text: this.translate("actions.swap") });
      swapButton.title = this.translate("actions.swapTitle");
      swapButton.addEventListener("click", () => void this.swapFiles());
      const saveButton = actions.createEl("button", {
        text: this.translate("actions.savePending"),
        cls: "mod-cta file-diff-sbs-save-action"
      });
      saveButton.title = this.translate("actions.savePendingTitle");
      saveButton.addEventListener("click", () => void this.savePendingChanges());
      this.saveButton = saveButton;
    } else {
      const compareButton = actions.createEl("button", { text: this.translate("actions.compareMode") });
      compareButton.title = this.translate("actions.compareModeTitle");
      compareButton.addEventListener("click", () => void this.disableRightEditMode());
      const saveButton = actions.createEl("button", {
        text: this.translate("actions.saveRight"),
        cls: "mod-cta file-diff-sbs-save-action"
      });
      saveButton.title = this.translate("actions.saveRightTitle");
      saveButton.addEventListener("click", () => void this.saveRightEdits());
      this.saveButton = saveButton;
    }
    this.updateSaveButtonState();
    const header = root.createDiv({ cls: "file-diff-sbs-header" });
    this.buildFileHeader(header, leftFile, paneLabels.left);
    this.buildFileHeader(
      header,
      rightFile,
      this.state.editRight ? `${paneLabels.right} \xB7 ${this.translate("view.labels.edit")}` : paneLabels.right
    );
    const allChangesResolved = !this.state.editRight && visibleChangedCount === 0 && (changedRows.length > 0 || this.hasPendingChanges());
    if (allChangesResolved) {
      this.buildResolvedMessage(root);
    } else if (changedRows.length === 0) {
      this.buildIdenticalMessage(root, leftFile, rightFile);
    }
    const scroll = root.createDiv({ cls: "file-diff-sbs-scroll" });
    const grid = scroll.createDiv({
      cls: this.state.editRight ? "file-diff-sbs-edit-grid" : "file-diff-sbs-grid"
    });
    if (this.state.editRight) {
      this.buildEditableModeLayout(grid, rows);
      return;
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.equal && this.dismissedRows.has(getDiffRowKey(row))) {
        const ignoredRow = getIgnoredDiffRow(row);
        if (!ignoredRow) {
          continue;
        }
        this.buildRow(grid, ignoredRow, index);
        continue;
      }
      this.buildRow(grid, row, index);
    }
  }
  /** Builds the editable right document beside the read-only left diff pane. */
  buildEditableModeLayout(parent, rows) {
    const leftPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane" });
    for (const row of rows) {
      this.buildEditableLeftCell(leftPane, row);
    }
    const rightPane = parent.createDiv({ cls: "file-diff-sbs-edit-pane file-diff-sbs-edit-right-pane" });
    const editor = rightPane.createDiv({ cls: "file-diff-sbs-document-editor" });
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", this.translate("editor.rightFileAria"));
    for (const row of rows.length > 0 ? rows : [{ left: null, right: null, equal: true }]) {
      this.buildEditableRightLine(editor, row);
    }
    this.synchronizeEditablePanes(editor);
    const observer = new editor.ownerDocument.defaultView.MutationObserver(() => this.scheduleEditablePaneSync(editor));
    observer.observe(editor, { childList: true, subtree: true });
    this.rightEditorState = { editor, initialValue: this.serializeRightEditor(editor), observer };
    this.updateSaveButtonState();
  }
  /** Renders one read-only left-side row beside the document editor. */
  buildEditableLeftCell(parent, row) {
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = row.left === null ? "" : String(row.leftLineNumber);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, row.left, row.right, "left");
  }
  /** Renders one editable right-side line inside the shared document editor. */
  buildEditableRightLine(parent, row) {
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    const line = parent.createDiv({ cls: `file-diff-sbs-edit-line file-diff-sbs-${rowType}` });
    line.dataset.rightPresent = row.right === null ? "false" : "true";
    const lineNumber = line.createSpan({ cls: "file-diff-sbs-line-number file-diff-sbs-edit-line-number" });
    lineNumber.textContent = row.right === null ? "" : String(row.rightLineNumber);
    lineNumber.setAttribute("contenteditable", "false");
    const code = line.createSpan({ cls: "file-diff-sbs-edit-code" });
    code.textContent = row.right === null ? "" : row.right;
    return line;
  }
  /** Serializes editable right-side lines without including the line-number gutter. */
  serializeRightEditor(editor) {
    const children = Array.from(editor.children);
    if (children.length === 0) {
      return (editor.innerText || editor.textContent || "").replace(/\r\n?/g, "\n");
    }
    return serializeEditableLines(children.map((line) => {
      const code = line.querySelector(".file-diff-sbs-edit-code");
      const value = code ? code.innerText : line.innerText || line.textContent || "";
      return {
        value,
        isAlignmentGap: line.classList.contains("file-diff-sbs-edit-gap") || line.classList.contains("file-diff-sbs-added") && value.trim() === "",
        rightPresent: line.dataset.rightPresent !== "false"
      };
    }));
  }
  /** Returns whether the editable right side differs from its saved snapshot. */
  hasRightEditorChanges() {
    return Boolean(
      this.state.editRight && this.rightEditorState && this.serializeRightEditor(this.rightEditorState.editor) !== this.rightEditorState.initialValue
    );
  }
  /** Enables or disables the visible save action based on current changes. */
  updateSaveButtonState() {
    if (!this.saveButton) {
      return;
    }
    const hasChanges = this.state.editRight ? this.hasRightEditorChanges() : this.hasPendingChanges();
    this.saveButton.disabled = !hasChanges;
    this.saveButton.setAttribute("aria-disabled", String(!hasChanges));
  }
  /** Shows the identical-file message and the actions available for the current mode. */
  buildIdenticalMessage(parent, leftFile, rightFile) {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.identical.title") });
    if (this.state.editRight) {
      message.createEl("span", { text: this.translate("messages.identical.edit") });
      return;
    }
    message.createEl("span", { text: this.translate("messages.identical.trash") });
    const actions = message.createDiv({ cls: "file-diff-sbs-identical-actions" });
    const deleteLeftButton = actions.createEl("button", { text: this.translate("messages.identical.deleteLeft") });
    deleteLeftButton.title = leftFile.path;
    deleteLeftButton.addEventListener("click", () => this.confirmDeleteIdenticalFile(leftFile));
    const deleteRightButton = actions.createEl("button", { text: this.translate("messages.identical.deleteRight") });
    deleteRightButton.title = rightFile.path;
    deleteRightButton.addEventListener("click", () => this.confirmDeleteIdenticalFile(rightFile));
  }
  /** Shows that every detected suggestion was accepted or dismissed. */
  buildResolvedMessage(parent) {
    const message = parent.createDiv({ cls: "file-diff-sbs-identical-message" });
    message.createEl("strong", { text: this.translate("messages.resolved.title") });
    message.createEl("span", {
      text: this.hasPendingChanges() ? this.translate("messages.resolved.pending") : this.translate("messages.resolved.none")
    });
  }
  /** Adds a pane header with side label and vault-relative path. */
  buildFileHeader(parent, file, sideLabel) {
    const header = parent.createDiv({ cls: "file-diff-sbs-file-header" });
    header.createSpan({ text: sideLabel, cls: "file-diff-sbs-side-label" });
    header.createSpan({ text: file.name, cls: "file-diff-sbs-file-path" });
  }
  /** Confirms and performs moving an identical file to the system trash. */
  confirmDeleteIdenticalFile(file) {
    new DeleteIdenticalFileModal(this.app, file, async () => {
      try {
        await this.app.fileManager.trashFile(file);
        new Notice(this.translate("notice.fileTrashed", { name: file.name }));
        this.leaf.detach();
      } catch (error) {
        console.error("Side-by-Side Diff konnte die identische Datei nicht verschieben.", error);
        new Notice(this.translate("notice.fileTrashFailed"));
      }
    }, this.translate.bind(this)).open();
  }
  /** Renders one aligned pair of lines with line numbers, actions and inline changes. */
  buildRow(parent, row, rowIndex) {
    const rowElement = parent.createDiv({ cls: "file-diff-sbs-row" });
    const rowType = row.equal ? "equal" : row.left === null ? "added" : row.right === null ? "removed" : "changed";
    this.buildCell(rowElement, row.left, row.right, row.leftLineNumber, "left", rowType, row);
    this.buildActionCell(rowElement, row, rowIndex);
    this.buildCell(rowElement, row.right, row.left, row.rightLineNumber, "right", rowType, row);
  }
  /** Adds centered buttons for copying or ignoring a changed row in read-only mode. */
  buildActionCell(parent, row, rowIndex) {
    const cell = parent.createDiv({ cls: "file-diff-sbs-action-cell" });
    if (row.equal || this.state.editRight) {
      return;
    }
    const leftToRight = cell.createEl("button", { text: "\u2192", cls: "file-diff-sbs-merge-button" });
    leftToRight.title = this.state.mode === "accept" ? this.translate("actions.acceptProposal") : this.translate("actions.copyLeftToRight");
    leftToRight.addEventListener("click", () => void this.applyRowChange(rowIndex, "left-to-right"));
    const dismissButton = cell.createEl("button", { text: "\xD7", cls: "file-diff-sbs-merge-button" });
    dismissButton.title = this.translate("actions.dismiss");
    dismissButton.addEventListener("click", () => this.dismissRow(row));
  }
  /** Ignores one left-side change while keeping the right-side content visible. */
  dismissRow(row) {
    const scrollPosition = this.getScrollPosition();
    this.dismissedRows.add(getDiffRowKey(row));
    void this.renderDiff(scrollPosition);
  }
  /** Renders one side of a diff row. */
  buildCell(parent, value, counterpart, lineNumberValue, side, rowType, row) {
    const cell = parent.createDiv({ cls: `file-diff-sbs-cell file-diff-sbs-${rowType}` });
    const lineNumber = cell.createSpan({ cls: "file-diff-sbs-line-number" });
    lineNumber.textContent = value === null ? "" : String(lineNumberValue);
    const code = cell.createSpan({ cls: "file-diff-sbs-code" });
    appendInlineDiff(code, side === "left" ? value : counterpart, side === "left" ? counterpart : value, side);
  }
  /** Swaps the files while keeping the current diff view open. */
  async swapFiles() {
    this.dismissedRows.clear();
    const mode = this.state.mode === "accept" ? "proposal" : this.state.mode === "proposal" ? "accept" : "compare";
    const nextState = {
      leftPath: this.state.rightPath,
      rightPath: this.state.leftPath,
      editRight: false,
      mode
    };
    await this.setState(nextState, {});
  }
};
var FileDiffSettingsTab = class extends PluginSettingTab {
  /** Creates the settings tab for the file diff plugin. */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /** Renders the ribbon visibility setting. */
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(this.plugin.translate("settings.language.name")).setDesc(this.plugin.translate("settings.language.description")).addDropdown((dropdown) => {
      dropdown.addOption("auto", this.plugin.translate("settings.language.auto")).addOption("de", this.plugin.translate("settings.language.de")).addOption("en", this.plugin.translate("settings.language.en")).setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.updateLanguage(value);
        await this.plugin.saveSettings();
        this.display();
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.ribbon.name")).setDesc(this.plugin.translate("settings.ribbon.description")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showRibbonIcon).onChange(async (value) => {
        this.plugin.settings.showRibbonIcon = value;
        this.plugin.updateRibbonVisibility();
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName(this.plugin.translate("settings.suffix.name")).setDesc(this.plugin.translate("settings.suffix.description")).addText((text) => {
      text.setPlaceholder("_changes_").setValue(this.plugin.settings.changeCopySuffix).onChange(async (value) => {
        this.plugin.settings.changeCopySuffix = sanitizeCopySuffix(value) || DEFAULT_SETTINGS.changeCopySuffix;
        text.setValue(this.plugin.settings.changeCopySuffix);
        await this.plugin.saveSettings();
      });
    });
  }
};
var FileDiffSideBySidePlugin = class extends Plugin {
  /** Loads settings and registers the view, commands and ribbon action. */
  async onload() {
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
        if (!(file instanceof TFile) || file.path !== this.app.workspace.getActiveFile()?.path) {
          return;
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.compareActiveFile")).setIcon(ICON_ID).onClick(() => void this.compareActiveFile(file));
        });
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.proposeChanges")).setIcon(ICON_ID).onClick(() => void this.proposeChanges(file));
        });
        const changeCopy = this.findLatestChangeCopy(file);
        if (changeCopy) {
          menu.addItem((item) => {
            item.setTitle(this.translate("menu.acceptChanges")).setIcon(ICON_ID).onClick(() => void this.openDiffView(changeCopy, file, false, "accept"));
          });
        }
        menu.addItem((item) => {
          item.setTitle(this.translate("menu.refresh")).setIcon("refresh-cw").onClick(() => this.refreshDiffViews(file));
        });
      })
    );
    this.commandEntries = [
      this.addCommand({
        id: "compare-active-file",
        name: this.translate("commands.compareActiveFile"),
        callback: () => void this.compareActiveFile()
      }),
      this.addCommand({
        id: "compare-two-files",
        name: this.translate("commands.compareTwoFiles"),
        callback: () => void this.compareTwoFiles()
      }),
      this.addCommand({
        id: "propose-changes",
        name: this.translate("commands.proposeChanges"),
        callback: () => void this.proposeChanges()
      })
    ];
  }
  /** Loads persisted plugin settings and applies defaults for new options. */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!["auto", "de", "en"].includes(this.settings.language)) {
      this.settings.language = DEFAULT_SETTINGS.language;
    }
    this.language = resolveLanguage(this.settings.language, moment?.locale?.());
    this.translator = createTranslator(this.language);
  }
  /** Translates one UI key using the currently selected language. */
  translate(key, variables = {}) {
    return this.translator(key, variables);
  }
  /** Applies a language preference and refreshes safe open comparison views. */
  updateLanguage(preference) {
    this.settings.language = ["auto", "de", "en"].includes(preference) ? preference : "auto";
    this.language = resolveLanguage(this.settings.language, moment?.locale?.());
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
  updateLocalizedLabels() {
    const commandNames = [
      this.translate("commands.compareActiveFile"),
      this.translate("commands.compareTwoFiles"),
      this.translate("commands.proposeChanges")
    ];
    this.commandEntries?.forEach((command, index) => {
      if (command) {
        command.name = commandNames[index];
      }
    });
    const ribbonLabel = this.translate("ribbon.compareTwoFiles");
    this.ribbonIconEl?.setAttribute("aria-label", ribbonLabel);
    this.ribbonIconEl?.setAttribute("title", ribbonLabel);
  }
  /** Persists the current plugin settings in the vault configuration. */
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /** Refreshes open comparison views for a file from the document context menu. */
  refreshDiffViews(file) {
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
  updateRibbonVisibility() {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.style.display = this.settings.showRibbonIcon ? "" : "none";
    }
  }
  /** Closes all open diff leaves when the plugin is disabled. */
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  /** Starts a comparison with the currently active text file on the left. */
  async compareActiveFile(file = null) {
    const activeFile = file || this.app.workspace.getActiveFile();
    if (!isTextFile(activeFile)) {
      new Notice(this.translate("notice.openTextFirst"));
      return;
    }
    await this.openDiffView(activeFile);
  }
  /** Creates or reuses a timestamped change copy and opens it editable on the right. */
  async proposeChanges(file = null) {
    const sourceFile = file || this.app.workspace.getActiveFile();
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
  findLatestChangeCopy(sourceFile) {
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const prefix = `${sourceFile.basename}${suffix}`;
    const parentPath = sourceFile.parent?.path || "";
    return this.getTextFiles().filter(
      (file) => file.path !== sourceFile.path && (file.parent?.path || "") === parentPath && file.extension === sourceFile.extension && file.basename.startsWith(prefix)
    ).sort((a, b) => b.stat.mtime - a.stat.mtime || b.path.localeCompare(a.path, this.language))[0] || null;
  }
  /** Builds a unique vault path for a timestamped change copy. */
  getChangeCopyPath(sourceFile) {
    const parentPath = sourceFile.parent?.path || "";
    const suffix = sanitizeCopySuffix(this.settings.changeCopySuffix);
    const extension = sourceFile.extension ? `.${sourceFile.extension}` : "";
    const baseName = `${sourceFile.basename}${suffix}${formatCopyTimestamp(/* @__PURE__ */ new Date())}`;
    let counter = 0;
    let fileName = `${baseName}${extension}`;
    let path = parentPath ? `${parentPath}/${fileName}` : fileName;
    while (this.app.vault.getAbstractFileByPath(path)) {
      counter += 1;
      fileName = `${baseName}-${counter}${extension}`;
      path = parentPath ? `${parentPath}/${fileName}` : fileName;
    }
    return path;
  }
  /** Opens the active file immediately and lets the right file be selected in the view. */
  async compareTwoFiles() {
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
  getTextFiles() {
    return this.app.vault.getFiles().filter(isTextFile).sort((a, b) => a.path.localeCompare(b.path, this.language));
  }
  /** Opens a file picker and resolves with the selected file or null. */
  pickFile(files, placeholder) {
    return new Promise((resolve) => {
      const modal = new FilePickerModal(this.app, files, resolve, this.language);
      modal.setPlaceholder(placeholder);
      modal.open();
    });
  }
  /** Opens the comparison in a new split leaf, optionally awaiting the right file. */
  async openDiffView(leftFile, rightFile = null, editRight = false, mode = "compare") {
    if (rightFile && leftFile.path === rightFile.path) {
      new Notice(this.translate("notice.differentFiles"));
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE,
        active: true,
        state: { leftPath: leftFile.path, rightPath: rightFile?.path || null, editRight, mode }
      });
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error("Side-by-Side Diff konnte die Ansicht nicht \xF6ffnen.", error);
      new Notice(this.translate("notice.viewOpenFailed"));
    }
  }
};
module.exports = FileDiffSideBySidePlugin;
