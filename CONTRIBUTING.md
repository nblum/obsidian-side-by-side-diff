# Contributing

Thanks for your interest in **Side-by-Side Diff**. The plugin is a lean, locally running Obsidian plugin.
Contributions should therefore stay small, reviewable, and focused on the comparison workflow.

## Development environment

- Obsidian `1.6.6` or later for manual UI checks
- Node.js 22.6 or later for `node:test` with TypeScript support
- npm for building, type-checking, linting, and testing

Install the local development dependencies once:

```bash
npm install
```

Development happens directly in the plugin folder. For a manual check, the folder must live as
`.obsidian/plugins/side-by-side-diff/` inside a test vault, with the plugin enabled in Obsidian. After changing
files in `src/`, run `npm run build` first, then reload the plugin view or Obsidian.

## Before making a change

1. Read [README.md](README.md) for an overview and [FEATURES.md](FEATURES.md) for the current scope.
2. Check `git status` to see whether the working tree already has changes.
3. Look for existing tests and similar flows before adding new logic.
4. Keep the change limited to the affected area.

Use the [implementation checklist](docs/implementation-checklist.md) to track coding, styles, existing and new
tests, and reviews of the changelog, feature reference, README, and roadmap.

## Working style

- Follow the existing patterns and naming in the plugin.
- Write strict-mode TypeScript with explicit types at module boundaries and without unnecessary global state.
- Keep functions small and use early returns where that makes the logic clearer.
- Add short technical comments at non-obvious points; new classes and functions get a short docblock.
- Use the existing German terms in the interface, along with correct umlauts and `ß`.
- New visible strings belong in every file under `locales/`; keep the keys and placeholders identical across all files.
- Check every language for new placeholders and use stable keys instead of visible text as logic markers.
- Never write a file while typing or on a single diff action. Changes must stay staged until explicitly saved.
- Avoid non-deterministic ordering and changes outside the affected area.

## Project layout

- `src/main.ts` – plugin entry point and commands
- `src/diff-view.ts` – comparison view and editing behavior
- `src/modals.ts` – confirmation, file picker, and unsaved-change dialogs
- `src/settings.ts` – plugin settings and compatibility rendering
- `src/diff-core.ts` – deterministic diff and line-synchronization logic
- `src/i18n.ts` – translation loading and language resolution
- `tests/` – TypeScript unit tests for the modules above
- `main.js` – generated Obsidian entry point; ignored by Git and rebuilt before local installation or release

## Tests

Run from the plugin folder:

```bash
npm run validate:manifest
npm run typecheck
npm run lint
npm test
npm run build
```

The comparison tests use the paired fixtures in `tests/fixtures/` to verify unchanged, changed, removed, and
added rows as well as inline token highlighting. `src/diff-model.ts` exposes the deterministic row model used by the
view, so line numbers, row types, alignment gaps, and inline tokens can be tested without an Obsidian runtime.

These are the same checks that run in CI (`.github/workflows/ci.yml`) on every push and pull request.

The tests cover the deterministic diff, synchronization, and translation rules, including:

- inserting, removing, and replacing individual lines
- block changes between duplicate anchor lines and deterministic large-file fallback behavior
- row types, line numbers, and inline tokens through the comparison model
- ignoring changes while both files' text and line numbers stay visible, with neutral highlights and one-step undo
  for rows and blocks in both apply directions
- alignment with differing line counts
- preserving line endings and trailing blank lines
- distinguishing intentional empty lines from visual alignment gaps
- rendering and serializing actual target editor rows in both directions, including blank and whitespace-only lines
- excluding visual alignment gaps when saving
- matching keys and placeholders across all locale dictionaries
- selecting the next and previous change, including wraparound and resolved-row handling
- honoring the configurable automatic advance after accepting or ignoring a change
- protecting pending changes when entering edit mode or swapping panes
- block acceptance with changing line counts, target line endings, one-step undo, and explicit saving in both directions
- default-direction persistence through both declarative and legacy settings controls
- the registered ribbon callback opening an active text file without a comparison file, or selecting/cancelling
  the first file when no text file is active, including binary-file filtering
- Obsidian's close-before-choice suggestion lifecycle, followed by constructing the registered diff view,
  rendering the original and opening the comparison-file picker from its actual search button
- ribbon visibility restored on load and updated/persisted through declarative and legacy settings controls

## Manual checklist

For changes to the view or save logic, check at least these cases:

- original-file preview before comparison selection, including matching neutral styles, wrapping, and copying
- identical files
- changed, inserted, and removed lines
- inline differences within a line
- green incoming source content and red outgoing target content, including color reversal after changing direction
- `→`, `←`, `×`, `Swap`, `Refresh`, and reversing direction without moving the files
- original/comparison identity after swapping, Source/Target badges, and the split-view navigation toolbar
- swap above direction, the centered target-file edit icon moving between sides, and save/menu in the first row
- undo and previous/next icons with tooltips and keyboard navigation
- both default apply directions in settings, retained directions in open/restored reviews, and fixed proposal direction
- read-only external files as sources for reverse merges, with read-only targets still blocked
- saving via the button and via `Ctrl/Cmd + S`
- disabled save button with no open changes
- edit mode on both target sides with multi-line selection, deletion, Backspace, `Enter`, source read-only, and target-only saves
- confirmation prompt when closing with unsaved changes
- creating, reusing, and applying a change copy
- ribbon visibility and suffix in settings
- language switching between `Automatic`, `Deutsch`, `English`, `Français`, `Italiano`, `Español`, `Português (Brasil)`, `Português (Portugal)`, `Nederlands`, and `简体中文`
- files with different line endings

## Documentation

Update the documentation whenever a visible flow, command, setting, or requirement changes:

- `README.md` stays the short entry-point page.
- `FEATURES.md` describes the full feature scope and acceptance criteria.
- `CONTRIBUTING.md` describes the development and review workflow.
- `locales/` holds the UI translations for all supported languages.

## Contribution checklist

- [ ] The change is limited to a clear purpose.
- [ ] Affected tests were added or adjusted.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.
- [ ] `npm run validate:manifest` passes and the release tag matches `manifest.json`.
- [ ] A manual check was performed for UI or save-logic changes.
- [ ] Terminology and documentation are up to date.
- [ ] `git diff --check` reports no whitespace errors.
