# Project Agent Skills

This directory contains workflows specific to Side-by-Side Diff. `AGENTS.md` remains a concise project map and
directs an agent here only when a task matches a documented workflow.

Before applying any project skill, read the shared Obsidian plugin checklist via the local
`.obsidian-plugin-rules` reference. Ask for the location if the reference or its target is missing.

## Layout

```text
agent-skills/
├── README.md
├── analyze-github-issue/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── implement-side-by-side-diff/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── fix-side-by-side-diff-bug/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── commit-side-by-side-diff/
│   ├── SKILL.md
│   └── agents/openai.yaml
├── check-github-pr/
│   ├── SKILL.md
│   └── agents/openai.yaml
└── publish-obsidian-plugin-release/
    ├── SKILL.md
    └── agents/openai.yaml
```

## Available Skills

- `analyze-github-issue` investigates an issue, proposes an implementation or fix, and waits for user approval
  before making changes.
- `implement-side-by-side-diff` implements features and enhancements using the shared
  [implementation checklist](../docs/implementation-checklist.md).
- `fix-side-by-side-diff-bug` fixes a reported bug with a regression test and a changelog entry.
- `commit-side-by-side-diff` creates focused commits without pushing, tagging, or publishing.
- `check-github-pr` reviews a plugin PR, reports findings and validation gaps, and guides requested fixes through
  validation and an explicitly authorized update of the existing PR branch.
- `publish-obsidian-plugin-release` prepares a release and hands the publishing command to the user.

## Maintaining Skills

Keep each skill limited to one recurring workflow. Store shared instructions in `AGENTS.md`, project knowledge in
the existing documentation, and conditional or procedural guidance in the relevant skill. Add scripts, references,
or assets only when they directly improve that workflow.
