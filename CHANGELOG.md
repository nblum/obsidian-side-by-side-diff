# Changelog

All notable changes to Side-by-Side Diff are documented here.

## [Unreleased]

### Fixed

- Preserve unsaved editor text when a compared file changes externally. A conflicting save keeps the live editor
  open without overwriting the external change.
- Let toolbar buttons handle Enter during direct editing instead of inserting a line into the target.

### Changed

- Use a Leave edit mode text button with Save, Discard changes and Cancel for unsaved edits. Escape keeps editing;
  failed saves preserve the editor and its text.
- Unify row/block review buttons with rounded outlines, theme-aware tints and keyboard-focus states. Button heights
  follow the device rather than the comparison layout, with small vertical margins around row actions.
- Run Linux Obsidian E2E tests and documentation captures on a private virtual display by default. Set
  `E2E_HEADED=1` for a visible debug run.

### Added

- Add an icon-only Automatic / Side by side / Single column switch beside Save and a default-layout setting.
  Automatic stacks variants below 720 pixels. Preferences persist per comparison; transitions preserve staged
  changes, decisions, undo, scroll position, focus and the live editor.
- In single column, show equal text once and changed target/source variants in reading order. Place row actions
  beneath their change and block actions below the content from two open changed rows onward. Copy both selected
  variants without interface text or hidden duplicates. Existing editors use the full width with a collapsible
  source reference.
- Compact narrow file headers into Source/Target rows, disambiguating matching names by folder. Keep one direction
  control and hide Swap and the edit entry; single-column comparisons also hide the edit entry in wide views.
- Prepare mobile runtime loading by deferring Node/Electron capabilities and skipping desktop-only hooks and drop
  cards on mobile. The plugin remains desktop-only until Android and iOS device validation is complete.

- Add **Keep both** to change-block headers with content in both versions. Stage target text first, a blank line,
  then source text in either merge direction, preserving previously resolved rows and literal whitespace. Undo
  reverses the whole action; saving stays explicit. Retained variants never trigger identical-file trash actions
  or proposal-copy cleanup while compared contents still differ.

- Show a position badge such as `5/12` on the top border of the active change frame only. It follows navigation
  among open changes, updates during review, and has a localized accessible label without entering file content.

- Show Open, Accepted, and Ignored changed-line counts beside the navigation arrows above the split, with
  accessible check/minus markers for resolved rows.
  Open changes retain compact accept/ignore controls without an extra status icon.
  Keep decisions attached to their original changes after insertions and deletions, support row/block undo in both
  merge directions, and retain progress after failed saves. Successful saving clears accepted counts while ignored
  differences remain resolved.
- Added **Help** to the open comparison's file-actions menu, showing the README and bundled screenshots in an
  offline help dialog with section navigation.
- Added a "Buy me a coffee" Ko-fi support link to the About section in plugin settings and the introduction's
  thank-you step, plus the README's support links.

## [0.11.0] - 2026-11-18

### Added

- Added a reusable documentation capture suite with an isolated sample vault, a preview gallery, and an explicit
  asset-update command. It refreshes comparison and onboarding screenshots plus the animated README walkthrough.
  Added an illustrated guide covering selection, review states, merge direction, editing, and saving.
- Added end-to-end tests in an isolated Obsidian instance for file selection, comparison, staging, undo,
  ignore, both merge directions, direct editing, keyboard saves, save conflicts, and unsaved-change confirmation.
  CI checks the oldest supported public Obsidian release (`1.6.7`) and the latest stable version.
- Compare the active text file directly with another open tab or a text file in the file explorer using
  `Compare with active file` in its context menu, including hidden tabs. The active file opens on the left and
  the clicked file on the right, without a file picker. ([#9](https://github.com/nblum/obsidian-side-by-side-diff/issues/9))
- Keep unsaved accepted changes visible in the target using green text for new content and red strikethrough
  previews for removed content. These marks differ from open-diff background highlights, follow undo and both
  apply directions, and clear after saving. Deleted previews are excluded from copying and saved file content.
- Reverse the apply direction using the arrow icon between file headers, without swapping files.
  Row and block actions, ignore, undo, target permissions, and keyboard acceptance follow the selected direction.
  Read-only external snapshots can supply changes to a vault target. ([#8](https://github.com/nblum/obsidian-side-by-side-diff/issues/8))
- Configure a default apply direction for new comparisons in settings. Open comparisons retain their direction,
  and proposal acceptance remains directed into the original.
- Select and copy text from either file in comparison mode. Selection stays in the pane where dragging starts
  and copies only that file's text, without line numbers, review controls, or alignment gaps. (#7)

### Changed

- Show feedback for accepting rows or blocks and undoing directly beside the review controls, preventing routine
  notifications from stacking over the save button. Save confirmations, errors, and conflicts keep their Obsidian notices.
- Clarify Original/Comparison file identity with names, paths, and Source/Target badges. Keep save and the file menu
  in the first row, stack the swap and direction icons between the headers, and center the edit-mode icon beside
  the target file. Undo and change navigation use icon buttons with tooltips directly above the split content.
- Remove the redundant apply-direction hint row in comparison mode; file roles, arrows, and action tooltips
  already show the source, target, and effect of ignoring a change.
- Direct editing follows the target when direction changes, including left-side editing, guarded saves, and
  preserved target line endings. The source stays read-only.

### Fixed

- Keep both files' text and line numbers visible when ignoring rows or blocks. Clear review highlights and actions
  without making the read-only source appear edited; source-only and blank lines remain visible in either direction.
- Exclude alignment gaps when copying comparison text even when keyboard focus is outside the split content.
- Open the comparison after selecting the original in the file picker. Obsidian closes suggestion dialogs before
  delivering the choice; accepting a file is no longer mistaken for cancellation.
- Match the original-file preview before selecting a comparison to the comparison view's neutral cells,
  including its background, line spacing, and row borders.
- Preserve actual empty and whitespace-only target lines and final line breaks when editing in either apply
  direction; only visual alignment gaps are excluded from saved content.
- Make comparison line and inline highlights follow the apply direction: incoming source content is green, while
  target content to be removed or replaced is red. Alignment gaps and ignored changes remain neutral.

## [0.10.1] - 2026-11-09

### Changed

- Replace Node filesystem access for external Markdown with browser file handles scoped to explicitly dropped
  files. Keep guarded, explicit saves and line endings; abort failed writes and recheck for outside changes before
  committing. Unsupported browser runtimes keep external drops as read-only snapshots with an explanation.
- Recognize duplicate external entries through browser handles and vault files through matching native paths.
  Symlink and hard-link aliases, especially between vault and external files, may no longer be recognized.

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
