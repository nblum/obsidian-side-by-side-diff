---
name: implement-side-by-side-diff
description: Implement Side-by-Side Diff features and enhancements from a request or GitHub issue using the repository implementation checklist. Use the dedicated bug-fix skill for reported bugs and the PR-review skill for review-only requests.
---

# Implement Side By Side Diff

Use this skill in the Side-by-Side Diff repository for requested feature implementation or enhancement work.

## Shared checklist

Read [docs/implementation-checklist.md](../../docs/implementation-checklist.md) before changing files and use it
as the source of truth for coding, styles, existing tests, new tests, changelog, features, README, and roadmap work.
Read the validation commands and relevant manual checks in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Apply the checklist

- Establish the requested behavior from the user's instructions and, when supplied, the issue and its comments.
  Inspect the affected implementation and existing tests before choosing the change.
- Track the checklist items in task notes or the handoff. Complete the applicable implementation and documentation
  work; explain items that need no change instead of editing unrelated files merely to check a box.
- Validate the actual interaction for UI changes as well as the data handled by the code. Follow the checklist's
  distinction between automated tests, browser checks, and an Obsidian check.
- Before handing off, review the diff against the acceptance criteria and report completed items, check results,
  and any pending verification. Do not describe an unverified item as complete.

For a task that becomes a reported bug fix, also read
[fix-side-by-side-diff-bug](../fix-side-by-side-diff-bug/SKILL.md) for reproduction and regression-test requirements.
Do not commit or publish as part of this skill unless separately requested; use the corresponding project skill
for that work.
