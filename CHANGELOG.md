# Changelog

All notable changes to Side-by-Side Diff are documented here.

## [Unreleased]

## [0.10.0] - 2026-11-05

### Added

- Compare an external Markdown file by dropping it into the comparison view, without importing it. The drop opens on
  the right and keeps the selected left file in place. Edit it or accept changes into it, then save explicitly. External saves check for intervening changes,
  preserve line endings, and do not recreate deleted files.

### Fixed

- Refuse accept actions on external files that changed since display and refresh the comparison before review.
- Serialize external saves by physical file identity so concurrent saves cannot silently overwrite each other.
- Reject dropped aliases of the left file and recognize existing vault files dropped from the operating system.
- Cancel older drops when a newer file is selected, including drops awaiting save/discard confirmation.
- Validate native reads before replacing a comparison or discarding its pending edits and review decisions.

- Resolve Obsidian file drops from open URLs and encoded Markdown links instead of incorrectly reporting that
  different files are identical. Accept URI-list drag data as well as plain text.

- Preserve the viewport while measuring wrapped edit-mode rows so temporary layout collapse cannot cause scroll jumps.
- Stop repeated edit-mode alignment updates that could pull the comparison back down while scrolling upward.

## [0.9.0] - 2026-10-26

### Added

- Added an `obsidian://side-by-side-diff` URI action to open a comparison from two vault-relative paths, with optional vault targeting and localized validation errors.
- Added French, Italian, Spanish, Brazilian Portuguese, European Portuguese, and Dutch interface translations, including automatic language detection and language-selection options.
- Added Simplified Chinese interface translations, automatic language detection, and a `简体中文` language option.

### Fixed

- Added missing French, Italian, Spanish, Brazilian Portuguese, European Portuguese, and Dutch URI validation messages, restoring strict type checking and translation tests.
- Added missing Simplified Chinese URI validation messages, restoring translation checks and the production build.
- Recognize Obsidian's `pt` locale as European Portuguese in automatic language mode instead of Brazilian Portuguese.

## [0.8.0] - 2026-10-20

### Added

- Added optional Markdown heading alignment using matching ATX headings as section anchors, with English and German
  settings controls. Large comparisons can realign at later headings while retaining the existing per-section fallback.

## [0.7.0] - 2026-09-25

### Added

- Added a localized five-step introduction that opens once after an update when it has not been seen yet, covering
  how to start a comparison, select a file, navigate and review grouped changes, find support resources, and
  receive a closing thank-you note. It can also be reopened from settings or the command palette.

### Fixed

- Embedded introduction screenshots in the plugin bundle so they remain available in offline release installations.

## [0.6.1] - 2026-09-14

### Fixed

- Fixed directly adjacent changed rows not receiving a visual block or block actions.

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
