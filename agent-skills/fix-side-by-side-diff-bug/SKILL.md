---
name: fix-side-by-side-diff-bug
description: Fixes a reported bug in Side-by-Side Diff with a regression test and changelog entry. Diagnoses the root cause before changing code and never publishes a release.
---

# Fix Side-by-Side Diff Bug

Use this skill only in the Side-by-Side Diff repository, and only for fixing a specific reported bug—not for new
features or refactors.

## Diagnose

- Read the shared Obsidian plugin checklist via the local `.obsidian-plugin-rules` reference.
- Reproduce the reported bug against the current `src/` behavior before changing code.
- Identify the root cause; do not patch symptoms.

## Fix

- Apply the minimal, focused change in `src/`, matching existing patterns and naming in the touched area.
- Avoid unrelated refactors or behavior changes.

## Add Test Cases

- Add or update a focused regression test in `tests/` that fails before the fix and passes after it.
- Run at least the affected tests. For broader changes, use the repository scripts for type checking, linting, and
  tests from `CONTRIBUTING.md`.

## Update Changelog

- Add an entry under the `## [Unreleased]` heading in `CHANGELOG.md` describing the fix.
- Check whether `README.md` or `FEATURES.md` need updating for user-visible behavior changes, and keep the German
  and English translations aligned if visible strings changed.

## Validate

- Run `git diff --check` for the intended changes.
- Do not build or commit `main.js`; it is generated and ignored.

## Handoff

- Do not commit automatically. Use the `commit-side-by-side-diff` skill on explicit request to create the commit(s).
