# Measured: fix plan

Ordered plan for closing the findings in `REVIEW.md`. Each step is one small commit to `main`. CI deploys every push to
GitHub Pages and then re-runs the browser suite against the published commit, so every step gets the same gate:

1. `npm test` (unit + feature coverage) and `npx playwright test` locally.
2. Commit and push to `main`.
3. Wait for the `CI` run: `test` -> `deploy` -> `live`.
4. Confirm `https://ccavins.github.io/Graphic_app/version.json` reports the new SHA.
5. Open the live site and check the changed area by hand (desktop, then a narrow viewport).

Every bug fix adds a regression test (unit in `src/coverage.test.ts` or browser in `e2e/`) and a row in `qa/features.ts`
so `qa/check-coverage.ts` keeps it covered.

## Step 1: bugs that break a surface or lose work

| Finding | Fix | Test |
| --- | --- | --- |
| N1 inspector collapses on narrow screens | In the narrow media query give `.pane[data-open=true]` an auto flex basis and `.panes` a real `max-height` with `overflow: auto`. | `e2e/layout.spec.ts`: after tapping a tab the pane body is taller than 100 px and `section-canvas` is visible. |
| N2 phone horizontal overflow | Let `.doc-actions` wrap or collapse to icon buttons under 480 px; `min-width: 0` on grid children. | layout spec: `document.documentElement.scrollWidth <= innerWidth` at 390 px. |
| D1 Escape in dialogs | Handle Escape inside the `<dialog>` keydown handler (call `onClose`) instead of relying on the window listener. | e2e: open Recolor, drag a slider, press Escape, dialog is gone and the color is restored. |
| D2 / B1 only active tab autosaved; libraries and plugins lost | Add a `serializeWorkspace()` that stores all docs, the active index, custom libraries, and plugins; autosave that; load it on start (fall back to the old single-document shape). | unit: `workspace-roundtrip`; e2e: two tabs + library + plugin survive reload. |
| D3 close without confirm | `closeDocument()` callers confirm when the document has any node. Alt-W and the tab "x" both route through the same guard. | unit: `close-confirm` (editor exposes `documentHasContent()`); e2e: close shows confirm. |
| T8 drawing on a locked layer | `pointerUp` wraps `addNode` in `guard` so the banner shows and no dead snapshot is pushed. | unit: `locked-layer-draw`. |
| T7 alt-drag undo granularity | Duplicate without snapshot, then record a single snapshot at pointer up that covers both the copy and the move. | unit: `alt-dup-undo` (one undo removes the copy). |
| T4 pen points lost on tool switch / Escape | Commit the pending pen path (if 2+ points) when switching tools; Escape with points shows "Pen path discarded" and keeps a history entry via snapshot before clearing. | unit: `pen-switch-commits`. |
| O1 two snap controls | Options-bar Snap select becomes the single source: it reads `grid.snap` + `snapWorldInches` and shows "Grid" when snapping to grid spacing; the Grid checkbox stays but both re-render from the same state. | unit: `snap-single-state`. |
| D4 Alt shortcuts on macOS | Match `event.code` (`KeyN`, `KeyW`) for the Alt shortcuts. | unit: `alt-shortcut-code`. |

## Step 2: toolbar tooltips and tool discoverability

- Add `src/app/toolInfo.ts`: one table per tool with `name`, `shortcut`, `hint` (one line), and `how` (short paragraph) shared by the toolbar, the Help manual, and the docs page.
- Toolbar `.tip` renders name + shortcut badge + hint. On touch, a long-press (500 ms) shows the same tip for 2 s; `title` is set as a fallback.
- Shortcuts: `D` rounded rectangle, `Y` polygon, `S` star, `U` arc (unused letters that do not collide with existing ones or browser-reserved combos). Add to `SHORTCUTS`.
- Rename to full names: Selection, Direct select, Rounded rectangle, Rectangle. Options-bar active-tool label uses the same table.
- Remove dead `Tool` variants and their `TOOL_NAMES` rows.
- Doc-bar buttons get `title` text. The `?` button becomes "Help".
- Tests: e2e tooltip test checks name, shortcut, and hint for two tools; unit test asserts every toolbar tool has a `toolInfo` entry and a unique shortcut.

## Step 3: in-app user manual and docs page

- `src/help/manual.ts`: structured content (sections -> topics with title, body, optional steps, related tool ids). Sections: Getting started, Tools, Panels, Measuring and scale, Files and export, Shortcuts, Browser limits.
- `HelpDialog` becomes a two-column manual: left a search box + section list, right the topic. Search filters topics by title and body. Shortcuts and limitations render from the same data as today.
- "Help" entry at the bottom of the canvas context menu; empty-canvas hint ("Pick a tool on the left, or press ? for help") shown until the first object exists.
- `docs/index.html` generated at build time by a small Vite plugin from `manual.ts` so the site has a readable `/Graphic_app/help/` page linked from the dialog.
- Tests: unit test asserts every tool has a manual topic and every `LIMITATIONS` key appears; e2e opens Help, searches "scale", clicks the result.

## Step 4: navigation and placement

- Saved styles: keep in Appearance, remove the duplicate list from Libraries.
- Arrange / order: keep the icon bar in Properties > Align and the context menu; the Layers "Arrange" action group keeps Mask / Compound (unique) and drops Group / Ungroup duplicates.
- Inline rename: tab (double-click -> inline input), object row, library name, replacing `window.prompt`.
- Narrow layout: the sheet gets a drag handle / close button and a label; chips get a one-line caption on first show.
- Library symbol placement at view center, offset 12 px per repeat; "No shapes match" empty state.
- Line tool readout shows length and angle; scale readout echoes the statement; setting a scale in feet switches label unit to ft-in when it is still the default.

## Step 5: settings UI validation

- `Field` gains an optional `validate(raw) => string | null`; on error it shows the message inline under the field and does not commit.
- Apply to: Radius, Sides, Points, Inner %, Diameter, Angle, Round %, Min %, Eraser, Size, Stroke width, Custom dash, Transform fields, New Document width / height.
- Transform Move X / Y display with units via `formatPoints`.
- `guard()` no longer rethrows into React handlers (keeps the banner, swallows the exception) so no uncaught errors reach the console.
- Banners auto-dismiss after 6 s unless hovered.
- Align / Distribute buttons disabled until enough objects are selected, with a tooltip saying how many.

## Step 6: test hardening

- e2e per tool: one spec that iterates the tool table, selects each by key, draws, asserts a node and undo.
- e2e per pane: Appearance (fill hex, stroke width, effect toggle), Layers (add, lock, draw blocked with banner), Libraries (custom library add + reload).
- e2e for Export PNG and PDF downloads, context menu Help entry, narrow sheet open, phone no-overflow.
- Keep `qa/features.ts` in sync; `qa/check-coverage.ts` must stay green.

## Step 7: final verification

- Full local suite, then confirm the last CI run (test, deploy, live) is green.
- Manual pass on the live site at 1440, 1024, 390: hover tooltips, open Help, search, open each pane on narrow, draw with each tool.
- Update `REVIEW.md` "Closed" column and status counts.
