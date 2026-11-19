# Review status and progress

Status: Implemented, pending release

## Behavior

Comparison mode shows `Open: 2 · Accepted: 3 · Ignored: 1` beside the previous/next arrows directly above the split.
Counts refer to originally changed aligned rows, including additions and deletions. A block action resolves several rows but counts each changed row
once. Unchanged rows and visual alignment gaps do not count.

Each original change has one session-local status:

| Status | Meaning | Marker | Navigation |
| --- | --- | --- | --- |
| `open` | No decision yet | Accept/ignore buttons with a localized group label | Included |
| `accepted` | Source content staged into the current target | Check mark with a localized label | Skipped |
| `ignored` | Both versions retained without a file change | Minus with a localized label | Skipped |

Open entries have no extra status icon. Their action group carries the localized Open label. Accepted and
ignored markers are placed between the panes, outside selectable file text. They have localized tooltips and accessible
names. Colors supplement the symbols. The existing active-change focus remains separate from review status. Only that frame receives a badge on its
top border, for example `5/12`, with its one-based position among currently open changed rows. The badge updates
with navigation, automatic advance, rerenders, and undo; it is absent when the active entry is resolved or during
editing. Its localized accessible label and tooltip describe the position. It is outside selectable file text.
The summary is a polite, atomic status region. Accepted target text and deleted-line previews retain their
existing appearance until explicitly saved; an accepted deletion retains a status entry even if neither
projected cell contains text.

## Identity and content

`ReviewState` captures the original deterministic alignment. Original row positions identify entries within
that review, including repeated identical lines. Accepting a row projects the source value into the target and
updates target indexes without re-aligning the remaining rows. This keeps earlier ignored decisions and later
merge actions attached to their original entries after insertions and deletions.

Keep both adds retained target rows and a separator before the source projection of each uninterrupted open
fragment. These extra rows have no review-entry identity; projected row indexes map back to their original
entries so later navigation and actions retain the right indexes. Undo snapshots contain both decisions and
retained fragments. Ignored/accepted rows and unchanged blank bridges split fragments rather than being copied.

Rendering and row/block actions use the same projected rows and alignment options. No file is written by a
review decision. Literal content, line endings, guarded saving, and external target permissions retain their
existing behavior. Both merge directions use the same model. Proposal acceptance retains its fixed direction.

## Lifecycle

- Accept, Keep both and ignore update only open entries. Block actions skip previously resolved entries.
- After Keep both, completion and equality remain separate even after saving. Identical-file and proposal-copy
  cleanup require equal compared content, including retained target rows.
- Existing Undo restores content and review statuses together. A block action is one undo step.
- Next/previous and automatic advance visit only open changes. Automatic advance still follows its setting.
- Failed or conflicting saves preserve pending content and review status.
- Successful saving clears accepted counts and undo history and rebases the projected rows on saved content.
  Open and ignored entries retain their identities, including duplicate-heavy alignments. Saved target-only
  deletion placeholders are removed. Saving does not make ignored differences equal or reopen them.
- Swapping panes preserves ignored decisions and their remapped undo actions. Pending content follows the
  existing save/discard confirmation. Reversing direction reopens ignored entries and starts a fresh review.
- Discarding or selecting another comparison resets transient decisions. Review state is not persisted.
- Direct editing uses its existing changed-line summary rather than review counters and retains its existing
  save/discard confirmation. Returning to comparison retains the review when contents still match; changed
  contents start a new alignment.
- Explicit Refresh, available without pending changes, starts a new alignment, retaining matching ignored
  differences and their undo. Ordinary rerenders, including language changes, retain the review.
- If displayed file contents change outside the projected model, a new alignment is built. Only ignored entries
  whose current keys still match are carried over. Staged target content remains protected by the save guard.

Review completion means that every original difference has a decision. It does not establish file equality or
that staged content has been saved. The existing completion message retains that distinction.

## Validation

Focused tests cover repeated lines, insertions before ignored changes, deletion-only reviews, both directions,
row/block undo, ignored decisions after save and swap, resets, guarded save failures, and rendered status
markers. The isolated Obsidian E2E suite covers accessible labels, review counts, explicit saving, failed saving,
both merge directions, shifting target indexes, and mixed block acceptance/undo. All nine locales have the same
keys and placeholders. Documentation captures include open, accepted, ignored, and reverse-direction states.
