# Features and requirements

This document describes the implemented feature scope of **Side-by-Side Diff** and serves as a reference for
further development and acceptance.

## Goal

The plugin compares two text files, either from the current Obsidian vault or with a dropped external Markdown source in a safe, traceable way. Changes are made
visible, can be reviewed and staged individually, and are written only through an explicit save action.

## Feature scope

### Comparison view

- Two different text files are displayed in sync on the left and right.
- Changes are highlighted line by line and inline within changed lines. In comparison mode, green marks source
  content to be inserted, and red marks target content to be removed or replaced. Both line and inline colors follow
  the apply direction; alignment gaps and ignored changes stay neutral. Direct editing uses reference-versus-edited-content colors.
- File text can be selected and copied directly in comparison mode. Selection stays in the pane where dragging
  starts and copies only that file's text, preserving real blank lines and excluding line numbers, review controls,
  the other file, and visual alignment gaps.
- When the line counts differ, visual blank lines are inserted on the shorter side at the change position so that
  the following lines stay in sync.
- The first toolbar row contains the comparison title, change count, save action, and a file-actions menu with
  `Refresh`; there is no separate action row.
- `Swap` is an icon with a tooltip above the direction icon between the file headers. The edit-mode icon sits
  at the right edge of the target's file header, vertically centered, and moves with the target when direction
  changes. It changes to `Comparison mode` while editing. The source is never editable.
- `Undo`, `Previous change`, and `Next change` use accessible icon buttons with tooltips and retain their shortcuts.
- `Undo` and change navigation sit below the file headers, directly above the split content.
- `Next change` and `Previous change` navigate through changes and scroll the selected row into view.
- The same navigation is available with `Alt+ArrowDown` and `Alt+ArrowUp`.
- After accepting or ignoring a change, the view automatically advances to the next open change by default. This can be disabled in the settings.
- Pane headers show the file name, vault-relative path, and `Original` / `Comparison` or `Proposal` identity.
  Original and Comparison labels follow their files when swapping. Separate Source and Target badges identify
  which file supplies changes and which will be changed. Direct editing identifies the editable target file.
- Comparison mode omits a separate apply-direction hint row; source/target badges, arrows, and action tooltips
  provide that context next to the affected files and controls.
- In ordinary comparisons, the arrow icon between the headers has a `Reverse apply direction` tooltip. It changes
  merge direction without swapping files. Merge highlights update to match the new source and target. Left to right
  is the factory default; **Default apply direction** initializes new comparisons. Explicit saved directions take
  precedence over that setting. Proposal and acceptance workflows retain their fixed direction.
- Direction reversal is unavailable during direct editing or with pending changes. After saving or undoing pending
  changes, reversal reopens ignored rows and clears their undo history for a fresh review in the new direction.
- `Swap` swaps both files and, for proposals, reverses the direction of acceptance. Pending changes are saved or
  discarded only after confirmation.
- `Refresh` is available in the file context menu and reloads an open comparison view.
- The scroll position is preserved when staging, ignoring, or saving a change.
- The right-file selector remembers up to five recently selected files and shows them in a separate recent-files group.
- Before a comparison file is selected, the original preview uses the comparison view's neutral cell background,
  line spacing, row borders, and selectable text.
- Selecting exactly two text files in the file explorer and choosing `Compare files` from the context menu opens the
  comparison view with both files directly.

### External Markdown sources

- The initial right pane shows a **Drop files** card below **Select right file**. Drop an Obsidian vault file
  there to select it on the right, or drop one external `.md` file from the file manager into the comparison.
- The external file opens on the right, replacing any previous right file. The selected left-hand file stays
  in place; dropping never swaps the panes automatically.
- For drops with a writable browser file handle, the right-hand external file supports direct editing and
  accepting changes. Only explicit saves write to disk. Both staged and edited saves check for external changes,
  preserve line endings, and fail if the file was deleted. Files are not imported or offered for trash actions.
- Single-row and block acceptance, ignore, undo, and heading alignment work with external targets as well.
- If browser file handles or their write methods are unavailable, the drop remains a read-only snapshot with an
  explanatory message and swapping is disabled. Permission denial or save failures preserve pending changes.
- A read-only external snapshot can supply changes to a vault target by reversing direction. Merge controls check
  the actual target's writability; a read-only target remains blocked for both row and block actions.
- Pending changes require the existing save/discard confirmation before a new dropped snapshot replaces them.
- Invalid drops and failed native reads preserve the comparison, including pending edits and review decisions
  when a read fails during save/discard confirmation. Newer selections invalidate older pending drops.
- Matching native vault paths are resolved to their existing vault identity. Matching paths and external handles
  identified by the browser as the same entry are rejected. Symlink and hard-link aliases are not guaranteed to
  be detected, especially between a vault file and an external handle.
- Accept actions detect external content changed since display and refresh without staging a change. The user
  must review the new comparison before accepting. External saves are serialized across views,
  with each save validating its baseline after earlier saves finish. Browser writers request exclusive access and
  recheck current content before committing; failed or conflicting writes are aborted.
- Desktop files are reread when rebuilding the comparison. External content and paths are not persisted; restoring the view shows the vault note
  with the file selector, ready for another drop.

### Markdown heading alignment

- **Align Markdown by headings** is optional and disabled by default. It applies only when both files have the
  `.md` extension; other comparisons retain ordinary line alignment.
- Matching ATX headings (`#` through `######`) form ordered, hard boundaries. Each range before, between, and
  after them is compared independently, so an inserted section does not shift later matching sections.
- Heading level and text must match exactly, including case and internal whitespace. Surrounding spaces/tabs,
  up to three leading spaces, and optional closing `#` markers are ignored for matching only; literal syntax
  differences remain visible changes.
- Repeated headings are matched deterministically in document order. Added, removed, renamed, or different-level
  headings remain ordinary changed content between matching anchors.
- Headings inside backtick or tilde fences are excluded. Setext headings are not parsed as anchors.
  Markdown container context is not parsed; heading detection uses the supported ATX heading and fenced-code rules
  on individual lines. Without matching anchors, the ordinary diff is used.
- Every range retains the existing 1,000,000-cell limit and deterministic index fallback. Heading-sequence alignment
  uses the same safeguard. Rendering and change actions use the same alignment options and source indexes.

### Grouped change blocks

- Contiguous changed rows, and rows only separated by blank-line pairs, are grouped into one visual block instead of
  being shown as disconnected single-line edits interrupted by lonely blank rows.
- A block with more than three changed lines shows a header with the number of changed lines and `Accept all` /
  `Ignore all` controls that act on every changed row in the block at once.
- The block header disappears once every row in the block has been resolved, whether through the block controls or
  through individual per-row actions.
- `Accept all` never re-applies a row the user has already ignored individually within the same block.

### Accepting and ignoring changes

- `→` or `←` stages a single change in the selected direction. Row and block tooltips name the actual target file.
- `×` resolves a difference without modifying either file. Both sides keep their actual text and line numbers,
  including source-only lines. The ignored row loses its highlights and review actions in either direction.
- With a highlighted change, `Alt+ArrowRight` accepts it in the selected direction and `Alt+ArrowLeft` ignores it.
- `Undo` (toolbar button or `Ctrl/Cmd+Z`) reverts the most recent accept or ignore action, whether it touched a
  single row or a whole block, as long as it has not been written to disk yet.
- The undo history is cleared once its actions are saved, discarded, or the compared files are changed; undo entries
  for ignored rows survive `Swap` by remapping to the new left/right orientation.
- `Save changes` writes staged changes to the affected files.
- The save button is disabled when there are no unsaved changes.
- Files in the vault are only modified after the explicit save.
- Before saving, the current vault content is compared with the captured save snapshot; external changes cancel the save.
- Once all suggested changes have been processed, the message `All change suggestions have been processed.`
  appears.

### Edit mode

- In normal diff mode, only the current merge target can be edited directly via its `Edit mode` icon.
- The editor opens on the right for left-to-right merging and on the left for right-to-left merging, without moving
  the files. The source remains read-only. Save baselines, line endings, explicit saves and close-save handling all
  follow the actual target. A read-only external source does not block editing a writable vault target.
- Pending comparison changes are saved or discarded only after confirmation when entering edit mode.
- The edit area is a shared multi-line input field.
- Multi-line selection, deletion, Backspace, and `Enter` for new blank lines work as expected.
- Both sides stay aligned line by line while editing.
- `Comparison mode` ends direct editing.
- Saving happens via `Save changes` or `Ctrl/Cmd + S`.
- Closing with unsaved changes prompts the plugin to ask whether to save.
- The edited file's existing line-ending style is preserved when saving.

### Suggested changes

- `Suggest changes` creates a copy next to the active document with a configured suffix and timestamp.
- An example name is `Document_changes_20260817-143000.md`.
- An already existing matching copy is preferred and opened; the most recent copy is used.
- In proposal mode, the original appears on the left and the editable copy on the right.
- `Accept changes` opens the reversed view with the copy on the left and the original on the right.
- Proposals are only written to the original after review and an explicit save.
- After all proposal changes are accepted and saved, the plugin asks whether the suffix copy should be moved to the trash.

### Other actions

- The plugin opens a short, five-step introduction once after an update when it has not been seen yet. It covers
  comparison entry points, file selection, navigation, change groups, feedback, documentation, and a closing
  thank-you note. It can be reopened through the settings page or the command palette.
- Identical files show a dedicated message.
- From that message, one of the files can be moved to the Obsidian trash after confirmation. The file is not
  permanently deleted and can be restored.
- When a compared file is renamed or deleted, the open view reacts to the vault change.
- Known binary formats are not offered as text files for selection.
- Deleted or unavailable files are removed from the recent-files display automatically.

### Translated interface

- The visible plugin interface is available in German, English, French, Italian, Spanish, Brazilian Portuguese, European Portuguese, Dutch, and Simplified Chinese.
- Under **Settings → Side-by-Side Diff → Language**, `Automatic`, `Deutsch`, `English`, `Français`, `Italiano`, `Español`, `Português (Brasil)`, `Português (Portugal)`, `Nederlands`, and `简体中文` are available.
- `Automatic` follows the Obsidian language; unsupported languages fall back to English.
- Simplified Chinese detection supports `zh`, `zh-CN`, `zh-SG`, and `zh-Hans` locales. Traditional Chinese locales
  retain the English fallback.
- Translations live separately in `locales/`, with the same keys and placeholders across all dictionaries.

## Access points in Obsidian

| Access | Action |
| --- | --- |
| Command palette | `Compare current file with another file` |
| Command palette | `Compare two files` |
| Command palette | `Suggest changes for current file` |
| Command palette | `Save changes in comparison view` |
| Command palette | `Next change` / `Previous change` |
| Ribbon | `Compare two files` |
| File context menu | `Compare with another file` for any text file, whether open or closed |
| File context menu | `Suggest changes` |
| File context menu, when available | `Accept changes` |
| File context menu with an open comparison view | `Refresh` |
| File context menu with exactly two text files selected | `Compare files` |

## Settings

Under **Settings → Side-by-Side Diff**, the following options are available:

- **Language**: Show the plugin interface automatically, in German, or in English.
- **Show in left ribbon**: Show or hide the icon in the left ribbon. The command palette and document menus are
  unaffected.
- **Change-copy suffix**: Adjust the text before the timestamp of change copies. Disallowed file-name characters
  are replaced automatically.
- **Automatically go to the next change**: After accepting or ignoring a change, scroll to the next open change;
  enabled by default.
- **Default apply direction**: Use **Left → right** (factory default) or **Right → left** for new vault comparisons,
  right-file selections, and external drops. Open comparisons retain their captured direction, including when
  settings or language change. Restored comparisons retain an explicit saved direction. Proposal workflows keep
  their fixed direction; only the target file is editable in either direction.
- **Align Markdown by headings**: Use matching ATX headings as section boundaries when both files are Markdown;
  disabled by default. Refresh or reopen an existing comparison to apply a changed setting.

## Technical requirements

- Obsidian `1.6.6` or later.
- Save targets are vault text files or explicitly dropped Markdown files with a writable browser file handle.
- External reads and writes use only the dropped browser capability, without Node filesystem access. Browser
  capability support is detected at runtime; an unsupported installer keeps external drops read-only.
- No external services or additional runtime dependencies are required.
- Each supported language needs a complete translation file with the same key set as the other languages.
- The save action must always be explicitly triggered by the user.
- The diff calculation must stay deterministic. For very large comparisons, an index-based fallback keeps the
  calculation from growing uncontrollably.

## Acceptance criteria for changes

A change to the feature scope is considered fully documented and reviewed when:

1. the affected flow is updated in this document,
2. the changed behavior is covered by tests or a traceable manual check,
3. the rules for explicit saving and the visibility of both sides are preserved,
4. the terminology in code, README, and this reference is consistent.

Heading alignment must recover later shared sections in a synthetic comparison exceeding 1,000,000 cells, preserve
the fallback for an oversized individual section, and keep single-row and grouped actions consistent with displayed
source lines. Disabled and non-Markdown comparisons must retain existing behavior.
