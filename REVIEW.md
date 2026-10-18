# Measured: UX, functionality, and test review

Reviewed on 2026-10-18 against commit `19e1b4e` (live at https://ccavins.github.io/Graphic_app/) and the same commit run locally.
Every tool, options-bar control, inspector control, dialog, menu, and file path was exercised with a scripted browser
probe (Chromium and WebKit, 1440 x 900 down to 390 x 844) plus a read of `src/editor/editor.ts` and the panel components.

Baseline: `npm test` 137 unit tests green, `npx playwright test` 18 e2e green locally and against the live site, CI 6/6 green at about 3 minutes per run.

Severity key: **bug** (wrong or broken behavior, or lost work), **UX** (works but confusing or hard to find), **missing** (expected capability absent), **polish** (small).

## Status

| Status | Count |
| --- | --- |
| Open at review time | 62 |
| Closed in this pass | 50 |
| Still open | 12 (O4, O5, O6, A3, A4, A6, N6, X2, X3, X4, Q3, Q4) |

Beyond the list: the Canvas pane was reworked after user feedback (3edae72). One Unit menu drives the page size, grid, and the paper side of the scale; Paper and Real each pair a number box with a unit menu; changing the unit restates the scale and the real-unit choices follow the system (in/ft/yd/mi, mm/cm/m/km, or px). A new text box also undoes in one step (20e2381).

Closed items name the commit that closed them. Final state verified on 2026-10-18 at 1440 x 900, 1024 x 1366, and 390 x 844 against the live site: `npm test` 156 unit tests, 35 Playwright specs in Chromium plus 6 WebKit layout sizes, coverage check 181 features.

## 1. Left toolbar and tools

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| T1 | missing | `App.tsx` toolbar `.tip` | Hover tooltip shows only the tool name ("Rect", "Round", "Path"). No shortcut key, no one-line description, and nothing at all on touch devices where hover does not exist. | Probe: every tip text equals the aria-label | cedb8d3 tooltips with name, key, hint; long-press on touch |
| T2 | missing | `editor.key()` | Arc, Rounded rectangle, Polygon, and Star have no keyboard shortcut. All other tools do. | Probe: "NO SHORTCUT" for 4 tools | cedb8d3 keys U, D, Y, S |
| T3 | UX | `OptionsBar.tsx` `TOOL_NAMES` | Names are terse or ambiguous for new users: "Move" (selection), "Path" (point editing), "Round" (rounded rectangle), "Rect". | Reading | cedb8d3 Select, Direct select, Rectangle, Rounded rectangle |
| T4 | bug | `editor.setTool()` | Switching tools or pressing Escape while the Pen has unfinished points silently discards them. Three clicks then clicking another tool loses the path with no banner and no undo entry. | Probe: pen 3 pts -> switch tool -> nodes 0 | c6102c1 pen path is finished, not discarded |
| T5 | UX | `editor.pointerMove` create readout | Line tool readout shows "W x H" of the bounding box, not the line length and angle, which is what a measuring app user expects. | Probe: line readout "1.11 in x 0.69 in" | 5d14caf length · angle |
| T6 | UX | `pointerDown` gradient / scissors / add anchor | Clicking on empty canvas with Gradient, Scissors, or Add anchor does nothing and shows no hint about what to click. | Probe: banner null for all three | final pass: banner says what to click |
| T7 | bug | `pointerDown` alt-drag + `pointerUp` snapshotAfter | Alt-drag duplicate records two history entries (duplicate, then move). One Undo leaves the duplicate sitting on top of the original so Undo appears to do nothing. | Probe: alt-dup nodes 2, undo nodes 2 | c6102c1 one undo step |
| T8 | bug | `pointerUp` -> `addNode()` | Drawing on a locked layer throws an uncaught exception from the pointer handler. The shape is not added, no banner appears, and a dead snapshot is pushed to history. | Probe: banner null, pageerror | c6102c1 banner, no throw |
| T9 | UX | `editor.Tool` type, `TOOL_NAMES` | `convert`, `scale`, `rotate`, `slant`, `pattern`, `image` exist in the `Tool` type and `TOOL_NAMES` but no code handles them and they are not in the toolbar. Dead surface area. | Grep | cedb8d3 removed |
| T10 | polish | `App.tsx` `.tool-name` | 10 px tool name above the toolbar duplicates the bold active-tool label in the options bar. | Screenshot | cedb8d3 removed with the new tooltip |
| T11 | UX | Zoom tool | Zoom tool only click-zooms; there is no drag-to-zoom marquee and no hint that Alt zooms out. | Reading + probe | cedb8d3 tooltip and Help explain Option-click; drag-marquee zoom still open |
| T12 | polish | Text tool | A click with the Text tool creates point text; a drag creates area text. Neither is documented anywhere. | Probe | 6dcb072 documented in Help > Tools |

## 2. Options bar

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| O1 | bug | `OptionsBar.tsx` Snap select vs `Properties.tsx` Grid "Snap to grid" | Two controls drive overlapping state. Checking Grid > "Snap to grid" turns snapping on (uses grid spacing) but the options-bar Snap select still says "Off". | Probe: grid.snap true, select "off" | c6102c1 one snap state |
| O2 | UX | `Field` + `editor.setNumber` | Invalid typed sizes show a banner but also throw an uncaught error (`guard()` rethrows) and the field keeps the bad draft text until blur. | Probe: pageerror "Cannot parse length abc" | 3edae72 inline error, no uncaught error |
| O3 | UX | Radius, Sides, Points, Inner %, Diameter, Eraser, Size fields | Invalid or out-of-range input is silently clamped ("abc" -> 0, "2" sides -> 3, "200" inner -> 95). No feedback. | Probe | 3edae72 refused with a message |
| O4 | UX | Rotation field with multiple selection | Field is enabled and shows the first object's angle; typing rotates each object individually about its own center, which is not obvious. | Probe: 2 selected, rotation enabled | open |
| O5 | UX | Zoom select | A `<select>` whose first option is the current percentage. Cannot type a zoom level; the "100%" option label collides with the current value when zoom is 100%. | Screenshot | open |
| O6 | UX | Narrow screens | Snap and Zoom controls sit at the far right of a horizontally scrolling bar and are off-screen on phones with no affordance that the bar scrolls. | Probe 390 px: optionsOverflow 277 | open (bar scrolls; no affordance yet) |

## 3. Inspector: Properties

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| P1 | UX | `ScaleRow` readout | Scale readout says "1 pt = 0.6667 in", which is meaningless to a user who typed "1/4 in = 1 ft". Should echo the statement. | Probe | 5d14caf echoes the statement; 3edae72 presets |
| P2 | UX | `ScaleRow` + label unit | Setting a scale in feet leaves the label unit at inches, so a 40 ft wall reads "480 in". | Probe: W "480 in" | 5d14caf label unit follows the scale |
| P3 | UX | Align section | Align/Distribute buttons are always enabled; with 0 or 1 objects selected they only show a banner. Aligning one object to the canvas is not supported. | Probe | a8b2d35 disabled with a reason; align-to-canvas still open |
| P4 | UX | Transform > Move X / Y | Typing "1 in" is accepted but immediately redisplays as "72" (points), with no unit. | Probe | 3edae72 number box with unit suffix |
| P5 | UX | Canvas > Add (resize) | Side buttons are lowercase "left right top bottom" with an "Add" field; the relationship is unclear and "Artwork x2 / x1/2" sits in the same row doing something unrelated. | Screenshot | 3edae72 "Grow page by" with unit, capitalized sides, "Fit the page to the drawing" row |
| P6 | polish | Canvas Units select | Changing base unit changes the ruler and canvas fields but not the measurement label unit; two different "units" settings live in the same pane. | Probe | 3edae72 one Unit menu; label unit follows when automatic |
| P7 | polish | Grid section | Grid has its own snap checkbox, "Snap to points", spacing in points with no unit, and margins. Overlaps with options-bar Snap. | Reading | 3edae72 spacing and margins in the page unit; snap state shared since c6102c1 |

## 4. Inspector: Appearance

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| A1 | UX | Stroke Width field | "abc" and "-4" are silently ignored (width stays). No feedback. | Probe | 3edae72 refused with a message |
| A2 | UX | Stroke Custom dash | Non-numeric tokens are silently dropped ("4 2 a" -> [4, 2]). | Probe | 3edae72 refused with a message |
| A3 | polish | Stroke Arrows on closed shapes | Arrowheads can be set on a closed rectangle where they are meaningless. | Probe | open |
| A4 | UX | Fill Type "Image" | Selecting Image with no imported image shows a banner but leaves the select on the previous value with no path to import from here. | Probe | open |
| A5 | UX | Styles section vs Libraries > Saved styles | Saved styles are listed and deletable in two different panes. | Reading | 5d14caf one list in Appearance |
| A6 | polish | "Save selection as pattern" | Lives in the Fill section with a free-text name field; discoverability is low and the result only appears after choosing Type = Pattern. | Reading | open |

## 5. Inspector: Layers

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| L1 | UX | Arrange > Mask | Mask with fewer than two objects is a silent no-op (other actions show a banner). | Probe: banner null | a8b2d35 banner |
| L2 | UX | Object rename | Double-click on an object row opens `window.prompt`; layer rename is inline. Inconsistent, and `prompt` is blocked in some embedded browsers. | Reading | 5d14caf inline rename |
| L3 | UX | Arrange / Combine / Path action list | Group, Ungroup, and z-order also appear in Properties > Align and in the context menu. Three places for the same actions. | Reading | 5d14caf Layers keeps Mask / Compound only |
| L4 | polish | Layer lock / visibility | Lock state uses emoji glyphs that render differently per platform; no tooltip on hover. | Screenshot | 5d14caf icons with tooltips |

## 6. Inspector: Libraries

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| B1 | bug | `editor.serialize()` / autosave | Custom libraries and saved plugins are not persisted. Reload loses them. | Probe: libs 1 -> 0, plugins 1 -> 0 | c6102c1 persisted |
| B2 | UX | `placeSymbol()` default position | Clicking a symbol places it at paper (48, 48) regardless of the current view. Repeated clicks stack on the exact same spot. | Probe: 48,48 twice | 5d14caf view center, offset per repeat |
| B3 | UX | Search with no results | Empty list with no "No shapes match" message. | Probe | 5d14caf "No shapes match" |
| B4 | polish | Custom library creation | Uses `window.prompt` for the name. | Reading | 5d14caf named automatically, renamed inline |

## 7. Dialogs, menus, files

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| D1 | bug | `Dialog` in `dialogs.tsx` | Escape does not close a dialog once any control inside it has focus: `<dialog onKeyDown={stopPropagation}>` stops the event before the window listener. Recolor, Export, Plugins all affected. | Probe: scrim intercepts after Escape | c6102c1 |
| D2 | bug | autosave / `serialize()` | Only the active tab is autosaved. With two documents open, reloading restores whichever tab was active and silently drops the other, including all its drawing. | Probe: tabs 2 -> 1, doc 1 nodes 4 -> 0 | c6102c1 every tab saved |
| D3 | bug | `closeDocument()`, tab close "x", Alt-W | Closing a document (or the last tab) discards its content with no confirmation and no way back. | Probe | c6102c1 confirm |
| D4 | bug | `editor.key()` Alt-N / Alt-W | On macOS, Option+N and Option+W produce dead/special characters (`event.key` is not "n"/"w"), so the advertised shortcuts do not fire on real Mac keyboards. Should match on `event.code`. | Reading; Help dialog advertises them | c6102c1 physical key |
| D5 | UX | New Document dialog | Portrait / Landscape buttons do not update the Width / Height fields shown; the created document is swapped but the preview is not. Width "0" is silently coerced to 1. | Probe | a8b2d35 fields swap; zero refused; unit menu |
| D6 | UX | Help dialog | Titled "Shortcuts and browser limits"; only lists keys and limitations. There is no how-to content, no description of tools or panels, no search. | Probe: 30 shortcut rows, 10 limitation paragraphs | 6dcb072 searchable manual + /help/ page |
| D7 | polish | Doc-bar buttons | Open, Save, Export, Plugins, ? have no tooltip; Save gives no feedback when it falls back to a download. | Probe | 5d14caf tooltips; final pass: Save reports where the file went |
| D8 | polish | Document rename | Double-click a tab opens `window.prompt`. Nothing indicates that double-click renames. | Reading | 5d14caf inline rename with a tooltip |
| D9 | UX | Banners | Banners never auto-dismiss; a stale "Select at least two objects to align" remained while editing Transform fields. | Probe | a8b2d35 fade after 6 s |

## 8. Layout, navigation, discoverability

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| N1 | bug | `styles.css` narrow media query | On every screen under 1024 px (iPad portrait, all phones), tapping a pane tab highlights it but the pane body renders at 0 px height. `.pane[data-open=true] { flex: 1 1 0 }` inside an auto-height sheet collapses. The whole inspector is unusable on tablets and phones. | Probe: inspector 40 px after tap; screenshot | c6102c1 |
| N2 | bug | `styles.css` `.doc-bar` | At 390 px the doc-actions buttons do not wrap, the grid column grows past the viewport and the page scrolls horizontally. Canvas reports 503 px wide in a 390 px viewport. | Probe: bodyOverflow true | c6102c1 |
| N3 | UX | Narrow layout | Nothing tells a touch user that the panes are a sheet; the Constrain / From center / Duplicate chips float over the drawing with no explanation. | Screenshot | 5d14caf sheet title and close; chips caption |
| N4 | UX | Empty canvas | No onboarding or empty-state hint. A first-time user sees a blank page and 19 unlabeled icons. | Screenshot | 6dcb072 empty-canvas hint linking to Help |
| N5 | UX | Shortcut-only features | Paste in place, Smart duplicate, Connect endpoints, Compound, nudge are reachable from the keyboard or context menu only, with no visible menu. | Reading | 6dcb072 listed in Help > Shortcuts; context menu; no menu bar yet |
| N6 | polish | Desktop toolbar | Toolbar is 56 px wide and scrolls vertically at 1280 x 800 (78 to 92 px overflow): the color wells are below the fold. | Probe: toolbarOverflow 78-92 | open |

## 9. Accessibility and feedback

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| X1 | polish | Doc bar | No `title` on Open / Save / Export / Plugins; `?` is labelled "Shortcuts and limits". | Probe | 5d14caf |
| X2 | polish | Labels and hints | Field labels and hints are 10-11 px muted grey (#6b7684 on #f7f8fa, about 4.5:1). Borderline at that size. | Probe | open |
| X3 | polish | Landmarks | No `main` landmark; canvas is not focusable so keyboard users cannot reach the drawing surface. | Probe | open |
| X4 | polish | Keyboard | Enter on a focused toolbar button also runs `commitPen`; letter keys switch tools while a button is focused (acceptable, but undocumented). | Probe | open |

## 10. Tests and pipeline

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| Q1 | bug | `e2e/layout.spec.ts` | Layout tests only assert that boxes exist and sit in the right region; they never open a pane, which is why N1 shipped. | Reading | c6102c1 layout spec opens a pane |
| Q2 | missing | e2e | No browser test for: Layers pane actions, Appearance controls, custom libraries, Export of raster formats, dialog Escape, undo after alt-drag, locked layer drawing, autosave across tabs, tooltips beyond the Pen. | Reading | 20e2381 per-tool, per-pane, PNG/PDF, plus tests landed with each fix |
| Q3 | polish | `qa/check-coverage.ts` | Coverage is a substring match of feature IDs against test source, so a feature counts as covered if its ID appears anywhere, even in a comment. | Reading | open |
| Q4 | polish | CI | Healthy: 6/6 green, test job about 1m40s, live job about 1m05s. Build warns about an 811 kB main chunk and a 2.2 MB symbols chunk. | `gh run view` | open (healthy) |

## Missing key features (candidates, highest value first)

1. In-app user manual: a searchable Help with getting-started, every tool, every panel, measuring and scale, files and export, shortcuts, and browser limits, plus the same content as a page on the site.
2. Rich tooltips on every toolbar tool (name, shortcut, one-line hint) that also work on touch (long-press), and tooltips on doc-bar buttons.
3. Persist everything: all open tabs, custom libraries, and plugins across reloads.
4. Confirm before closing a document that has content.
5. Empty-canvas hint for first-time users with a link to Help.
6. Shortcuts for the four shape tools that lack them; shortcut hints in tooltips.
7. Line tool readout as length and angle; scale readout that echoes the typed statement; label unit follows the scale.
8. Place library symbols at the view center with an offset for repeats.
9. Inline rename for tabs, objects, and libraries instead of `window.prompt`.
10. One place for snap settings; one place for saved styles; one place for arrange / order actions.
11. Validation feedback on every numeric field (banner or inline) instead of silent clamping.
12. Working inspector on tablets and phones (N1) and a phone layout without horizontal scroll (N2).

## Method

Probes were run from `/tmp` and are not part of the repository. They drove the live site through Playwright: selected each tool by click and by key, drew with it, read `window.__measured.editor` state, exercised each panel control with valid and invalid input, opened each dialog, imported SVG / PNG / PDF / text, reloaded to test autosave, and measured layout at seven viewports in Chromium and WebKit.
