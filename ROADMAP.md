# Roadmap

This is the central list of candidate and planned features for Side-by-Side Diff. Entries under **Under
consideration** are ideas to evaluate, not commitments or release promises. No delivery dates are assigned.

## Where work is tracked

- [FEATURES.md](FEATURES.md) describes implemented behavior and acceptance criteria.
- This roadmap records the user benefit, initial scope, and planning status of future features.
- [docs/concepts/](docs/concepts/) holds detailed designs and open product decisions. Link them from the relevant entry.
- GitHub issues track actionable implementation work. Add an issue link to the entry when one is created.

Move an entry to **Later** when its direction is accepted but it is deferred, or to **Next** when it is selected
for implementation. Once shipped, update the feature reference and changelog and remove the entry from this roadmap.

## Next

No features are currently selected for implementation.

## Later

No features are currently assigned to this group.

## Under consideration

The comparison and merge ideas below came from a local source review of **Obsidian File Diff 1.1.2**, with
additional topics from linked GitHub issues and existing concepts. The order below suggests an evaluation order,
not a delivery sequence.

### Guided Syncthing conflict review

- **Benefit:** Find and resolve conflict copies without manually locating each original.
- **Initial scope:** Discover Markdown conflict copies, pair them with originals in the same folder, and open a
  review queue with progress, Skip, Next, and Stop controls. Reuse staged changes and explicit saving.
- **Decisions:** Handle missing originals and multiple conflict copies; revalidate files before actions; decide
  when to offer moving a conflict copy to the trash. Finishing a review, especially after ignoring changes, does
  not establish that the files are identical. This remains a manual two-way merge without a shared ancestor.

### Keep both variants of a changed block

- **Benefit:** Preserve useful content from both versions without copying and pasting it manually.
- **Initial scope:** Add a distinct **Keep both** block action that stages both variants into the right file and
  participates in undo. Keep the existing **Accept all** meaning: accept every applicable change in the block.
- **Decisions:** Define the order and separator between variants and how previously resolved rows are handled.

### Review status and progress

- **Benefit:** Make open, accepted, and ignored changes visible throughout a review.
- **Initial scope:** Add review counts and accessible status markers, keeping review progress distinct from
  whether changes have been saved.
- **Design:** [Review status concept](docs/concepts/review-statusanzeige.md). Reconcile the draft with existing
  undo behavior and current translation requirements before implementation.

### Optional single-column diff layout

- **Benefit:** Improve prose review and comparison in narrow windows.
- **Initial scope:** Show unchanged text once and stack changed variants vertically, retaining file identity,
  navigation, and staged merge actions. Keep side-by-side comparison available.
- **Decisions:** Define layout switching with pending changes and how direct editing works in this layout.

### Reading view for Markdown comparisons

- **Benefit:** Review Markdown in a reading-oriented view and switch to editing when needed.
- **Initial scope:** Add a reading/editing toggle to the side-by-side comparison. Evaluate a rendered Markdown
  preview for formatted headings, lists, links, and other content.
- **Decisions:** Clarify whether rendered Markdown is required; evaluate the requested default reading mode,
  click-to-edit behavior, and return to reading on focus loss. Define how highlighting, alignment, and pending
  changes behave during transitions while preserving explicit saving.
- **Issue:** [#6 — Reading view for Markdown comparisons](https://github.com/nblum/obsidian-side-by-side-diff/issues/6),
  including the requester's clarification about switching modes on focus changes.

### Explicit read-only comparison

- **Benefit:** Review references or archived versions with a view dedicated to inspection.
- **Initial scope:** Provide a comparison mode with navigation and highlighting, without merge, edit, or trash
  actions.
- **Decisions:** Choose the entry point and define how switching modes handles pending changes.

### Finer inline highlighting

- **Benefit:** Make punctuation edits and changes in text without spaces easier to identify.
- **Initial scope:** Evaluate punctuation-aware tokenization or character-level refinement within changed tokens.
- **Decisions:** Compare readability across supported languages and retain deterministic, bounded calculations.
  Preserve literal content, including trailing spaces that can represent Markdown hard breaks.

### Mobile support

- **Benefit:** Compare vault notes on phones and tablets.
- **Initial scope:** Audit desktop API dependencies and validate comparison, saving, navigation, and touch
  interaction on mobile before changing the desktop-only declaration.
- **Decisions:** Determine a suitable narrow-screen layout and which external-file capabilities are available.

## Design constraints

New workflows must preserve explicit saving, conflict checks, recoverable cleanup through Obsidian's trash
mechanism, and literal Markdown content. Review completion and file equality must remain distinct. New visible
strings must be translated into every supported locale, and behavior changes need focused validation.
