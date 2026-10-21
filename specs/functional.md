# Functional Specification — Tango (Web Port)

## 1. Overview

**Tango** is a 6×6 logic puzzle inspired by LinkedIn's Tango. The reference
implementation lives in `base_app/` (Python):

- `tango_generator.py` — puzzle generation, a backtracking solver, and a
  logical-deduction solver.
- `tango_game.py` — a playable pyglet front-end with real-time rule validation.

This document specifies the **functional behavior** of a browser-only port. The
Python reference is the authoritative source: its behavior, algorithms, and
parameters must be reproduced faithfully. There is **no backend**; all logic
runs client-side in `scripts.js`.

> The reference code and comments are in Spanish; this spec uses English names
> (see the terminology table in §3). The English names are the canonical names
> for the JavaScript implementation.

## 2. Scope

**In scope**

- Full port of the puzzle generator and its dependent solver.
- The logical-deduction solver used to validate that puzzles are fair
  (solvable without guessing).
- Gameplay: placing/clearing symbols, locked given cells, real-time rule
  validation, win detection, reset, and new puzzle.
- Timer, progress readout, SVG-based sun/moon symbols, and a win overlay.

**Out of scope**

- Backend, accounts, persistence, or syncing.
- Difficulty levels — the board is always 6×6.
- Hints, "show solution", scoring, leaderboards, audio, or multiplayer.
- Localization.
- Debug/printing helpers from the reference (`imprimir_grilla`,
  `imprimir_puzzle`) — not required in the web port.

## 3. Terminology (Spanish source → English spec)

| Reference (Spanish)        | Spec / JS name            | Meaning |
|----------------------------|---------------------------|---------|
| `N`                        | `N`                       | Grid dimension (6). |
| `SUN`, `MOON`, `EMPTY`     | `SUN`, `MOON`, `EMPTY`    | Cell symbols: `1`, `0`, `null`. |
| `solucion`                 | `solution`                | Complete valid 6×6 grid. |
| `celdas` / `celdas_fijas`  | `cells` / `fixedCells`    | Given cell clues. |
| `bordes_h` / `bordes_v`    | `hClues` / `vClues`       | Edge clues (`=` / `X`). |
| `pistas`                   | `clues`                   | Cell + edge clues. |
| `generar_puzzle`           | `generatePuzzle`          | Full pipeline. |
| `generar_solucion`         | `generateSolution`        | Phase 1. |
| `derivar_pistas`           | `deriveClues`             | Phase 2. |
| `contar_soluciones`        | `countSolutions`          | Backtracking solver (uniqueness). |
| `reducir_pistas`           | `reduceClues`             | Phase 3. |
| `resolver_logicamente`     | `solveLogically`          | Phase 4 (pure deduction). |
| `calcular_invalidas`       | `computeInvalidCells`     | Real-time validation. |
| `revisar_victoria`         | `checkWin`                | Win detection. |
| `nuevo_puzzle`             | `newPuzzle`               | Generate a new puzzle. |
| `reiniciar_puzzle`         | `resetPuzzle`             | Restart current puzzle. |

## 4. Game rules

1. The board is a **6×6** grid. Each cell holds **SUN** or **MOON**.
2. **Balance:** every row and every column contains exactly **3 suns and 3
   moons**.
3. **No triples:** no three identical symbols appear consecutively in a row or
   column.
4. **Edge clues:** a clue may sit between two orthogonally adjacent cells:
   - `=` → the two cells must be **equal**.
   - `X` → the two cells must be **different**.
5. A generated puzzle has **exactly one solution** and is **deducible without
   guessing** (validated by the logical solver).

## 5. Data model

All coordinates are zero-based `(r, c)` with `r` = row (top to bottom),
`c` = column (left to right).

| Name         | Type                                   | Description |
|--------------|----------------------------------------|-------------|
| `solution`   | `number[][]` (6×6)                     | Full valid grid (`SUN`/`MOON`). |
| `fixedCells` | `Map<string, number>`                  | Given cell clues, key `"r,c"` → `SUN`/`MOON`. |
| `hClues`     | `Map<string, '=' \| 'X'>`              | Horizontal edge between `(r,c)` and `(r,c+1)`; `c ∈ 0..4`. |
| `vClues`     | `Map<string, '=' \| 'X'>`              | Vertical edge between `(r,c)` and `(r+1,c)`; `r ∈ 0..4`. |
| `grid`       | `(number \| null)[][]` (6×6)           | Player state; starts from `fixedCells`, rest `EMPTY`. |
| `won`        | `boolean`                              | True only when grid is complete and valid. |

Cells hold `SUN = 1`, `MOON = 0`, `EMPTY = null`.

**Key helper:** `key(r, c) => `${r},${c}`` is used for all clue maps.
`hClues` and `vClues` may be queried defensively (`map.get(key)`, treat missing
as no clue).

## 6. Constants and configuration

| Constant        | Value | Notes |
|-----------------|-------|-------|
| `N`             | `6`   | Grid size. |
| `SUN`           | `1`   | |
| `MOON`          | `0`   | |
| `EMPTY`         | `null`| |
| `MAX_ATTEMPTS`  | `300` | `max_intentos` in the reference is 120; see the note below. |
| `MIN_EDGES`     | `2`   | `min_bordes` in the reference. |
| `VALID_ROWS`    | computed | All `C(6,3)=20` rows with 3 suns/3 moons, filtered to remove triples → **14** valid rows. |

`VALID_ROWS` is computed once at startup (equivalent to module-level
`FILAS_VALIDAS` in Python).

> **Web-port robustness note:** the reference retries generation up to 120
> times. The deducibility check succeeds only ~5.75% of the time (expected ~17
> attempts, ~7.8 ms each), so 120 attempts still leaves a ~0.08% chance of
> failing. The port raises the cap to **300** (~2×10⁻⁸ failure chance) without
> changing the pipeline or the distribution of produced puzzles.

## 7. Generator pipeline

`generatePuzzle(maxAttempts = MAX_ATTEMPTS, minEdges = MIN_EDGES)` reproduces the
reference pipeline. It returns
`{ solution, cells, hClues, vClues, attempts }`.

### 7.1 Phase 1 — `generateSolution()`

Generate one random, fully valid 6×6 grid.

1. `VALID_ROWS`: precompute every 6-length sequence with exactly 3 suns and 3
   moons, then discard any containing 3 equal consecutive symbols. (14 remain.)
2. Backtrack row by row (`rowIdx = 0..5`):
   - Shuffle a copy of `VALID_ROWS` (Fisher–Yates).
   - Place each candidate row; after placement validate:
     - **Vertical triples:** if `rowIdx >= 2`, for each column `c`, reject if
       `grid[rowIdx-2][c] === grid[rowIdx-1][c] === grid[rowIdx][c]`.
     - **Partial column counts:** for each column, count suns and moons over rows
       `0..rowIdx`; reject if either exceeds 3.
   - Recurse; on success return `true`. On failure clear the row and continue.
3. Return the completed grid.

### 7.2 Phase 2 — `deriveClues(solution)`

- `cells`: every `(r,c)` → `solution[r][c]` (36 entries).
- `hClues`: for `r ∈ 0..5`, `c ∈ 0..4`:
  `'='` if `solution[r][c] === solution[r][c+1]`, else `'X'`.
- `vClues`: for `r ∈ 0..4`, `c ∈ 0..5`:
  `'='` if `solution[r][c] === solution[r+1][c]`, else `'X'`.

### 7.3 Solver — `countSolutions(cells, hClues, vClues, limit = 2)`

Backtracking solver that counts solutions up to `limit` (default 2). Used only to
test uniqueness; it stops as soon as `limit` is reached.

- Initialize a 6×6 `EMPTY` grid and place `cells`.
- Visit cells in row-major order `(0,0) … (5,5)`.
- Partial checks after placing/validating a cell at `(r,c)`:
  - `rowOK(r, c)`: the row prefix `grid[r][0..c]` has no triple and neither
    symbol count exceeds 3.
  - `colOK(c, r)`: same for the column prefix `grid[0..r][c]`.
  - `edgeOK(r, c)`:
    - If `c > 0`, check the horizontal clue `hClues[(r, c-1)]` against
      `grid[r][c]` vs `grid[r][c-1]`.
    - If `r > 0`, check the vertical clue `vClues[(r-1, c)]` against
      `grid[r][c]` vs `grid[r-1][c]`.
    - `=` requires equality; `X` requires difference.
- Backtracking:
  - Stop immediately if `count >= limit`.
  - At the end of the visit order, increment `count` and return.
  - If the cell is fixed, validate and continue (do not branch).
  - Otherwise try `SUN` then `MOON`.
- Return `count` (0, 1, or `limit`).

### 7.4 Phase 3 — `reduceClues(cells, hClues, vClues, minEdges = MIN_EDGES)`

Start from all clues and remove as many as possible while keeping a **unique**
solution.

1. Copy the three maps.
2. Build a shuffled list of removable items: every cell key, every `hClues` key,
   every `vClues` key.
3. For each item:
   - **Source quirk (preserve):** if the item is a *horizontal* edge and the
     current total edge count (`hClues.size + vClues.size`) is `<= minEdges`,
     skip it. (The guard is applied only to horizontal edges, exactly as in the
     reference.)
   - Remove the clue (remember its value).
   - `count = countSolutions(cells, hClues, vClues, 2)`.
   - If `count !== 1`, restore the clue; otherwise keep it removed.
4. Return the reduced `{ cells, hClues, vClues }`.

### 7.5 Phase 4 — `solveLogically(cells, hClues, vClues)`

Pure-deduction solver used to validate that the reduced puzzle is solvable
without backtracking. Returns `{ complete, grid }` where `complete` means every
cell is filled.

Initialize a 6×6 `EMPTY` grid from `cells`. Define
`opposite(v) = v === SUN ? MOON : SUN`.

Apply three rules repeatedly until no rule makes progress. Each iteration:

1. For every line (6 rows, then 6 columns):
   - **Rule of three:** for each 3-cell window, if exactly two cells are known
     and equal and the third is empty, set the empty cell to the opposite value.
   - **Rule of count:** if the line already contains 3 suns *or* 3 moons, fill
     every remaining empty cell in that line with the missing symbol.
2. **Edge rule:** for each horizontal clue, if exactly one endpoint is known and
   the other empty, fill the empty endpoint with the same value (`=`) or the
   opposite (`X`). Repeat for vertical clues.
3. Repeat the whole loop while any rule changed something.

**Implementation notes (fidelity):**

- In the reference, the rule-of-three function reads a **snapshot** of the line
  values taken when it is called; fills made during that call are only observed
  on the next outer iteration. The rule-of-count behaves the same way.
- The edge rule reads the grid **live**, so consecutive edge fills within the
  same pass can chain.
- `complete` is `true` iff all 36 cells are non-`EMPTY` afterward. The solved
  grid is not required by gameplay; the boolean is what matters.

### 7.6 `generatePuzzle(...)`

```
for attempt in 1..maxAttempts:
    solution = generateSolution()
    clues    = deriveClues(solution)
    reduced  = reduceClues(clues.cells, clues.hClues, clues.vClues, minEdges)
    result   = solveLogically(reduced.cells, reduced.hClues, reduced.vClues)
    if result.complete:
        return { solution, cells: reduced.cells,
                 hClues: reduced.hClues, vClues: reduced.vClues,
                 attempts: attempt }
throw Error("Could not generate a deducible puzzle within maxAttempts")
```

Randomness uses `Math.random()` (no seeding requirement). Generation is
synchronous (see §9 for the UI/async handling).

## 8. Gameplay

### 8.1 State

The game holds `solution`, `fixedCells`, `hClues`, `vClues`, `grid`, and `won`.

### 8.2 `newPuzzle()`

1. Show a transient "Generating…" status.
2. Call `generatePuzzle()` (see §9 for yielding a paint first).
3. Store `solution`, `fixedCells`, `hClues`, `vClues`.
4. Reset `grid` from `fixedCells` (all other cells `EMPTY`).
5. `won = false`; hide the win overlay; clear status.
6. Render the puzzle, then start the timer from zero — the clock begins as soon
   as the valid board is visible.

If generation throws after `MAX_ATTEMPTS`, show an error status and leave the
previous puzzle intact (or retry once); it should never crash the app.

### 8.3 `resetPuzzle()`

- Reset `grid` from `fixedCells`, set `won = false`, hide the overlay, and clear
  transient status. The current puzzle (clues) is preserved. Re-render, then
  restart the timer from zero so it runs while the valid board is visible.

### 8.4 Cell interaction

Fixed cells (`fixedCells.has(key(r,c))`) are **locked** and cannot be changed.
While `won`, all input is ignored.

- **Left click / primary click** on a non-fixed cell cycles:
  `EMPTY → SUN → MOON → EMPTY`.
- **Right click (context menu)** on a non-fixed cell clears it to `EMPTY`
  (and must `preventDefault()`).
- After any change: re-render, update progress, and run win detection.

### 8.5 Validation — `computeInvalidCells()`

Returns a `Set` of `"r,c"` keys for cells that violate a rule. This drives the
real-time red highlight and the win check. Rules:

1. For every row and every column, `markInvalidLine(values, positions, out)`:
   - For each 3-cell window, if all three are non-`EMPTY` and equal, add all
     three positions.
   - Count suns: if `> 3`, add every sun position. Count moons: if `> 3`, add
     every moon position.
2. For every horizontal clue: if **both** endpoints are non-`EMPTY` and
   (`=` and unequal) or (`X` and equal), add both cells.
3. For every vertical clue: same, using `(r,c)` and `(r+1,c)`.

Notes:

- A partially filled edge pair is never flagged (both endpoints must be filled).
- A count violation is flagged only when a symbol appears **more than 3** times
  in a line (4+), not merely when a line cannot reach the required balance.

### 8.6 Win detection — `checkWin()`

```
complete = every grid cell is non-EMPTY
if complete && computeInvalidCells().size === 0:
    won = true
    stop the timer
    lock the board
    show the win overlay (see ui-and-styling.md)
else:
    won = false
```

Win is determined by **completeness + rule validity**, not by comparing `grid`
to `solution`. Because puzzles have a unique solution, a complete valid grid
necessarily equals it.

### 8.7 Timer and progress

- **Progress:** `remaining` = number of `EMPTY` cells in `grid`. Display it in
  the status bar and update after every change.
- **Timer:** starts as soon as a puzzle is displayed — after `newPuzzle()`
  finishes generating and rendering the valid board, and after `resetPuzzle()`
  re-renders the current puzzle. It does **not** wait for the first interaction.
  It stops on win. Both reset and new game restart it from zero. Display format
  is `MM:SS` (minutes may exceed 59); update about every 200 ms.

### 8.8 Controls

| Input | Action |
|-------|--------|
| Left click on cell | Cycle symbol. |
| Right click on cell | Clear cell. |
| `New game` button | `newPuzzle()`. |
| `Reset` button | `resetPuzzle()`. |
| `N` / `n` key | `newPuzzle()`. |
| `R` / `r` key | `resetPuzzle()`. |
| Win overlay "New game" | `newPuzzle()` and hide overlay. |

## 9. Generation latency and UI state

Generation is synchronous and may briefly block the main thread. To keep the UI
honest:

1. Set the status message to "Generating…".
2. Yield one frame so the message paints (e.g., `await new Promise(r =>
   requestAnimationFrame(() => setTimeout(r, 0)))`).
3. Run `generatePuzzle()` synchronously.
4. Clear the status and render the puzzle.

While generating, the New game / Reset actions should be ignored or disabled
until generation completes. For 6×6, generation is expected to complete in well
under a second typically; no worker is required (and none is permitted by the
3-file structure).

## 10. Source quirks to preserve

These are deliberate parts of the reference behavior; do not "fix" them silently:

1. `reduceClues` applies the `minEdges` guard only to **horizontal** edges.
2. Rule-of-three and rule-of-count operate on a **snapshot** of the line per
   call; the edge rule reads live values.
3. The `> 3` count rule (not `>= 3`) triggers count-based invalidity.
4. Edge-clue invalidity requires **both** endpoints to be filled.
5. Win is completeness + validity, not a direct comparison to `solution`.
6. Left-click cycle order is `EMPTY → SUN → MOON → EMPTY` (sun first).

## 11. Acceptance criteria

### Generator & solver

- **AC-F1** Every `generateSolution()` result has exactly 3 suns and 3 moons per
  row/column and no three consecutive equal symbols.
- **AC-F2** Every `deriveClues()` clue is consistent with the solution; `hClues`
  has 30 entries, `vClues` has 30, `cells` has 36 before reduction.
- **AC-F3** For every generated puzzle, `countSolutions(cells, hClues, vClues, 2)
  === 1` (unique solution).
- **AC-F4** For every generated puzzle, `solveLogically(...)` fills the grid
  (`complete === true`), and the filled grid equals `solution`.
- **AC-F5** `generatePuzzle()` succeeds within `MAX_ATTEMPTS` for repeated runs
  (sampled) and returns a non-empty reduced clue set.

### Gameplay

- **AC-F6** Left click cycles a non-fixed cell through empty → sun → moon → empty.
- **AC-F7** Right click clears a non-fixed cell; the context menu is suppressed.
- **AC-F8** Fixed cells never change under any input.
- **AC-F9** A cell that violates any rule is flagged invalid immediately,
  including partial-board violations (triples, 4+ counts, filled edge pairs).
- **AC-F10** Win occurs only when all 36 cells are filled and no cell is invalid;
  the board locks and the overlay appears.
- **AC-F11** `Reset` restores the initial clue layout, removes player entries,
  restarts the timer from zero, and hides the overlay.
- **AC-F12** `New game` generates a different puzzle (new solution/clues),
  restarts the timer from zero, and hides the overlay.
- **AC-F13** `N`/`n` and `R`/`r` keys perform new/reset as specified.
- **AC-F14** The remaining count equals the number of empty cells at all times.
- **AC-F15** The timer starts as soon as a valid board is displayed (on new game
  and on reset), stops on win, and restarts from zero on reset/new.

### Robustness

- **AC-F16** Rapid clicks during generation do not create inconsistent state.
- **AC-F17** If generation exhausts `MAX_ATTEMPTS`, the app shows an error and
  remains usable (no uncaught exception).
