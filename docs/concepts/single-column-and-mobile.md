# Single-column layout and mobile support

The plugin manifest enables vault file comparisons on Android and iOS. Android and iOS device validation is
pending. The startup check uses a mobile API stub, and the automated touch tests run in desktop Obsidian.

`FEATURES.md` is the reference for available behavior.

## Scope

The comparison can use side-by-side or single-column presentation. Both layouts share files, deterministic
alignment, original review identities, staged changes, undo, navigation, and guarded explicit saving. Ordinary
comparisons, proposals, proposal acceptance, row/block actions, Keep both, copying, and direct target editing use
the existing action handlers and serializers. There is no second merge algorithm.

Desktop external Markdown comparisons remain supported. Initial mobile work targets vault files. Mobile external
file-manager imports, writable external handles, and OS share-sheet integration are deferred. Rendered Markdown,
Syncthing queues, and general diff performance redesign remain separate roadmap items.

## Layout selection and state

- An icon-only toolbar button cycles Automatic → Side by side → Single column → Automatic. Matching custom
  SVG icons show A, columns, and rows; a localized tooltip and accessible label name the current and next choice.
  Automatic is the default and uses single column below 720 CSS pixels of comparison-container width. Wider views retain side-by-side mode.
  A fixed preference overrides width, including on a narrow screen.
- `defaultLayout` initializes new comparisons; validated workspace `layout` restores an explicit preference.
  Missing or invalid workspace data uses the configured default. The preference, rather than Auto's resolved
  result, is persisted. Swap and external-source restoration retain it.
- Layout changes update presentation without refreshing files or rebuilding the session. They preserve pending
  content, save baselines, decisions, undo, file identities, merge direction, and the active-change badge.
- The first visible logical row anchors scroll restoration, and focused row controls retain focus when moved.
  Comparison selections may clear when presentation changes.
- The editor DOM remains mounted during manual and Auto transitions, retaining buffer, caret, selection, and
  native undo. An active composition delays the presentation transition until composition ends.

## Single-column comparison

File headers identify both files, paths, Original/Comparison/Proposal identity, and Source/Target roles. Logical
left/right identity and Swap semantics do not depend on the layout. Narrow headers show compact file rows with
one direction control; wider single-column views retain the stacked file identity.

Equal literal text is visible once, with both line numbers. Changed aligned rows show the current target first,
then the incoming source, labeled with file name and role. Alignment gaps are hidden; real empty and whitespace-only
lines remain. Ignored differences retain both actual variants with neutral colors. Wrapping never changes content.

Each original changed row has one review action group. Single-column actions have visible Accept/Ignore labels
and accessible target-specific names. Row and block buttons share 8-pixel rounded outlines, stable interface
typography, theme-aware semantic tints, and hover/focus/disabled states. Review controls are 32 pixels high on
desktop, with a 44-pixel mobile minimum. Row buttons have 3-pixel vertical margins; the stacked action strip joins
the preceding variant and leaves a 4-pixel gap below. Accept aligns left and Ignore right.
Single-column blocks expose their actions after the content from two open changed rows onward. Side-by-side mode
keeps headers for more than three open changed rows. Layout transitions move the same controls or detach small-block
controls when switching to side-by-side mode; focus falls back to the layout button if a focused control disappears.
Block boundaries, Keep both, progress, markers, active-change numbering, and navigation retain their semantics. Stacked variants and
preview rows never add review entries.

Pending insertions and struck-through target deletions remain visible. Deleted previews are excluded from copied
and saved target text. Review completion, saved content, file equality, and cleanup eligibility stay distinct.

The implementation keeps one paired DOM projection and changes its reading order and visibility. Shared rows
retain metadata for both files while only the target's text is displayed. It does not recompute the diff when
switching layout.

## Compact file headers

Below the same 720 CSS-pixel view-width threshold used by Auto, the file header shows two compact rows with short
Source/Target roles and filenames. This applies independently of the selected layout. Names wrap to at most two
lines and expose their full path on hover; folders appear only when both names match, with a localized label for
external files. Original/Comparison labels, repeated full paths, Swap and the edit entry are hidden. One vertical
44-pixel direction control remains, retaining pending-change and fixed-proposal restrictions. Desktop controls
return at 720 pixels, except that the edit entry remains hidden in any single-column comparison. A live editor
and its return action survive narrowing or switching layout; hidden focused actions fall back to
the layout control. Header changes preserve the visible logical row, including when the chosen layout stays fixed.

## Leaving editing

The existing editor remains usable after switching to single column. Its localized Leave edit mode text button
offers Save, Discard changes or Cancel for unsaved edits; Escape also cancels. Save/discard affect only the actual
target, and a failed save retains the live editor. Compared-file modify events preserve a dirty editor so an
external change during the exit confirmation is detected by the normal save-baseline guard.

## Selection and copying

Single-column comparison copies selected text in reading order, including both changed variants and shared
text once. There is no copy-source selector. Native pointer selection can span both variants; keyboard selections
and ranges whose endpoints are grid containers use the same reading order.

Copy clips partial boundary lines and preserves real blank lines and literal spaces while excluding hidden shared
duplicates, alignment gaps, staged deletion previews, labels, line numbers, and controls. Side-by-side comparisons
retain their existing selection and copying of one file at a time.

Native desktop drag selection and clipboard-event output are checked in isolated Obsidian. Android/iOS long-press
handles and native clipboard behavior remain device acceptance items. If native mobile selection cannot provide
this behavior, an explicit copy action is required before mobile availability.

## Direct editing and narrow controls

Single-column edit mode places a full-width target below a collapsible, read-only source reference. Headers keep
both identities available while the reference is collapsed. Read-only source variants are never inserted into the
editable buffer. Alignment gaps are hidden and paired minimum heights are cleared; side-by-side mode restores
paired alignment. The existing literal serializer still determines saved content.

Edit-entry save/discard handling, target permission checks, line endings, explicit saving, direction restrictions,
and proposal workflows retain their existing behavior. Layout controls do not bypass them.

The initial preview and picker stack vertically in single column. Toolbars and dialogs allow wrapped controls;
mobile controls have minimum 44-by-44 CSS-pixel touch targets. Desktop controls retain their theme sizing.
Review actions use a minimum width of 44 pixels and heights of 32 pixels on desktop or at least 44 on mobile.
The square layout switch shares Save's height, with its icon inset by four pixels. File selection, Save, Undo, navigation, and
review do not depend on drag and drop, multi-selection, tab menus, shortcuts, or hover. Software-keyboard,
orientation, composition, accessibility, and lifecycle behavior still need device verification.

## Mobile runtime boundary

`desktop-capabilities.ts` defers Node path helpers and Electron drop metadata until a desktop operation needs
them. It returns no native-path capability on mobile. There are no top-level Node/Electron imports in the plugin's
runtime graph; Node use in development tools and desktop E2E tests is unaffected.

Vault workflows continue to use Obsidian vault identities and APIs. Desktop external-file identity checks and
browser handles retain their behavior. Optional desktop tab hooks and external-drop cards are skipped on mobile.
The production bundle's startup test supplies only the Obsidian module. It verifies that vault commands are
registered, desktop CLI and tab hooks are skipped, and startup never tries to resolve Node or Electron.

## Validation and implementation checklist

The implementation follows `docs/implementation-checklist.md`:

| Area | Evidence / status |
| --- | --- |
| Source and styles | Shared review handlers, layout/state/default controls, stacked presentation, retained editor, copying in reading order, and lazy desktop capabilities implemented. |
| Translations | New keys and placeholders aligned across all nine locale files. |
| Focused tests | Layout resolution, malformed/old workspace state, default persistence in both settings renderers, mobile bundle loading and absent native capabilities; existing merge, whitespace, line-ending and external-file tests retained. |
| Isolated Obsidian E2E | Both directions, row/block review, Keep both, undo across layouts, navigation, explicit saving, save conflicts, proposals, workspace restoration, responsive widths, copying both variants, native mouse selection, and editor identity/undo. Run results are recorded in the task handoff. |
| Responsive checks | 360, 390, 600, 719, 720, 768, and 1024 CSS-pixel comparison containers. Narrow checks assert no content overflow and minimum action target width. |
| Screenshots | Existing capture suite updated, including a narrow single-column example and adjusted keyboard-shortcut illustration. |
| Documentation | README, FEATURES, visual guide, changelog, roadmap, and this concept updated. Release metadata remains unchanged. |
| Mobile device checks | Pending; no Android/iOS device or emulator is available in the implementation environment. |

Desktop window resizing and a mobile-like browser viewport establish layout behavior only. They do not establish
mobile runtime, native clipboard, software-keyboard, or lifecycle compatibility.

## Recorded validation (2026-11-19–20)

- `npm run lint`, `npm run typecheck`, `npm run validate:manifest`, `npm run build`, and `git diff --check` passed.
- `npm test`: 269 tests passed, including production-bundle loading with desktop modules unavailable.
- The full isolated desktop E2E suite passed on Obsidian 1.6.7: 63 cases, comprising 21 comparison cases and
  42 layout cases, including compact controls, file headers, copying both variants, edit-exit confirmation,
  block footers and the scroll-anchor regression.
- Ten affected layout/editor E2E workflows passed on Obsidian 1.15.1 after the final changes.
- The documentation capture suite passed on Obsidian 1.15.1; all 15 captures and the derived keyboard
  illustration were refreshed and the plugin was rebuilt with the updated assets. Wide and narrow comparisons, editing, pending/ignored/retained variants, save prompts,
  and the keyboard callouts were visually inspected in the default light theme.
- Local documentation links and image references resolve. No Android/iOS runtime or native device checks were run.

## Additional E2E coverage

### Row-action spacing follow-up (2026-11-20)

Row Accept/Ignore buttons have 3-pixel vertical margins in both layouts, retaining their device-specific heights.
In single column, the action strip joins the last visible variant without a divider and leaves a 4-pixel gap
afterwards. This makes the controls read as the footer of the change above. The geometry case checks both
360- and 390-pixel views, exact margins, opposite-edge alignment, and the greater distance to the following change.
The full 63-case suite on Obsidian 1.6.7 and all 269 unit tests pass. No visible strings, review logic, persistence,
or roadmap status changed; translations and device release gates remain unchanged.

### Layout and editor workflows

The layout suite now has 42 cases. Nine follow-up cases exercise the initial narrow preview/picker, layout-default
persistence through the actual settings UI, visible-row and keyboard-focus continuity, backward multi-line editor
selection and literal CRLF/blank-line/hard-break preservation in both directions, staged-deletion clipboard
exclusion and copying both visible variants in both directions, and Save/Don't save before entering the stacked editor.
Five additional cases verify compact row-control heights and opposite-edge alignment, block-action placement
after content, two-row block eligibility, restored desktop headers, both directions, and one-step undo.
Three more cases cover the icon-only preference cycle with mouse/Space/Enter (also during editing), matching
review-button typography and appearance in light/dark themes, hover/keyboard focus, and disabled styling.
A further geometry regression checks all three preferences at narrow and wide container sizes, both with and
without mobile styling: the square layout button matches Save's height and its icon is four pixels smaller.
Both buttons use the theme's desktop input height or a mobile minimum of 44 pixels. This test reproduced the
mismatch before the correction: a 44-pixel layout button beside a 30-pixel Save button on desktop.
Two compact-header cases check 360/390/719/720-pixel widths, source/target reversal and saving, desktop control
restoration, focus fallback, live-editor retention, same-name folder disambiguation and long-name wrapping.
Two regressions cover the edit entry in all single-column views and button heights across all preferences and
narrow/wide views, with desktop and mobile styling checked separately. Before the correction, desktop Save grew
from 30 to 44 pixels, navigation from 26 to 44 pixels, and review actions also changed height with the layout.
Review controls now use a shared 32-pixel desktop height and a 44-pixel mobile minimum. No layout selector applies
device sizing; existing desktop editor sessions and their return action remain available in single-column mode.
Six exit-editor cases exercise Save and Discard in both directions, Cancel/Escape retaining the same editor,
and an external-change conflict while the exit dialog is open. The conflict test reproduced a dirty-editor
replacement before the file-refresh guard was added; a focused unit regression failed for the same cause.

The scroll-anchor E2E case reproduced a jump when stacked headers moved the scroll viewport. A focused unit
regression also failed before the fix (an unchanged document scroll position moved from 500 to 700 pixels).
The correction calculates the row offset against the viewport's current top after changing presentation.
This changes scrolling only; merge decisions, file contents, and static documentation captures are unaffected.

## Device acceptance checks

Run these checks in Android and iOS Obsidian on devices or emulators. Test phone portrait, phone landscape,
and tablet widths. Record the oldest mobile app version you can test and the current public version for each OS.

### Prepare a disposable test vault

Build from the checkout you intend to test. These commands copy the comparison fixtures and production plugin
files into a temporary vault.

```bash
npm run build
sbs_mobile_vault=$(mktemp -d "${TMPDIR:-/tmp}/sbs-mobile.XXXXXX")
sbs_mobile_plugin="$sbs_mobile_vault/.obsidian/plugins/side-by-side-diff"
mkdir -p "$sbs_mobile_plugin"
cp tests/e2e/vault/*.md "$sbs_mobile_vault/"
cp main.js manifest.json styles.css "$sbs_mobile_plugin/"
printf '%s\n' "$sbs_mobile_vault"
```

Transfer the vault to the device, including its hidden `.obsidian` directory. Open it as a local vault and enable
Side-by-Side Diff under **Community plugins**. Keep a clean copy of the fixture notes and restore them before
repeating a case that changes either note. For the block and literal-text cases, also import the two
`tests/fixtures/contiguous-block-*.md` files and prepare copies containing CRLF, an empty line, a Markdown hard
break (two trailing spaces), and a final blank line. Compare retrieved files byte for byte for the literal-text
checks.

### Run the cases on each OS

1. **Installation and entry points.** Enable the plugin and complete the introduction. Open About, Help, and
   Settings. Run **Compare two files** through the command palette with no active note and select both fixtures
   in the pickers. With a fixture active, use the ribbon action to pick the second file. From the file explorer,
   choose **Compare with active file** on the other fixture and verify the comparison opens directly. Check that
   the comparison picker omits the desktop drop card. Disable and re-enable the plugin and reopen the comparison.
2. **Touch review and saving.** Use Automatic layout on a narrow phone. Open `Original.md` on the left and
   `Comparison.md` on the right. Tap Next/Previous, Ignore, Undo, then Accept. Check the active change and review
   counts after each action. Verify the target still contains its original wording before Save. Tap Save and
   verify only the target changes. Restore the notes and repeat with the direction reversed.
3. **Block review and proposals.** Compare the contiguous-block fixtures. Tap Accept all, Undo, Ignore all, Undo,
   then Keep both. Check that Undo restores the entire block in one step and Keep both stages target text, one
   blank separator, then source text. Open **Suggest changes** from an active note, edit and save its change copy,
   then choose **Accept changes** from the original note. Verify the original changes only when explicitly saved.
4. **Native clipboard and responsive layout.** Long-press stacked comparison text, extend the selection handles
   across both changed variants and a shared row, and paste into a scratch note. Expect the selected variants and
   shared text once each, in reading order, with literal whitespace and without labels, line numbers, or staged
   deletions. Repeat with a long comparison, rotate with a staged change, and switch layouts at tablet width.
   Check that the controls remain tappable and review state survives.
5. **Direct editing and native keyboard.** Open target editing in a wide side-by-side view. Type multi-line text
   with the software keyboard and compose text with an IME. Switch layouts and rotate with an active selection.
   Check the caret, native Undo, collapsible source reference, and keyboard visibility. Leave editing and exercise
   Cancel, Discard, and Save. Compare saved bytes for CRLF, blank lines, Markdown hard breaks, and final blank
   lines. Repeat for the other target.
6. **Guarded saving and lifecycle.** Stage a change, background the app, modify the target through a second
   editor, and resume. Saving must report the conflict and preserve the newer file. Test rename and deletion
   separately and verify that neither can cause Save to write to the wrong file or recreate a deleted target.
   Close with an unsaved change and check the prompt. Restart Obsidian with a clean comparison open and verify
   both files, direction, and layout preference when Obsidian restores the tab.
7. **Themes, labels, and long paths.** Repeat the picker and touch review in light and dark themes and with a
   translated UI. Use long filenames and identical filenames in different folders. Verify readable labels,
   distinguishable paths, and usable file and review controls in portrait and landscape.

Record one result per case and OS with the date, build commit, device or emulator model, OS version,
Obsidian version, orientation or width, and pass, fail, or untested status. Include reproduction steps for
failures and state why any device or app-version combination was unavailable. Update the documented compatibility
if the results establish an app version or platform limitation.
