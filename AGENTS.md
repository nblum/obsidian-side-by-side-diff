# Side-by-Side Diff Agent Instructions

## Scope

This file contains project-specific guidance. Keep general, cross-project behavior in the user's global agent
instructions and keep task-specific procedures in `agent-skills/`.

Before working on the plugin, read the shared Obsidian plugin checklist at the absolute path stored in the local
`.obsidian-plugin-rules` file. If the reference is missing or the note cannot be opened, ask for its location.
Keep cross-plugin rules in that note and Side-by-Side Diff rules in this repository.

## Language

- Write agent instructions, skills, and project process documentation in English.
- Preserve the required language of user-facing content. The plugin ships German, English, French, Italian, Spanish,
  Brazilian Portuguese, European Portuguese, Dutch, and Simplified Chinese translations, so keep every locale file's keys aligned when adding visible strings.

## Project Map

- `README.md` is the concise user-facing entry point.
- `FEATURES.md` defines the feature scope and acceptance criteria.
- `CONTRIBUTING.md` documents development, validation, and review expectations.
- `src/` contains the TypeScript plugin; `tests/` contains its focused unit tests.
- `main.js` is generated and ignored. Do not add it to commits.

## Project Skills

Read the relevant skill before acting on a matching request:

- `agent-skills/analyze-github-issue/SKILL.md` for investigating a GitHub issue and proposing an implementation
  or fix before user approval to implement.
- `agent-skills/implement-side-by-side-diff/SKILL.md` for implementing features or enhancements using
  `docs/implementation-checklist.md`.
- `agent-skills/fix-side-by-side-diff-bug/SKILL.md` for fixing a reported bug with a regression test and changelog
  entry.
- `agent-skills/commit-side-by-side-diff/SKILL.md` for committing current plugin changes.
- `agent-skills/check-github-pr/SKILL.md` for reviewing a GitHub pull request and reporting actionable findings.
- `agent-skills/publish-obsidian-plugin-release/SKILL.md` for preparing a plugin release for manual publishing.

## Changes and Validation

- Keep changes focused and preserve unrelated working-tree changes.
- For behavior changes, add or update focused tests and update user-facing documentation when needed.
- Use the repository scripts from `CONTRIBUTING.md` for validation. Run a build for plugin-source changes, not to add
  generated output to Git.
