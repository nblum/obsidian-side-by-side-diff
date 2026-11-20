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

### Review status and progress

- **Status:** Implemented; pending release.
- **Benefit:** Show open, accepted, and ignored changed-line counts and accessible row markers in both merge
  directions, with consistent undo and guarded saving.
- **Scope:** Session-local review state. Successful saving resets accepted counts and retains ignored decisions;
  review completion remains distinct from file equality and saved content.
- **Reference:** [Implemented behavior](FEATURES.md#review-status-and-progress) and
  [review status design](docs/concepts/review-statusanzeige.md).

### Keep both variants of a changed block

- **Status:** Implemented; pending release.
- **Benefit:** Preserve both versions of open block fragments without manual copying.
- **Scope:** Existing block headers offer Keep both when both versions contain text. Retain target text first,
  one blank separator, then source text in either merge direction. Previously resolved rows and unchanged bridges
  split fragments and remain untouched. Staging, one-step undo, write permissions and guarded saving are reused.
- **Reference:** [Grouped change blocks](FEATURES.md#grouped-change-blocks).

### Optional single-column diff layout

- **Status:** Implemented; pending release (phase 1 of the mobile workstream).
- **Benefit:** Improve prose review and comparison in narrow desktop windows and establish the layout needed
  for phones and tablets.
- **Scope:** Auto, side-by-side, and single-column layout choices. Show equal text once and stack changed
  target/source variants with explicit file identity. Preserve row/block review actions, Keep both, navigation,
  copying, direct target editing, pending changes, and explicit saving across layout changes.
- **Dependency:** Mobile availability requires the separate runtime and device validation in phase 2; this
  layout alone does not establish mobile support.
- **Reference:** [Single-column layout and mobile support plan](docs/concepts/single-column-and-mobile.md).

## Later

### Mobile support

- **Status:** Runtime and narrow-layout preparation implemented; Android/iOS device validation pending (phase 2).
- **Benefit:** Compare and merge vault text files on Android and iOS, with touch-accessible controls and direct
  target editing.
- **Scope:** Remove startup dependencies on desktop-only modules, adapt comparison entry points and dialogs,
  and validate selection, editing, guarded saving, lifecycle behavior, and touch interaction on both platforms.
  External file-manager integration is outside the initial mobile scope; desktop external Markdown stays supported.
- **Release gate:** Retain the desktop-only declaration until the runtime audit and Android/iOS acceptance checks
  pass. Narrow desktop tests are additional evidence, not mobile verification.
- **Reference:** [Single-column layout and mobile support plan](docs/concepts/single-column-and-mobile.md).

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

## Design constraints

New workflows must preserve explicit saving, conflict checks, recoverable cleanup through Obsidian's trash
mechanism, and literal Markdown content. Review completion and file equality must remain distinct. New visible
strings must be translated into every supported locale, and behavior changes need focused validation.
