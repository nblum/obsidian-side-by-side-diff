# Features and requirements

This document describes the implemented feature scope of **Side-by-Side Diff** and serves as a reference for
further development and acceptance.

## Goal

The plugin compares two text files, either from the current Obsidian vault or with a dropped external Markdown source in a safe, traceable way. Changes are made
visible, can be reviewed and staged individually, and are written only through an explicit save action.

## Feature scope

### Comparison view

- In side-by-side mode, two different text files are displayed in sync on the left and right.
- Changes are highlighted line by line and inline within changed lines. In comparison mode, green marks source
  content to be inserted, and red marks target content to be removed or replaced. Both line and inline colors follow
  the apply direction; alignment gaps and ignored changes stay neutral. Direct editing uses reference-versus-edited-content colors.
- In side-by-side mode, file text can be selected and copied directly. Selection stays in the pane where dragging
  starts and copies only that file's text, preserving real blank lines and excluding line numbers, review controls,
  the other file, and visual alignment gaps.
- When the line counts differ, visual blank lines are inserted on the shorter side at the change position so that
  the following lines stay in sync.
- The first toolbar row contains the comparison title, save action, and a file-actions menu with
  `Refresh`; there is no separate action row.
- `Swap` is an icon with a tooltip above the direction icon between the file headers. The edit-mode icon sits
  at the right edge of the target's file header, vertically centered, and moves with the target when direction
  changes. It becomes a `Leave edit mode` text button while editing. The source is never editable.
- `Undo`, `Previous change`, and `Next change` use accessible icon buttons with tooltips and retain their shortcuts.
- `Undo` and change navigation sit below the file headers, directly above the split content.
- Accepting a row or block and undoing a review action show localized feedback beside the review controls in a
  polite live region, without global Obsidian notices. Feedback clears when the view is rebuilt, including after
  a successful save or refresh. Save confirmations, errors, and conflicts retain their global notices.
- `Next change` and `Previous change` navigate through changes and scroll the selected row into view.
- The same navigation is available with `Alt+ArrowDown` and `Alt+ArrowUp`.
- Only the active change frame shows a compact badge attached to its top border, such as `5/12`, identifying its
  position among currently open changed rows. It follows button/keyboard navigation and automatic advance,
  updates when open changes are resolved or restored, and disappears when no open row is active or during editing.
  The badge has a localized accessible name and tooltip and is excluded from copied and saved file text.
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
- `Swap` swaps both files and switches between proposing and accepting in the built-in change-copy workflow.
  CLI reviews keep writing to the original after a swap. Pending changes are saved or discarded only after
  confirmation.
- `Refresh` is available in the file context menu and reloads an open comparison view.
- The scroll position is preserved when staging, ignoring, or saving a change.
- The right-file selector remembers up to five recently selected files and shows them in a separate recent-files group.
- Before a comparison file is selected, the original preview uses the comparison view's neutral cell background,
  line spacing, row borders, and selectable text.
- Selecting exactly two text files in the file explorer and choosing `Compare files` from the context menu opens the
  comparison view with both files directly.
- Right-clicking another file's tab and choosing `Compare with active file` opens the active file on the left and
  the clicked tab's file on the right without a picker. The action works for hidden and visible inactive tabs,
  including restored tabs not yet activated. It is offered only for two different vault text files; active-file,
  binary-file and non-file tabs have no direct comparison action. The pair is captured when the menu opens.
- `Compare with active file` is also available in the file explorer's context menu for a different text file when
  a vault text file is active. It opens the active file on the left and the clicked file on the right without a
  picker, even if the clicked file is not open in a tab. Folders and binary files are excluded.

### Comparison layouts

- An icon-only toolbar button cycles **Automatic → Side by side → Single column → Automatic**, with matching
  vector icons for A, columns, and rows. No visible Layout label or dropdown is shown. A localized tooltip and
  accessible label name the current and next preferences. Space/Enter activate the button, including during editing.
  Its square button matches the Save button's device-specific height, retaining its dimensions across all
  preferences and responsive layouts. The vector icon fills the button with a small inset.
  Automatic uses the comparison container width: single column below 720 CSS pixels, otherwise side by side. Fixed choices override
  width. Existing workspace states without a valid preference use the configured default.
- Each comparison persists its preference independently; changing the default affects new comparisons. Swap and
  external-source restoration retain the preference. Layout changes reuse the session and never write files,
  reset decisions, clear undo, refresh the baseline, or change merge direction.
- Single column displays literal equal text once, with both line numbers. Changed rows stack target then source,
  labeled with file name and role. Alignment gaps are hidden; intentional blank and whitespace-only lines remain.
  Ignored variants remain visible and neutral. Row actions have visible Accept/Ignore labels and name the target
  accessibly. Row and block actions share rounded outlines, interface typography and theme-aware semantic tints,
  with consistent hover, keyboard-focus and disabled states. Review buttons use a 32-pixel desktop height or a
  44-pixel mobile minimum in both layouts. Row buttons have 3-pixel top/bottom margins. Single-column Accept/Ignore actions
  align to opposite edges beneath their change. The action strip joins the last visible variant without a divider
  and leaves an extra 4-pixel gap below it to distinguish the next change.
  Block actions appear below the content for groups with at least two open changed rows; side-by-side mode keeps
  its existing header threshold. Navigation, review counts, markers, Keep both and pending previews retain their semantics.
- Single-column copying follows the selected text in reading order, including both changed variants and shared
  rows once. It retains partial-line boundaries, real blank lines and literal whitespace, while excluding
  interface text, alignment gaps, hidden shared duplicates and staged deletion previews. No copy-source selector is needed.
- Layout transitions keep the visible logical row and focused action. Comparison text selection may clear.
  The editor instance, buffer, selection, caret, and native undo remain intact during manual and Auto changes.
  Presentation changes wait until an active composition ends.
- Below 720 CSS pixels, file headers use two compact rows with localized Source/Target roles and filenames,
  with at most two visible filename lines and full paths on hover. Folder names appear only when the filenames
  match; external files are identified as external. Hide Original/Comparison labels, repeated paths, Swap, and the
  edit entry. Keep a 44-pixel vertical direction control, respecting read-only targets, staged changes and fixed
  proposal direction. Desktop header controls return at 720 pixels; the edit entry remains hidden whenever
  single-column layout is active, including in wide views.
  An existing editor and its return-to-comparison action remain available when narrowed. Focus moves to the
  layout control if the focused header action becomes hidden.
- Single-column editing places a full-width target editor below a collapsible source reference. Alignment gaps
  are hidden and line heights are natural. Returning to two columns restores aligned heights. Edit-entry
  confirmation, source read-only behavior, target permissions, line endings, and explicit saves stay in force.
- Initial preview and file selection stack vertically in single column. Toolbars wrap. Button sizes depend on
  the device, not the layout: desktop controls retain their native sizes and mobile controls have at least
  44-by-44 CSS-pixel targets. Review buttons are at least 44 pixels wide and the direction control uses a
  44-pixel target on both devices. Layout and Save share the theme's desktop input height or a mobile minimum
  of 44 pixels. Save, layout, navigation and review heights remain stable when switching layouts.
  File labels remain available without hover. Desktop-only runtime modules
  load only for desktop capabilities; optional desktop tab hooks and external-drop cards are skipped on mobile.
  These preparations do not yet establish Android/iOS support; the plugin remains declared desktop-only pending
  device validation.

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
- A side-by-side block with more than three open changed lines shows a header with the changed-line count and
  `Accept all` / `Ignore all`. Single-column mode places the controls after the block content and offers them from
  two open changed rows onward. Changing layout preserves decisions and restores the appropriate placement.
- Block controls disappear when fewer open rows remain than the current layout requires, including after all
  rows have been resolved through block or individual actions. Undo restores eligible controls.
- `Accept all` never re-applies a row the user has already ignored individually within the same block.
- The same block controls offer **Keep both** when open rows contain text from both versions. For each uninterrupted
  open fragment, it stages the current target version, one additional blank line when both variants have content,
  and then the source version. Unchanged rows and previously accepted or ignored entries remain in place and
  separate fragments; unchanged blank bridges are not duplicated. Pure additions/removals use the usual controls.
- Keep both follows the selected merge direction and the actual target's write permission, including writable
  external targets and read-only external sources. It preserves literal whitespace, Markdown hard breaks and the
  target's line-ending style. Literal final blank lines receive the terminator needed to preserve them.
- Each original open row is counted as accepted once; retained target lines and separators do not create review
  entries. The entire block action is one undo step. Later decisions, partial saves, failed saves and Undo preserve
  the kept variants and remaining review identities. File writes still require an explicit save.

### Review status and progress

- Comparison mode shows localized **Open**, **Accepted**, and **Ignored** counts beside the previous/next arrows
  directly above the split content, for original changed aligned rows.
  Block actions count the changed rows they resolve, excluding unchanged lines and alignment gaps.
- Open rows use their existing accept/ignore buttons with an accessible Open group label and no extra status icon.
  Accepted and ignored rows show check and minus markers between the panes, with localized accessible names and
  tooltips. Markers are excluded from copied file text. The summary uses a polite, atomic status region.
- Review identity survives staged insertions and deletions, including repeated lines and target-only deletions.
  Accepted and ignored entries remain visible, but only open rows receive review actions or navigation targets.
- Undo restores content and status together, for individual rows and whole blocks in either merge direction.
- Review progress is separate from saved content. Failed or conflicting saves retain the statuses. Successful
  saving resets accepted counts and undo history while keeping ignored differences resolved.
- Swapping retains ignored decisions and their undo; reversing direction reopens them. Discarding or choosing
  another comparison resets the review. State is not persisted across sessions.
- Direct editing retains its changed-line summary. Refresh without pending content starts a new alignment,
  preserving matching ignored differences and their undo. Ordinary rerenders retain progress; changed file
  contents rebuild the alignment while preserving staged content and matching ignored keys.

### Accepting and ignoring changes

- `→` or `←` stages a single change in the selected direction. Row and block tooltips name the actual target file.
- Until explicitly saved, accepted additions and replacements use green text in the target. Removed or replaced
  saved target lines remain visible in red with strikethrough. These previews use neutral backgrounds, distinct
  from unresolved diff highlights, and apply to row and block acceptance in both directions.
- Deleted preview lines carry no review actions or navigation targets and are excluded when copying target text
  and saving. Source text stays unchanged. Undo restores the previous preview; successful saving clears it, while
  failed or conflicting saves keep it visible.
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

- In wide side-by-side comparisons, the target's `Edit mode` icon opens the editor. Narrow and single-column
  views hide the entry; an existing editor remains usable across layout changes.
- The editor opens on the right for left-to-right merging and on the left for right-to-left merging, without moving
  the files. The source remains read-only. Save baselines, line endings, explicit saves and close-save handling all
  follow the actual target. A read-only external source does not block editing a writable vault target.
- Pending comparison changes are saved or discarded only after confirmation when entering edit mode.
- The edit area is a shared multi-line input field.
- Multi-line selection, deletion, Backspace, and `Enter` for new blank lines work as expected.
- Side-by-side editing keeps both files aligned line by line; single-column editing uses a full-width target
  and a collapsible source reference.
- The localized `Leave edit mode` text button ends direct editing. A dirty editor offers Save, Discard changes
  and Cancel; Escape or closing the dialog also cancels. Save writes only the actual target before leaving;
  discard reloads its saved content. A clean editor returns directly to comparison.
- Failed or conflicting saves keep the live editor open. External modify events do not rebuild a dirty editor
  or replace its unsaved text; explicit saving still checks the captured baseline.
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

- The open comparison's `…` file-actions menu offers **Help**. It shows a localized quick guide outside English
  and provides access to the full English README in every language. Screenshots work offline, section links
  navigate within the dialog, and links to other repository files open on GitHub. Help stays available with
  unsaved changes and preserves the comparison's staged edits and review state.
- The plugin opens a five-step introduction once after an update when it has not been seen yet. The welcome page
  shows a bundled teaser image and cards for feedback, bug reports, and documentation. The start page alternates
  screenshots and instructions in two columns when there is room. The file-selection page also explains drag and
  drop and the tab's **Compare with active file** action. After tips for navigation and change groups, the closing
  page offers a Ko-fi support link and optional agent setup. The introduction can be reopened through the settings
  page or the command palette.
- **About the plugin** opens from settings and the command palette. The top of the settings and the dialog show
  the installed version and author from the manifest, a short description, and documentation, repository,
  feedback, website, and support links.
- Identical files show a dedicated message. Review completion after Keep both can leave files different and
  shows the processed-suggestions message instead. Identical-file trash actions and proposal-copy cleanup require
  equal compared content, independently of accepted/ignored review counts.
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
- Obsidian 1.13 and later index the plugin settings in native settings search. A language change refreshes the
  open settings tab on all supported versions. Both settings renderers reject an empty or invalid copy suffix
  and preserve the last saved value.
- Status text explains progress, success, and failure during agent setup. Comparison notices and agent setup use
  theme colors alongside the message text.

### Agent support

- The official desktop CLI registers `side-by-side-diff:compare left=… right=…`,
  `side-by-side-diff:review original=… proposal=… [side=original-left|original-right]`, and
  `side-by-side-diff:status` when the CLI plugin API is available (Obsidian 1.12.2+).
  Enabling the current official CLI requires a compatible desktop installer. The plugin retains its existing
  minimum Obsidian version for other features.
- The opening commands require two distinct vault text files at exact vault-relative paths. If a file is on
  disk, the commands briefly wait for it to appear in Obsidian's index. Ordinary comparisons respect the
  default apply direction. New CLI reviews put the original on the right by default and stage changes toward
  the original in either pane order. Writing to the original requires explicit Save.
- Repeating a review for the same original and proposal focuses the matching review or acceptance tab and
  preserves its pane order and decisions, including after a swap. JSON success responses for review include
  `left`, `right`, `vault`, `originalSide` (`left` or `right`), and `reused`.
- Status returns `{ ok, vault, views }`, with `left`, `right`, `mode`, `originalSide`, `counts` (open, accepted,
  ignored), and `hasUnsavedChanges` for each open diff tab in the vault. An unset pane has a `null` path.
  Counts reflect the current review session. After saving, accepted counts clear and ignored decisions remain.
- The introduction's final page and both settings layouts offer the same agent setup dialog. It lets the
  user choose an existing vault-root `AGENTS.md` or `CLAUDE.md`, or create `AGENTS.md` when neither exists.
  On case-insensitive filesystems, it uses the spelling of the existing file.
  The dialog previews the English instructions, including the actual vault name and configured copy suffix.
- Agent setup reads the app-wide CLI toggle when the desktop runtime exposes it. If the toggle is off, the
  dialog explains how to enable and register the CLI and can open Obsidian's General tab. The official setup
  guide is available if the status or shortcut is unavailable. Users verify registration in their terminal.
- The user confirms every write. Repeat setup replaces only the marked plugin section and skips an identical
  update. Ambiguous markers prevent writing. If the selected file changes after the preview, the dialog
  asks for confirmation again with the new preview.

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
| Other text-file tab's context menu, with a different text file active | `Compare with active file` |
| File explorer context menu for another text file, with a text file active | `Compare with active file` |
| File context menu | `Suggest changes` |
| File context menu, when available | `Accept changes` |
| File context menu with an open comparison view | `Refresh` |
| File context menu with exactly two text files selected | `Compare files` |

## Settings

Under **Settings → Side-by-Side Diff**, the following options are available:

- **About me**: Links to the developer website, GitHub star, feedback, and Ko-fi support page.
- **Language**: Show the plugin interface automatically, in German, or in English.
- **Show in left ribbon**: Show or hide the icon in the left ribbon. The command palette and document menus are
  unaffected.
- **Change-copy suffix**: Adjust the text before the timestamp of change copies. Disallowed file-name characters
  are replaced automatically.
- **Automatically go to the next change**: After accepting or ignoring a change, scroll to the next open change;
  enabled by default.
- **Default comparison layout**: Use Automatic (the default), Side by side, or Single column for new comparisons.
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
