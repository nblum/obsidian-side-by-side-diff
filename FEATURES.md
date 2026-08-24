# Features and requirements

This document describes the implemented feature scope of **Side-by-Side Diff** and serves as a reference for
further development and acceptance.

## Goal

The plugin compares two text files from the current Obsidian vault in a safe, traceable way. Changes are made
visible, can be reviewed and staged individually, and are written only through an explicit save action.

## Feature scope

### Comparison view

- Two different text files are displayed in sync on the left and right.
- Changes are highlighted line by line and inline within changed lines.
- When the line counts differ, visual blank lines are inserted on the shorter side at the change position so that
  the following lines stay in sync.
- The toolbar sits above the comparison and contains the editing actions.
- `Next change` and `Previous change` navigate through changes and scroll the selected row into view.
- The same navigation is available with `Alt+ArrowDown` and `Alt+ArrowUp`.
- After accepting or ignoring a change, the view automatically advances to the next open change by default. This can be disabled in the settings.
- The view shows the file names in the pane headers, along with `Comparison`, `Original`, or `Proposal` depending
  on context.
- `Swap` swaps both files and, for proposals, reverses the direction of acceptance. Pending changes are saved or
  discarded only after confirmation.
- `Refresh` is available in the file context menu and reloads an open comparison view.
- The scroll position is preserved when staging, ignoring, or saving a change.
- The right-file selector remembers up to five recently selected files and shows them in a separate recent-files group.

### Accepting and ignoring changes

- `→` accepts a single change into the view only, at first.
- `×` ignores only the left-hand diff part; the right-hand content stays visible and unchanged.
- With a highlighted change, `Alt+ArrowRight` accepts it and `Alt+ArrowLeft` ignores it.
- `Save changes` writes staged changes to the affected files.
- The save button is disabled when there are no unsaved changes.
- Files in the vault are only modified after the explicit save.
- Before saving, the current vault content is compared with the captured save snapshot; external changes cancel the save.
- Once all suggested changes have been processed, the message `All change suggestions have been processed.`
  appears.

### Edit mode

- In normal diff mode, the right-hand side can be edited directly via `Edit mode`.
- The left-hand side remains read-only.
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

### Other actions

- Identical files show a dedicated message.
- From that message, one of the files can be moved to the Obsidian trash after confirmation. The file is not
  permanently deleted and can be restored.
- When a compared file is renamed or deleted, the open view reacts to the vault change.
- Known binary formats are not offered as text files for selection.
- Deleted or unavailable files are removed from the recent-files display automatically.

### Translated interface

- The visible plugin interface is available in German and English.
- Under **Settings → Side-by-Side Diff → Language**, `Automatic`, `Deutsch`, and `English` are available.
- `Automatic` follows the Obsidian language; unsupported languages fall back to English.
- Translations live separately in `locales/de.json` and `locales/en.json`.

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

## Settings

Under **Settings → Side-by-Side Diff**, the following options are available:

- **Language**: Show the plugin interface automatically, in German, or in English.
- **Show in left ribbon**: Show or hide the icon in the left ribbon. The command palette and document menus are
  unaffected.
- **Change-copy suffix**: Adjust the text before the timestamp of change copies. Disallowed file-name characters
  are replaced automatically.
- **Automatically go to the next change**: After accepting or ignoring a change, scroll to the next open change;
  enabled by default.

## Technical requirements

- Obsidian `1.6.6` or later.
- Files being compared must be text files in the vault.
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
