---
name: commit-side-by-side-diff
description: Creates focused Conventional Commits for Side-by-Side Diff after reviewing the diff, tests, and project-specific files. Do not use it to publish, tag, or push a release.
---

# Commit Side-by-Side Diff Changes

Use this skill only in the Side-by-Side Diff repository. Create commits only on explicit request; this skill never
pushes, tags, or publishes a release.

## Classify Changes

- Inspect `git status --short`, the staged diff, the unstaged diff, and recent commit messages before changing the
  index.
- Split independent technical or functional changes into separate commits. A behavior change belongs in the same
  commit as its regression test and related user documentation.
- Leave unassignable or unrelated user changes untouched and ask rather than committing them accidentally. Do not
  modify, discard, or stash user changes to simplify a commit.

## Project Checks

- Read the shared Obsidian plugin checklist via the local `.obsidian-plugin-rules` reference.
- For TypeScript or test changes, run at least the affected tests. For broader changes, use the repository scripts
  for type checking, linting, and tests.
- For user-visible behavior changes, check whether `README.md`, `FEATURES.md`, `CHANGELOG.md`, or translations need
  updating.
- `main.js` is generated and ignored. Do not add it to a commit or run a build merely to commit generated output.
- Run `git diff --check` for the intended changes before each commit.

## Create the Commit

- Stage only the files or hunks belonging to the commit and preserve already staged, unrelated changes.
- Use an English Conventional Commit message that precisely describes the change, for example
  `fix: group contiguous diff changes`.
- Report the commit hashes created and the remaining Git status.
