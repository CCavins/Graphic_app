# Measured: UX, functionality, and test review

Reviewed on 2026-10-18 against commit `19e1b4e` (live at https://ccavins.github.io/Graphic_app/) and the same commit run locally.
Every tool, options-bar control, inspector control, dialog, menu, and file path was exercised with a scripted browser
probe (Chromium and WebKit, 1440 x 900 down to 390 x 844) plus a read of `src/editor/editor.ts` and the panel components.

Baseline: `npm test` 137 unit tests green, `npx playwright test` 18 e2e green locally and against the live site, CI 6/6 green at about 3 minutes per run.

Severity key: **bug** (wrong or broken behavior, or lost work), **UX** (works but confusing or hard to find), **missing** (expected capability absent), **polish** (small).

## Status

| Status | Count |
| --- | --- |
| Open at review time | 46 |
| Fixed in this pass | see "Closed" column below, updated as fixes land |

## 1. Left toolbar and tools

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| T1 | missing | `App.tsx` toolbar `.tip` | Hover tooltip shows only the tool name ("Rect", "Round", "Path"). No shortcut key, no one-line description, and nothing at all on touch devices where hover does not exist. | Probe: every tip text equals the aria-label | |
| T2 | missing | `editor.key()` | Arc, Rounded rectangle, Polygon, and Star have no keyboard shortcut. All other tools do. | Probe: "NO SHORTCUT" for 4 tools | |
| T3 | UX | `OptionsBar.tsx` `TOOL_NAMES` | Names are terse or ambiguous for new users: "Move" (selection), "Path" (point editing), "Round" (rounded rectangle), "Rect". | Reading | |
| T4 | bug | `editor.setTool()` | Switching tools or pressing Escape while the Pen has unfinished points silently discards them. Three clicks then clicking another tool loses the path with no banner and no undo entry. | Probe: pen 3 pts -> switch tool -> nodes 0 | |
| T5 | UX | `editor.pointerMove` create readout | Line tool readout shows "W x H" of the bounding box, not the line length and angle, which is what a measuring app user expects. | Probe: line readout "1.11 in x 0.69 in" | |
| T6 | UX | `pointerDown` gradient / scissors / add anchor | Clicking on empty canvas with Gradient, Scissors, or Add anchor does nothing and shows no hint about what to click. | Probe: banner null for all three | |
| T7 | bug | `pointerDown` alt-drag + `pointerUp` snapshotAfter | Alt-drag duplicate records two history entries (duplicate, then move). One Undo leaves the duplicate sitting on top of the original so Undo appears to do nothing. | Probe: alt-dup nodes 2, undo nodes 2 | |
| T8 | bug | `pointerUp` -> `addNode()` | Drawing on a locked layer throws an uncaught exception from the pointer handler. The shape is not added, no banner appears, and a dead snapshot is pushed to history. | Probe: banner null, pageerror | |
| T9 | UX | `editor.Tool` type, `TOOL_NAMES` | `convert`, `scale`, `rotate`, `slant`, `pattern`, `image` exist in the `Tool` type and `TOOL_NAMES` but no code handles them and they are not in the toolbar. Dead surface area. | Grep | |
| T10 | polish | `App.tsx` `.tool-name` | 10 px tool name above the toolbar duplicates the bold active-tool label in the options bar. | Screenshot | |
| T11 | UX | Zoom tool | Zoom tool only click-zooms; there is no drag-to-zoom marquee and no hint that Alt zooms out. | Reading + probe | |
| T12 | polish | Text tool | A click with the Text tool creates point text; a drag creates area text. Neither is documented anywhere. | Probe | |

## 2. Options bar

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| O1 | bug | `OptionsBar.tsx` Snap select vs `Properties.tsx` Grid "Snap to grid" | Two controls drive overlapping state. Checking Grid > "Snap to grid" turns snapping on (uses grid spacing) but the options-bar Snap select still says "Off". | Probe: grid.snap true, select "off" | |
| O2 | UX | `Field` + `editor.setNumber` | Invalid typed sizes show a banner but also throw an uncaught error (`guard()` rethrows) and the field keeps the bad draft text until blur. | Probe: pageerror "Cannot parse length abc" | |
| O3 | UX | Radius, Sides, Points, Inner %, Diameter, Eraser, Size fields | Invalid or out-of-range input is silently clamped ("abc" -> 0, "2" sides -> 3, "200" inner -> 95). No feedback. | Probe | |
| O4 | UX | Rotation field with multiple selection | Field is enabled and shows the first object's angle; typing rotates each object individually about its own center, which is not obvious. | Probe: 2 selected, rotation enabled | |
| O5 | UX | Zoom select | A `<select>` whose first option is the current percentage. Cannot type a zoom level; the "100%" option label collides with the current value when zoom is 100%. | Screenshot | |
| O6 | UX | Narrow screens | Snap and Zoom controls sit at the far right of a horizontally scrolling bar and are off-screen on phones with no affordance that the bar scrolls. | Probe 390 px: optionsOverflow 277 | |

## 3. Inspector: Properties

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| P1 | UX | `ScaleRow` readout | Scale readout says "1 pt = 0.6667 in", which is meaningless to a user who typed "1/4 in = 1 ft". Should echo the statement. | Probe | |
| P2 | UX | `ScaleRow` + label unit | Setting a scale in feet leaves the label unit at inches, so a 40 ft wall reads "480 in". | Probe: W "480 in" | |
| P3 | UX | Align section | Align/Distribute buttons are always enabled; with 0 or 1 objects selected they only show a banner. Aligning one object to the canvas is not supported. | Probe | |
| P4 | UX | Transform > Move X / Y | Typing "1 in" is accepted but immediately redisplays as "72" (points), with no unit. | Probe | |
| P5 | UX | Canvas > Add (resize) | Side buttons are lowercase "left right top bottom" with an "Add" field; the relationship is unclear and "Artwork x2 / x1/2" sits in the same row doing something unrelated. | Screenshot | |
| P6 | polish | Canvas Units select | Changing base unit changes the ruler and canvas fields but not the measurement label unit; two different "units" settings live in the same pane. | Probe | |
| P7 | polish | Grid section | Grid has its own snap checkbox, "Snap to points", spacing in points with no unit, and margins. Overlaps with options-bar Snap. | Reading | |

## 4. Inspector: Appearance

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| A1 | UX | Stroke Width field | "abc" and "-4" are silently ignored (width stays). No feedback. | Probe | |
| A2 | UX | Stroke Custom dash | Non-numeric tokens are silently dropped ("4 2 a" -> [4, 2]). | Probe | |
| A3 | polish | Stroke Arrows on closed shapes | Arrowheads can be set on a closed rectangle where they are meaningless. | Probe | |
| A4 | UX | Fill Type "Image" | Selecting Image with no imported image shows a banner but leaves the select on the previous value with no path to import from here. | Probe | |
| A5 | UX | Styles section vs Libraries > Saved styles | Saved styles are listed and deletable in two different panes. | Reading | |
| A6 | polish | "Save selection as pattern" | Lives in the Fill section with a free-text name field; discoverability is low and the result only appears after choosing Type = Pattern. | Reading | |

## 5. Inspector: Layers

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| L1 | UX | Arrange > Mask | Mask with fewer than two objects is a silent no-op (other actions show a banner). | Probe: banner null | |
| L2 | UX | Object rename | Double-click on an object row opens `window.prompt`; layer rename is inline. Inconsistent, and `prompt` is blocked in some embedded browsers. | Reading | |
| L3 | UX | Arrange / Combine / Path action list | Group, Ungroup, and z-order also appear in Properties > Align and in the context menu. Three places for the same actions. | Reading | |
| L4 | polish | Layer lock / visibility | Lock state uses emoji glyphs that render differently per platform; no tooltip on hover. | Screenshot | |

## 6. Inspector: Libraries

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| B1 | bug | `editor.serialize()` / autosave | Custom libraries and saved plugins are not persisted. Reload loses them. | Probe: libs 1 -> 0, plugins 1 -> 0 | |
| B2 | UX | `placeSymbol()` default position | Clicking a symbol places it at paper (48, 48) regardless of the current view. Repeated clicks stack on the exact same spot. | Probe: 48,48 twice | |
| B3 | UX | Search with no results | Empty list with no "No shapes match" message. | Probe | |
| B4 | polish | Custom library creation | Uses `window.prompt` for the name. | Reading | |

## 7. Dialogs, menus, files

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| D1 | bug | `Dialog` in `dialogs.tsx` | Escape does not close a dialog once any control inside it has focus: `<dialog onKeyDown={stopPropagation}>` stops the event before the window listener. Recolor, Export, Plugins all affected. | Probe: scrim intercepts after Escape | |
| D2 | bug | autosave / `serialize()` | Only the active tab is autosaved. With two documents open, reloading restores whichever tab was active and silently drops the other, including all its drawing. | Probe: tabs 2 -> 1, doc 1 nodes 4 -> 0 | |
| D3 | bug | `closeDocument()`, tab close "x", Alt-W | Closing a document (or the last tab) discards its content with no confirmation and no way back. | Probe | |
| D4 | bug | `editor.key()` Alt-N / Alt-W | On macOS, Option+N and Option+W produce dead/special characters (`event.key` is not "n"/"w"), so the advertised shortcuts do not fire on real Mac keyboards. Should match on `event.code`. | Reading; Help dialog advertises them | |
| D5 | UX | New Document dialog | Portrait / Landscape buttons do not update the Width / Height fields shown; the created document is swapped but the preview is not. Width "0" is silently coerced to 1. | Probe | |
| D6 | UX | Help dialog | Titled "Shortcuts and browser limits"; only lists keys and limitations. There is no how-to content, no description of tools or panels, no search. | Probe: 30 shortcut rows, 10 limitation paragraphs | |
| D7 | polish | Doc-bar buttons | Open, Save, Export, Plugins, ? have no tooltip; Save gives no feedback when it falls back to a download. | Probe | |
| D8 | polish | Document rename | Double-click a tab opens `window.prompt`. Nothing indicates that double-click renames. | Reading | |
| D9 | UX | Banners | Banners never auto-dismiss; a stale "Select at least two objects to align" remained while editing Transform fields. | Probe | |

## 8. Layout, navigation, discoverability

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| N1 | bug | `styles.css` narrow media query | On every screen under 1024 px (iPad portrait, all phones), tapping a pane tab highlights it but the pane body renders at 0 px height. `.pane[data-open=true] { flex: 1 1 0 }` inside an auto-height sheet collapses. The whole inspector is unusable on tablets and phones. | Probe: inspector 40 px after tap; screenshot | |
| N2 | bug | `styles.css` `.doc-bar` | At 390 px the doc-actions buttons do not wrap, the grid column grows past the viewport and the page scrolls horizontally. Canvas reports 503 px wide in a 390 px viewport. | Probe: bodyOverflow true | |
| N3 | UX | Narrow layout | Nothing tells a touch user that the panes are a sheet; the Constrain / From center / Duplicate chips float over the drawing with no explanation. | Screenshot | |
| N4 | UX | Empty canvas | No onboarding or empty-state hint. A first-time user sees a blank page and 19 unlabeled icons. | Screenshot | |
| N5 | UX | Shortcut-only features | Paste in place, Smart duplicate, Connect endpoints, Compound, nudge are reachable from the keyboard or context menu only, with no visible menu. | Reading | |
| N6 | polish | Desktop toolbar | Toolbar is 56 px wide and scrolls vertically at 1280 x 800 (78 to 92 px overflow): the color wells are below the fold. | Probe: toolbarOverflow 78-92 | |

## 9. Accessibility and feedback

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| X1 | polish | Doc bar | No `title` on Open / Save / Export / Plugins; `?` is labelled "Shortcuts and limits". | Probe | |
| X2 | polish | Labels and hints | Field labels and hints are 10-11 px muted grey (#6b7684 on #f7f8fa, about 4.5:1). Borderline at that size. | Probe | |
| X3 | polish | Landmarks | No `main` landmark; canvas is not focusable so keyboard users cannot reach the drawing surface. | Probe | |
| X4 | polish | Keyboard | Enter on a focused toolbar button also runs `commitPen`; letter keys switch tools while a button is focused (acceptable, but undocumented). | Probe | |

## 10. Tests and pipeline

| ID | Severity | Where | Finding | Evidence | Closed |
| --- | --- | --- | --- | --- | --- |
| Q1 | bug | `e2e/layout.spec.ts` | Layout tests only assert that boxes exist and sit in the right region; they never open a pane, which is why N1 shipped. | Reading | |
| Q2 | missing | e2e | No browser test for: Layers pane actions, Appearance controls, custom libraries, Export of raster formats, dialog Escape, undo after alt-drag, locked layer drawing, autosave across tabs, tooltips beyond the Pen. | Reading | |
| Q3 | polish | `qa/check-coverage.ts` | Coverage is a substring match of feature IDs against test source, so a feature counts as covered if its ID appears anywhere, even in a comment. | Reading | |
| Q4 | polish | CI | Healthy: 6/6 green, test job about 1m40s, live job about 1m05s. Build warns about an 811 kB main chunk and a 2.2 MB symbols chunk. | `gh run view` | |

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
