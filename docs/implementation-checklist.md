# Implementation checklist

Use this checklist when implementing a Side-by-Side Diff feature, enhancement, or bug fix. It complements the
development and validation instructions in [CONTRIBUTING.md](../CONTRIBUTING.md).

Track each item as complete, pending, or not applicable in the task notes or handoff. Mark an item complete only
after checking it; include a short reason when a file or area needs no change. The unchecked list below is a
reusable template, not the status of a particular issue.

## Implementation

- [ ] **Coding:** Confirm the requested behavior and acceptance criteria, including relevant issue comments.
  Inspect existing flows, preserve unrelated working-tree changes, and implement the focused change in `src/`.
  Preserve explicit saving, conflict checks, deterministic comparisons, and literal file content. Put new visible
  strings in every supported locale with matching keys and placeholders.
- [ ] **Styles:** Review `styles.css` and adjust styles when the interface changes. Check the actual interaction,
  including both panes and affected comparison/editing states. For selection or layout changes, verify dragging,
  highlighting, and the resulting copied text in a browser or Obsidian; unit tests alone cannot verify painting.
- [ ] **Existing tests:** Identify and run affected tests, updating expectations only when the intended behavior
  changes. Run the existing suite to check for regressions without weakening unrelated assertions.
- [ ] **New tests:** Add focused coverage for new behavior and meaningful edge cases. For a bug, demonstrate that
  its regression test fails before the fix and passes afterward. Reuse existing test adapters and fixtures where
  practical; record any manual checks needed for behavior the automated tests cannot exercise.

## Documentation

- [ ] **Changelog:** Add a user-facing entry under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md), using the
  appropriate change category and linking the issue when relevant. Do not change release metadata.
- [ ] **Features:** Review [FEATURES.md](../FEATURES.md) and update the implemented behavior and acceptance
  criteria where the feature scope changes.
- [ ] **README:** Review [README.md](../README.md) and update concise user instructions when the entry points,
  interaction, settings, or requirements change. Keep detailed requirements in `FEATURES.md`.
- [ ] **Roadmap:** Review [ROADMAP.md](../ROADMAP.md) for the affected feature and reconcile its status using the
  roadmap's existing conventions. Distinguish implementation from shipping; remove an entry once shipped. If no
  entry or planning status is affected, record that no roadmap edit is needed.

## Validation and handoff

Run the required checks from [CONTRIBUTING.md](../CONTRIBUTING.md#tests), including a build for plugin-source
changes, and run `git diff --check`. Keep generated `main.js` out of Git. For UI or save changes, use the
[manual checklist](../CONTRIBUTING.md#manual-checklist) and report which environment was actually checked.

Report the checklist status, validation results, and remaining gaps. Distinguish browser checks from an Obsidian
check; leave unperformed checks pending. Creating commits, publishing, or posting to GitHub requires the user's
corresponding request.
