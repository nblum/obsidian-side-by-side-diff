# Changelog

All notable changes to Side-by-Side Diff are documented here.

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

