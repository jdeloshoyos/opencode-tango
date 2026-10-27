# Architecture — Tango (Web Port)

## 1. File layout

```
opencode-tango/
├── index.html          # Minimal shell; links style.css and scripts.js
├── scripts.js          # All game logic (generator, solver, gameplay, UI)
├── style.css           # Base stylesheet + Tango extensions
├── assets/
│   ├── sun.svg         # Used for SUN
│   └── moon.svg        # Used for MOON
├── base_app/           # Reference Python app (unchanged)
├── base_stylesheet/    # Reference stylesheet/app (unchanged)
└── specs/              # This specification
```

Constraints:

- No backend, no build step, no bundler, no npm dependencies.
- Running = opening `index.html` (or serving the folder statically).
- All game logic lives in `scripts.js`; `index.html` is static structure only.
- The three web files live at the **project root** so `assets/…` resolves with a
  simple relative path.

## 2. `index.html` skeleton

Minimal, semantic, no inline logic:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tango</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="game">
    <div class="topbar">
      <h1 class="title">Tango</h1>
      <div class="topbar__actions">
        <button id="reset-game" class="btn btn--ghost" type="button">Reset</button>
        <button id="new-game" class="btn btn--primary" type="button">New game</button>
      </div>
    </div>

    <div class="status">
      <span class="status__group">
        <span class="status__item">
          <span class="status__label">Remaining</span>
          <span id="remaining" class="status__value">--</span>
        </span>
        <span class="status__item">
          <span class="status__label">Time</span>
          <span id="timer" class="status__value">00:00</span>
        </span>
      </span>
      <span id="status-message" class="status__label" aria-live="polite"></span>
    </div>

    <div class="board-wrap">
      <div id="board" class="board" role="grid"
           aria-label="Tango puzzle board"></div>
    </div>
  </main>

  <div id="win" class="overlay" hidden>
    <div class="dialog dialog--result" role="dialog" aria-modal="true"
         aria-labelledby="win-title">
      <h2 id="win-title" class="dialog__title is-won">You solved it!</h2>
      <p id="win-summary" class="dialog__subtitle"></p>
      <p id="win-best" class="dialog__subtitle" hidden></p>
      <button id="play-again" class="btn btn--primary" type="button">New game</button>
    </div>
  </div>

  <script src="scripts.js"></script>
</body>
</html>
```

## 3. `scripts.js` organization

A single file, `"use strict"`, wrapped in an IIFE to avoid globals:

```
(function () {
  // 1. Constants & config
  // 2. Utilities (shuffle, key, element refs)
  // 3. Generator & solver (port of tango_generator.py)
  // 4. Game state & rules (port of tango_game.py)
  // 5. Rendering (board/cells/badges)
  // 6. Timer & status
  // 7. Input wiring + bootstrap
})();
```

### 3.1 Constants & config

```js
const N = 6;
const SUN = 1, MOON = 0, EMPTY = null;

const MAX_ATTEMPTS = 300; // source uses 120; raised for web robustness
const MIN_EDGES = 2;

const CELL_MIN = 40;
const CELL_MAX = 72;
const EDGE_GAP = 4; // must match the CSS `--edge-gap` token

const RESULT_DELAY_MS = 600; // pause before showing win overlay

const BEST_TIME_KEY = "tango.stats"; // { "bestTimeSeconds": <integer> }
```

> `EDGE_GAP` is used only for cell-size arithmetic in `updateCellSize()`; the
> visual gap itself comes from the CSS `--edge-gap` token. Keep the two values in
> sync.

### 3.2 Utilities

- `shuffle(array)` — in-place Fisher–Yates (replaces `random.shuffle`).
- `key(r, c)` — `"r,c"`.
- `parseKey(k)` — `[r, c]` (if needed).
- Cached DOM references: `boardEl`, `remainingEl`, `timerEl`, `statusMsgEl`,
  `newGameBtn`, `resetGameBtn`, `winEl`, `winSummaryEl`, `winBestEl`,
  `playAgainBtn`.

## 4. Python → JavaScript mapping

| Python (`base_app/`) | JavaScript (`scripts.js`) |
|----------------------|---------------------------|
| `N`, `SUN`, `MOON`, `EMPTY` | constants |
| `_filas_validas()` / `FILAS_VALIDAS` | `buildValidRows()` / `VALID_ROWS` |
| `_sin_tres_contiguos(seq)` | `noThreeInARow(seq)` |
| `generar_solucion()` | `generateSolution()` |
| `derivar_pistas(solution)` | `deriveClues(solution)` |
| `contar_soluciones(...)` | `countSolutions(cells, hClues, vClues, limit)` |
| `reducir_pistas(...)` | `reduceClues(cells, hClues, vClues, minEdges)` |
| `resolver_logicamente(...)` | `solveLogically(cells, hClues, vClues)` |
| `generar_puzzle(...)` | `generatePuzzle(maxAttempts, minEdges)` |
| `TangoWindow.nuevo_puzzle()` | `newPuzzle()` |
| `TangoWindow.reiniciar_puzzle()` | `resetPuzzle()` |
| `_marcar_linea_invalida(...)` | `markInvalidLine(values, positions, out)` |
| `TangoWindow.calcular_invalidas()` | `computeInvalidCells()` |
| `TangoWindow.revisar_victoria()` | `checkWin()` |
| `TangoWindow.on_mouse_press` | `onCellPrimary(r, c)` / `onCellContext(r, c)` |
| `TangoWindow.on_key_press` | `onKeyDown(event)` |
| `TangoWindow.on_draw` | `render()` |
| `imprimir_grilla` / `imprimir_puzzle` | not ported (debug only) |

## 5. Data structures

- `solution: number[][]` — 6×6, values `SUN`/`MOON`.
- `fixedCells: Map<string, number>` — key `"r,c"`.
- `hClues: Map<string, '='|'X'>` — key `"r,c"` = edge between `(r,c)`/`(r,c+1)`.
- `vClues: Map<string, '='|'X'>` — key `"r,c"` = edge between `(r,c)`/`(r+1,c)`.
- `grid: (number|null)[][]` — 6×6 player state.
- `won: boolean`.
- Timer state: `timerId`, `startTime`, `elapsedSeconds`, `timerRunning`.
- Best time (persisted): `localStorage["tango.stats"]` =
  `{ "bestTimeSeconds": <integer> }` — see §8.1.

`Map` is chosen for clues to mirror the Python sparse dicts and to allow
`has`/`get`/`delete`/`set` during reduction. Grids remain 2-D arrays for fast
indexing and simple rendering.

### 5.1 `VALID_ROWS` computation

```js
function noThreeInARow(seq) {
  let runVal = null, runLen = 0;
  for (const v of seq) {
    if (v === EMPTY) { runVal = null; runLen = 0; continue; }
    if (v === runVal) {
      runLen++;
      if (runLen >= 3) return false;
    } else {
      runVal = v; runLen = 1;
    }
  }
  return true;
}

function buildValidRows() {
  // Enumerate all C(6,3) placements of SUN; MOON elsewhere; keep no-triples.
  // Equivalent to itertools.combinations(range(N), 3). Result: 14 rows.
}
```

## 6. Rendering model

### 6.1 DOM construction (`buildBoard()`)

- Clear `#board`.
- Set `boardEl.style.gridTemplateColumns/Rows` to
  `repeat(6, var(--cell-size))`.
- Create a 6×6 array of cell elements; each cell:
  - `class="cell"`, `role="gridcell"`, `dataset.r`, `dataset.c`.
  - Cached in `cellEls[r][c]`.
- Bind event delegation once on `#board` (`click`, `contextmenu`) rather than
  per-cell listeners.

### 6.2 `render()`

For each cell `(r,c)`:

1. Reset `className` to `"cell"` (preserve any structural classes).
2. Clear children (symbol + badges).
3. If `fixedCells.has(key)` → add `fixed`.
4. Append the symbol `<img>` if `grid[r][c] !== EMPTY`.
5. Append edge badges for clues anchored at this cell (see below).
6. If `computeInvalidCells()` contains `key(r,c)` → add `invalid`.
7. Update `aria-label`.

Also update `#remaining` (count of `EMPTY`).

> `computeInvalidCells()` is computed once per render and reused.

### 6.3 Edge badges

For each `(key, type)` in `hClues`, parse `(r,c)`; the badge belongs to cell
`(r,c)` with class `edge-hint edge-hint--right`, text `type`.
For each `(key, type)` in `vClues`, badge on `(r,c)` with
`edge-hint edge-hint--bottom`.

Cells must have `position: relative`; badges are `position: absolute` and
`pointer-events: none`.

### 6.4 Cell size

`updateCellSize()` (see `ui-and-styling.md` §8) sets `--cell-size`/`--cell-font`
on `#board`; called on load and `resize`. Since grid tracks are
`repeat(6, var(--cell-size))`, no rebuild is needed on resize.

## 7. Event wiring

- `#board` `click` → resolve cell from `event.target.closest('.cell')`; call
  `onCellPrimary(r, c)`.
- `#board` `contextmenu` → `event.preventDefault()`; resolve cell; call
  `onCellContext(r, c)`.
- `#new-game` click → `newPuzzle()`.
- `#reset-game` click → `resetPuzzle()`.
- `#play-again` click → `newPuzzle()` (also hides overlay).
- `window` `keydown` → `onKeyDown`:
  - `n`/`N` → `newPuzzle()`
  - `r`/`R` → `resetPuzzle()`
  - Ignore when focus is in an input/button where appropriate (buttons: allow
    default behavior; the game has no text inputs).
- `window` `resize` → `updateCellSize()`.

### 7.1 Primary interaction

```
onCellPrimary(r, c):
  if (won || generating) return
  if (fixedCells.has(key(r,c))) return
  const v = grid[r][c]
  grid[r][c] = (v === EMPTY) ? SUN : (v === SUN ? MOON : EMPTY)
  afterMove()

onCellContext(r, c):
  if (won || generating) return
  if (fixedCells.has(key(r,c))) return
  grid[r][c] = EMPTY
  afterMove()

afterMove():
  render()
  checkWin()
```

`checkWin()` sets `won`, stops the timer, and schedules/updates the overlay.

## 8. Timer

```
startTimer(): if running return; running = true; startTime = Date.now();
  interval every 200ms → elapsed = floor((now - startTime)/1000); update label
stopTimer():  clear interval; running = false
resetTimer(): stopTimer(); elapsed = 0; update label
formatTime(s): MM:SS with zero-padding (minutes may exceed 59)
```

Timer starts as soon as a puzzle is displayed (after `newPuzzle`/`resetPuzzle`
render the valid board), as specified in `functional.md` §8.7. `resetTimer()` is
called before `startTimer()` so each new/reset game begins at `00:00`.

### 8.1 Best-time persistence

- Storage: `localStorage["tango.stats"]` = `{ "bestTimeSeconds": <integer> }`.
- `loadBestTime()` — parse the key; return the numeric seconds, or `null` if
  absent, invalid, or storage is unavailable.
- `saveBestTime(seconds)` — write the JSON; return `true`/`false` for
  success/failure (never throws).
- `setBestLine(text, isNewBest)` — set `#win-best` text, toggle `.is-new-best`,
  and toggle `hidden`; passing `null` hides the line.
- `showWin()` flow:
  - `best = loadBestTime()`.
  - `best === null` → persist `elapsedSeconds`; if the write succeeds show
    "New best time!" (green), otherwise omit the line (storage unavailable).
  - `elapsedSeconds < best` → persist and show "New best time!" (green).
  - Otherwise → show "Current best time: MM:SS" (normal style); no write.

## 9. Generation flow (async yield)

Because generation is synchronous and can take noticeable time, `newPuzzle()` is
`async`:

```
async function newPuzzle():
  if (generating) return
  generating = true
  setStatus("Generating…")
  setButtonsDisabled(true)
  await nextPaint()             // rAF + setTimeout(0) so the message paints
  try:
     const result = generatePuzzle()
     applyPuzzle(result)            // stores clues, rebuilds grid, renders
     resetTimer(); hideOverlay(); setStatus("")
     startTimer()                   // clock runs as soon as the board is visible
  catch (err):
     setStatus("Could not generate a puzzle. Try again.")
  finally:
     generating = false
     setButtonsDisabled(false)
```

`applyPuzzle(result)` stores clues, rebuilds `grid` from `fixedCells`, resets
`won`, and calls `render()`.

If the previous puzzle exists and generation fails, leave it intact and re-enable
controls.

## 10. State machine

```
IDLE ──newPuzzle()──> GENERATING ──success──> PLAYING
  ▲                                          │  │
  │                                          │  └─checkWin() (complete+valid)──> WON
  │                                          │
  └──────────────newPuzzle()─────────────────┘
                     resetPuzzle() ──> PLAYING (same clues)
                     WON ──newPuzzle()──> GENERATING
```

- `IDLE` — before first puzzle (brief; app generates on load).
- `GENERATING` — synchronous generation in progress; input ignored; buttons
  disabled.
- `PLAYING` — input accepted; timer runs from the moment the board is displayed.
- `WON` — board locked; overlay shown; only New game works.

## 11. Error handling & edge cases

- **Generation failure:** catch the `MAX_ATTEMPTS` error, show a status message,
  keep the current puzzle usable.
- **Rapid input during generation:** guarded by `generating` flag and disabled
  buttons.
- **Fixed-cell input:** ignored early; never mutate `fixedCells`.
- **Win lock:** all primary/context handlers return early when `won`.
- **Resize:** only updates CSS variables; no state change.
- **Missing assets:** if an SVG fails to load, the cell still shows the
  background and `alt` text; the game logic is unaffected.
- **No global leakage:** IIFE encapsulation; optional `window.tango` debug hook
  may be exposed only if needed for testing.

## 12. Acceptance criteria (architecture)

- **AC-A1** Exactly three web files at the project root (`index.html`,
  `scripts.js`, `style.css`) plus existing `assets/`; no backend or build step.
- **AC-A2** Opening `index.html` in a modern browser starts a playable game.
- **AC-A3** All game logic (generation, solver, validation, UI updates) is in
  `scripts.js`; `index.html` contains no game logic.
- **AC-A4** The generator/solver functions map one-to-one to the reference
  pipeline and preserve the documented quirks.
- **AC-A5** Clue maps use `"r,c"` keys and 2-D arrays are used for grids.
- **AC-A6** Generation is wrapped so a "Generating…" message can paint and the
  UI cannot be driven into an inconsistent state.
- **AC-A7** The app runs with `file://` or a static server (relative asset
  paths resolve).
