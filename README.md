# Side-by-Side Diff

[![Add to Obsidian](assets/add-to-obsidian.svg)](https://community.obsidian.md/plugins/side-by-side-diff)
[![CI](https://github.com/nblum/obsidian-side-by-side-diff/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nblum/obsidian-side-by-side-diff/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/nblum/obsidian-side-by-side-diff?label=release)](https://github.com/nblum/obsidian-side-by-side-diff/releases/latest)
[![License: MIT](https://img.shields.io/github/license/nblum/obsidian-side-by-side-diff)](LICENSE)
[![Star on GitHub](https://img.shields.io/github/stars/nblum/obsidian-side-by-side-diff?logo=github&label=star)](https://github.com/nblum/obsidian-side-by-side-diff)

Compare two text files in a side-by-side file diff viewer. Review line changes with inline highlighting and
selectively accept or reject edits; changes are written only when explicitly saved.

> Compare, review, accept: Every change remains visible and is written to the vault only when you save.

![Side-by-Side Diff comparison view](assets/compare-mode.webp)

## Contents

- [At a glance](#at-a-glance)
- [Quick start](#quick-start)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Three workflows](#three-workflows)
- [Edit and save](#edit-and-save)
- [Installation](#installation)
- [Feedback and support](#feedback-and-support)
- [Privacy and permissions](#privacy-and-permissions)
- [Releases](#releases)
- [Documentation](#documentation)
- [Development](#development)
- [Tests](#tests)

## At a glance

- compare two text files side by side in sync
- select two files in the file explorer and choose `Compare files` to open the comparison directly
- detect line changes and inline differences within changed lines
- optionally align Markdown sections by matching headings (enable **Align Markdown by headings** in settings)
- navigate between changes with `Next change` / `Previous change`, `Alt+ArrowDown` / `Alt+ArrowUp`, and automatic scrolling
- automatically continue with the next open change after accepting or ignoring one (configurable, enabled by default)
- accept individual changes on the right or deliberately ignore them
- group contiguous changed lines, or lines separated only by blank lines, into one block, with `Accept all` / `Ignore all` for larger blocks
- undo the last accept or ignore action with the `Undo` button or `Ctrl/Cmd+Z`, until it is saved
- remember the last five right-hand files and show them first in the right-file selector
- edit the right-hand file directly and save changes in one step
- create change proposals as timestamped copies and later apply them to the original
- display the interface automatically in German, English, Spanish, Brazilian or European Portuguese, French, Italian, Dutch, or Simplified Chinese
- work entirely locally within the Obsidian vault

## Open a comparison with a URI

The plugin registers `obsidian://side-by-side-diff` to open two existing vault files directly in the comparison
view. Pass vault-relative paths in `left` and `right`; spaces and other reserved characters should be percent-encoded
in the URI. Obsidian decodes query values before the plugin receives them. An optional `vault` parameter restricts
the link to a vault with that exact name.

```text
obsidian://side-by-side-diff?left=Drafts/Plan%20A.md&right=Archive/Plan%20B.md&vault=Research
```

The handler reports missing or invalid paths, files outside the current vault, non-text files, identical files, and
links naming a different vault.

## Quick start

After an update, the plugin opens its short guided introduction once if you have not seen it yet. It covers the
comparison entry points, file selection, keyboard navigation, change groups, feedback, documentation, and a closing
thank-you note.
Open it again from **Settings → Side-by-Side Diff → Introduction** or through the `Show introduction` command.

The comparison icon in the left ribbon and `Compare with another file` in the active document's menu lead to the
same view as the command palette:

![Side-by-Side Diff file menu](assets/file-menu.webp)

Selecting two files in the file explorer and choosing `Compare files` from the context menu opens the comparison
directly with both files:

![Comparing two files selected in the file explorer](assets/comparsion-record1.webp)

1. Open the command palette and select `Compare current file with another file` or `Compare two files`.
2. Select the second file if it has not been chosen yet.
3. Review the synchronized view. Use `→` to stage a change as a proposal, or `×` to ignore the left-hand diff.
4. Navigate between changes with the toolbar or `Alt+ArrowDown` / `Alt+ArrowUp`; accept or ignore the highlighted change with `Alt+ArrowRight` / `Alt+ArrowLeft`.
5. Save all staged changes with `Save changes` or `Ctrl/Cmd + S`.

## Keyboard shortcuts

The following shortcuts are available while a comparison view has focus:

![Keyboard shortcuts for the comparison view](assets/keyboard-shortcuts.webp)

| Shortcut | Action |
| --- | --- |
| `Alt+ArrowDown` | Go to the next change |
| `Alt+ArrowUp` | Go to the previous change |
| `Alt+ArrowRight` | Accept the highlighted change |
| `Alt+ArrowLeft` | Ignore the highlighted change |
| `Ctrl/Cmd+Z` | Undo the most recent accept or ignore action, until saving |
| `Ctrl/Cmd+S` | Save staged changes |

## Three workflows

### Compare

The left and right files are displayed in sync. Line changes and differences within a line are highlighted. Use
`Swap` to switch the files and their direction. If changes are pending, the plugin asks whether to save or discard
them first.

Contiguous changed lines, as well as changes separated only by blank lines, are grouped into one block; a block with more than three changed lines
gets `Accept all` / `Ignore all` controls to resolve it in one step. `Undo` (button or `Ctrl/Cmd+Z`) reverts the last
accept or ignore action, single row or whole block, until it is saved.

### Suggest changes

`Suggest changes` creates a copy next to the active document with a suffix and timestamp, for example
`Document_changes_20260817-143000.md`. If a matching copy already exists, the latest one is opened. The original
appears on the left and the editable proposal copy on the right.

### Accept changes

`Accept changes` appears in the document menu only when a matching change copy exists. The view is reversed so that
the copy appears on the left and the original on the right. Use `→` to selectively apply reviewed proposals to the
original. After all proposals are accepted and saved, the plugin asks whether the suffix copy should be moved to the
trash; canceling keeps the copy available.

## Edit and save

In normal diff mode, use `Edit mode` to make the right-hand side editable. The left-hand file remains read-only. If
comparison changes are pending, the plugin asks whether to save or discard them before entering edit mode. Multi-line
selection, deletion, Backspace, and `Enter` for new lines are supported.

Changes are never written automatically while typing or clicking a diff action. The file is updated only after using
`Save changes` or `Ctrl/Cmd + S`. Before saving, the plugin checks for external file changes and cancels instead of
overwriting newer content. Closing a view with unsaved changes opens a confirmation dialog.

## Installation

The plugin requires Obsidian `1.6.6` or later.

Use the **Add to Obsidian** button above to open the Side-by-Side Diff community plugin page. To install the plugin,
search for `Side-by-Side Diff` under **Settings → Community plugins → Browse** in Obsidian.

For a manual installation, copy the plugin folder to `.obsidian/plugins/side-by-side-diff/`, then open
**Settings → Community plugins** and enable `Side-by-Side Diff`. The release folder must contain the generated
`main.js`, `manifest.json`, `styles.css`, and `locales/` directory.

The plugin is currently marked as desktop-only because mobile support has not been tested yet.

Set the interface language under **Settings → Side-by-Side Diff → Language** to `Automatic`, `Deutsch`, `English`,
`Español`, `Português (Brasil)`, `Português (Portugal)`, `Français`, `Italiano`, `Nederlands`, or `简体中文`. In automatic mode, supported Obsidian languages are used;
unsupported languages fall back to English.
Simplified Chinese is detected for `zh`, `zh-CN`, `zh-SG`, and `zh-Hans` locales; Traditional Chinese locales fall back to English.
The About section at the top links to the developer website, the GitHub repository for stars, and the issue page for
feedback.

## Feedback and support

- [Report a bug or request a feature](https://github.com/nblum/obsidian-side-by-side-diff/issues/new)
- [View the latest release](https://github.com/nblum/obsidian-side-by-side-diff/releases/latest)
- [Read the changelog](CHANGELOG.md)
- [Visit the developer website](https://blum-nico.de)

If Side-by-Side Diff is useful to you, a [GitHub star](https://github.com/nblum/obsidian-side-by-side-diff) is much
appreciated.

## Privacy and permissions

Side-by-Side Diff runs entirely inside the current Obsidian vault.

- It makes no network requests and uses no telemetry, analytics, ads, or external services.
- It does not require an account or payment.
- It enumerates vault file metadata (paths and names) to populate the file selectors and context actions.
- It reads and writes file contents only after an explicit user action, plus its own plugin settings.
- It does not access files outside the vault.

The source repository contains TypeScript; `main.js` is generated locally and attached to releases.

## Releases

Release tags must exactly match the `version` in `manifest.json` and use the `x.y.z` format. Pushing such a tag
automatically creates a GitHub release with generated notes and uploads `main.js`, `manifest.json`, and `styles.css`.
The release workflow also creates GitHub artifact attestations for these three assets.

## Documentation

- [Features and requirements](FEATURES.md) – authoritative overview of the current scope and requirements
- [Concept: Review status display](docs/concepts/review-statusanzeige.md) – concept for clearer accepted, ignored, and open change states
- [Contributing](CONTRIBUTING.md) – development workflow, tests, and change checklist

## Development

Install the local development dependencies once, then use the following commands from this directory:

```bash
npm install
npm run dev       # development bundle with inline source maps
npm run build     # strict typecheck and production bundle
npm run validate:manifest
npm run lint      # strict ESLint checks
npm test          # TypeScript unit tests
```

TypeScript source lives in `src/`; `main.js` is the generated Obsidian entry point and is ignored by Git. Rebuild it
before installing the plugin in a vault.

## Tests

The deterministic diff, synchronization rules, and translation tables are tested in TypeScript:

```bash
npm test
```

Run the command from this plugin directory. See [CONTRIBUTING.md](CONTRIBUTING.md) for additional development
guidance.
