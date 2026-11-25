---
name: publish-obsidian-plugin-release
description: Checks whether a Side-by-Side Diff release is ready after the user gives a concrete SemVer version, then provides the manual preparation and publishing commands. Use when the user asks to prepare, check, or publish a plugin release. It never changes release metadata, creates commits or tags, or pushes.
---

# Check Obsidian Plugin Release Readiness

Use this skill only in Side-by-Side Diff. Read the full shared Obsidian plugin checklist via `.obsidian-plugin-rules`
and check the applicable pre-publication requirements. The release process is documented in
[CONTRIBUTING.md](../../CONTRIBUTING.md#releasing).

- Ask for the target version in `x.y.z` format if the user has not provided it.
- Inspect `scripts/release.mjs`, the working tree, `main`, its upstream, and the target tag. Preparation needs a
  clean `main` synchronized with `origin/main` and a version newer than the current manifest.
- Before preparation, check for the exact `## [Unreleased]` heading with notes beneath it. If the target is already
  prepared, verify the matching changelog section, synchronized version metadata, and green CI on that commit.
- Keep readiness checks read-only. Report blockers without cleaning, committing, tagging, or pushing.

## Manual release commands

For an unprepared release, give the user the first command with the version filled in. Use the second command
after the release commit has passed CI. For an already prepared release with green CI, give the second command.

```bash
npm run release -- <version>
npm run release -- <version> --publish
```

Preparation validates, commits, and pushes the version metadata and release notes. Publication checks the exact
commit's CI run before creating and pushing an annotated tag. GitHub Actions builds, attests, publishes, and
verifies the assets and notes. After publication, inspect the GitHub release and complete the shared checklist's
post-publication checks.
