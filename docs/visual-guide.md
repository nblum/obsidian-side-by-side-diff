# Illustrated comparison walkthrough

These screenshots use two sample notes, `Release notes.md` and `Revised release notes.md`, in an isolated vault.
They show the English interface with Obsidian's default light theme. Your notes keep their literal Markdown;
review actions stage changes until you explicitly save.

## Choose a layout

The icon button beside Save cycles Automatic → Side by side → Single column → Automatic. Its A, columns and rows
icons identify the preference, and its tooltip names the next choice. Automatic stacks variants when
this comparison is narrower than 720 pixels. Layout switches preserve unsaved changes, review decisions and Undo.

In single column, equal text appears once. Each changed row shows the target first and the incoming source below
it, with file labels and compact Accept / Ignore controls aligned left and right. Block actions appear below the
content once at least two changed rows remain open. Copying includes both selected variants in reading order,
with shared text once and without labels or controls. Editing opens a full-width target below a collapsible
source reference, and resizing keeps the same editor.

Below 720 pixels, compact file rows show Source/Target and filenames, with folders only for identical names.
One vertical arrow reverses the direction; Swap and the edit entry are hidden. An existing editor remains usable.
Single-column comparisons also hide the edit entry in wide views. Button heights follow the device rather than
the layout: switching between columns and stacked rows does not resize Save, navigation or review controls.

![Single-column comparison](../assets/single-column.webp)

## Start from the file explorer

Select two text files, right-click, and choose **Compare files**. Use `Alt`-click on Windows/Linux or `Option`-click
on macOS to select individual files, as described in [Obsidian's file explorer guide](https://obsidian.md/help/plugins/file-explorer).

![Native two-file selection menu with Compare files](../assets/compare-two-files-menu.png)

To start with one note, choose **Compare with another file** from its context menu. You can also use the ribbon
icon or the command palette. With a different text note active, **Compare with active file** opens both files directly.

![Context menu for starting a comparison from a note](../assets/file-menu.webp)

## Select the comparison file

The original remains visible on the left before you choose the comparison. **Open file search** opens the vault
file picker. The **Drop files** card accepts a vault file or an external Markdown file.

![Original preview beside the right-file selector and drop card](../assets/file-selection.png)

## Read the comparison

The headers identify the **Original** and **Comparison**, along with the current **Source** and **Target**.
Green source content will be inserted; red target content will be removed or replaced if you accept it. Inline
highlights identify the changed words within a line. Arrow buttons between the panes accept individual changes;
`×` ignores them. The summary beside the navigation arrows counts open, accepted, and ignored changed lines.
Open rows keep their action buttons; check and minus markers identify accepted and ignored rows. Previous/next controls navigate between
open changes.

![Comparison showing inline differences and open review actions](../assets/compare-mode.webp)

## Locate the current change

Use the previous/next arrows or `Alt+ArrowUp` / `Alt+ArrowDown` to highlight a change. A badge on the active
frame's top border shows its position among the open changed rows: `2/5` means the second of five open changes.
Only the active frame has a badge. Accepting or ignoring a change updates the numbering, and Undo restores it.

![Active change frame with a 2/5 position badge above its border](../assets/active-change.webp)

## Reverse the apply direction

The arrow between the file headers reverses the direction while keeping the files in place. In this example,
the left file becomes the target and the right file supplies incoming content. The target's pencil icon moves
with its role. Save or undo pending changes before reversing direction.

**Swap**, above the direction arrow, exchanges the file positions instead.

![Right-to-left comparison with the target on the left and source on the right](../assets/reverse-direction.webp)

## Resolve a whole block

In side-by-side mode, a block with more than three open changed lines offers **Accept all** and **Ignore all**
in its header. Single-column mode shows these actions below the content from two open changed rows onward. They
resolve the block in one step; a single **Undo** reverses that step. Accept all skips changes you already ignored individually.

![Grouped changes with Accept all and Ignore all controls](../assets/grouped-changes.png)

## Keep both versions

Choose **Keep both** in the block actions when you need text from both versions. For each open fragment, the target
keeps its current text, followed by one blank line and the source text. Ignored or already accepted rows stay as
chosen; unchanged blank lines separate fragments and are not copied twice. The action follows the current merge
direction and remains staged until you save. One **Undo** restores the whole block.

![Target retaining its original paragraph and the incoming source paragraph before saving](../assets/kept-variants.webp)

After saving, both files may still differ. A completed review does not offer identical-file cleanup in that case.

## Review staged changes before saving

Accepting a change updates the target preview. New target text is green; the previous target line remains visible
in red with strikethrough. Deleted previews are excluded from copied and saved target content. Feedback beside
the review controls confirms that the change is staged; its row gains a check marker and the Accepted count increases.
The files on disk remain unchanged.

Use **Undo** or `Ctrl/Cmd+Z` to reverse an accept or ignore action before saving.

![One accepted line with green incoming text and a red deletion preview](../assets/pending-changes.webp)

## Ignore a change

Ignoring removes the row's review highlights and actions while preserving both files' displayed text and line
numbers. A minus marker identifies the ignored row, and the summary counts the decision. Ignoring every difference
completes the review, but does not make the files identical. Undo restores the review action.

![Ignored first difference with both versions of the text still visible](../assets/ignored-changes.webp)

## Edit the target directly

In a wide side-by-side view, the pencil opens **Edit mode** for the target on either side; the source stays
read-only. Narrow and single-column views hide the entry while keeping an existing editor usable. Typing remains
unsaved until **Save changes** or `Ctrl/Cmd+S`. The comparison-mode icon returns to reviewing differences.

![Target editor beside the read-only source](../assets/inline-edit.png)

## Handle unsaved changes

Actions that would replace pending work prompt you to save or discard it. This example appears before swapping
the files. **Save** writes the staged changes before continuing; **Don't save** discards the pending changes.

![Save-or-discard prompt before swapping files](../assets/unsaved-changes.webp)

## Confirm the saved result

**Save changes** writes the staged target content after checking for external changes. If another edit changed
the file since you opened the comparison, saving is canceled and your staged changes remain available for review.

After a successful save, accepted counts reset while ignored differences remain resolved. After accepting and
saving all differences in these sample notes, both files are identical and Save is disabled.
The identical-file message offers a separate, confirmed trash action; review completion alone does not offer that
proof of equality.

![Identical-file comparison after explicitly saving every accepted change](../assets/identical-files.webp)

## Watch the complete workflow

The animation shows native file selection, opening the comparison, accepting changes, and explicitly saving them.

![Animated two-file comparison and save walkthrough](../assets/comparsion-record1.webp)

For keyboard shortcuts, external-file permissions, and other entry points, see the [README](../README.md).
To refresh these images after UI changes, use the [documentation capture workflow](../CONTRIBUTING.md#refreshing-documentation-screenshots).
