# Changelog

All notable changes to Side-by-Side Diff are documented here.

## [0.6.0] - 2026-09-03

### Added

- Added a `Compare files` file-explorer context menu action that appears when exactly two text files are selected, opening the comparison view with both files directly.
- Grouped changed lines that are only separated by blank-line pairs into one visual block, so a paragraph rewritten across several lines reads as one connected change instead of disconnected single-line edits.
- Added `Accept all` / `Ignore all` controls to change blocks with more than three changed lines, so a whole rewritten block can be resolved at once; the controls disappear once the block is fully resolved.
- Added an `Undo` toolbar button and `Ctrl/Cmd+Z` to revert the last accept or ignore action, row or whole block, until the next save.
- Added an About section with links to the developer website, GitHub star, and feedback, plus a locally bundled "Add to Obsidian" icon.

### Fixed

- Stopped re-prompting to save when closing the comparison view after a save that only left ignored (dismissed) changes behind.
- Fixed `Accept all` silently re-applying a change the user had already ignored individually within the same block.
- Preserved undo history for ignored changes across `Swap` instead of discarding it silently.
- Made `Ignore all` a single undo step instead of requiring one undo per row in the block.

## [0.5.0] - 2026-08-24

### Added

- Added `Next change` and `Previous change` navigation with automatic scrolling and `Alt+ArrowUp` / `Alt+ArrowDown` shortcuts.
- Added `Alt+ArrowLeft` to dismiss and `Alt+ArrowRight` to accept the highlighted change.
- Added configurable automatic advance after accepting or dismissing a change; enabled by default.
- Added clearer review status feedback for open, dismissed, and resolved changes.
- Added a recent-files group showing up to five recently selected right-hand files.
- Added `Compare with another file` to the context menu for any text file, including closed files.
- Added a cleanup prompt for moving a processed suffix copy to the trash after all proposal changes are saved.
- Added regression coverage for navigation, guarded saves, recent files, and edit-mode synchronization.

### Fixed

- Prevented saves from overwriting files that changed externally, including conflicts after renames and retries.
- Preserved unsaved changes when swapping files, entering edit mode, closing the view, or encountering a save conflict.
- Fixed stale review metadata after dismissing rows or splitting editable lines.
- Switched identical-file deletion to Obsidian's user-configured file manager trash behavior.

### Changed

- Made edit mode more responsive by avoiding full-document serialization and full layout measurement on every typed character.
- Removed default command hotkeys to avoid conflicts with Obsidian and other plugins; view-local keyboard actions remain available.
- Raised the minimum supported Obsidian version to `1.6.6`.
- Release assets now receive GitHub artifact attestations.

## [0.4.0] - 2026-08-19

### Added

- Added a first-file picker when opening a comparison without an active document.
- Added the `Save changes in comparison view` command with a configurable `Ctrl/Cmd+S` hotkey.
- Added fixture-based tests covering unchanged, changed, added, and removed rows.
- Added inline-token highlighting tests, including the `fixture1` comparison pair.

### Fixed

- Made `Ctrl/Cmd+S` reliable in edit mode, including when focus is inside the contenteditable editor.
- Centralized row classification and inline diff tokenization so rendered CSS categories match the tested diff output.

### Changed

- Reduced line-number column width and softened comparison-cell borders.
- Documented comparison fixtures and the save command in the project documentation.
