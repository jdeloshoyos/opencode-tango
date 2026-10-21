# Tango

A browser-based clone of LinkedIn's **Tango** logic puzzle: a 6×6 grid of suns
and moons that you fill in using the board's rules and edge clues. It runs
entirely in the browser — no backend, no build step, no dependencies.

The puzzle generator, solver, and gameplay logic are a faithful JavaScript port
of the Python reference implementation in [`base_app/`](base_app/), and the
visual style is adapted from [`base_stylesheet/`](base_stylesheet/).

## Features

- **Generated on demand** — every "New game" produces a fresh puzzle in the
  browser.
- **Guaranteed fair** — the generator only keeps puzzles that have a **unique
  solution** and are solvable by **pure deduction** (no guessing).
- **Real-time validation** — cells that break a rule are highlighted
  immediately.
- **Timed** — the clock starts as soon as the board appears and stops when you
  solve it.
- **Clean, responsive UI** — dark theme, SVG sun/moon symbols, and a win dialog
  consistent with the reference stylesheet.

## Project structure

```
.
├── index.html                # Minimal app shell
├── scripts.js                # All game logic (generator, solver, gameplay, UI)
├── style.css                 # Base stylesheet + Tango extensions
├── assets/
│   ├── sun.svg               # SUN symbol
│   └── moon.svg              # MOON symbol
├── specs/                    # Spec-driven development documents
│   ├── functional.md         # Rules, generator/solver, gameplay, acceptance criteria
│   ├── ui-and-styling.md     # Visual design and stylesheet adaptation
│   └── architecture.md       # File layout, module structure, Python → JS mapping
├── base_app/                 # Original Python implementation (reference)
│   ├── tango_generator.py
│   ├── tango_game.py
│   └── README.md
└── base_stylesheet/          # Existing game used as the visual reference
    ├── index.html
    ├── script.js
    └── style.css
```

## Running the game

Since everything is client-side, you can simply open `index.html` in a modern
browser.

If you prefer to serve it over HTTP:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then visit <http://localhost:8000>.

## How to play

Fill the 6×6 grid with suns and moons so that every row and column satisfies the
rules. Some cells are **given** (darker background) and cannot be changed.

| Input | Action |
|-------|--------|
| **Left click** a cell | Cycle: empty → sun → moon → empty |
| **Right click** a cell | Clear the cell |
| **Reset** button / `R` | Restart the current puzzle |
| **New game** button / `N` | Generate a new puzzle |

The status bar shows how many cells remain and the elapsed time. When the board
is complete and valid, a "You solved it!" dialog appears with your time.

### Rules

1. Each **row** and each **column** must contain exactly **3 suns and 3 moons**.
2. **No three identical symbols** may appear consecutively in a row or column.
3. **Edge clues** between adjacent cells constrain their relationship:
   - `=` — the two cells must be the **same**.
   - `X` — the two cells must be **different**.

Cells that violate any of these rules are highlighted in red. The puzzle is
solved only when the grid is full **and** no cell is invalid.

## How puzzles are generated

`scripts.js` ports the four-phase pipeline from `base_app/tango_generator.py`:

1. **Generate a solution** — build a random valid 6×6 grid by backtracking.
2. **Derive clues** — compute every possible cell and edge clue from it.
3. **Reduce clues** — remove clues one by one while a backtracking solver
   confirms the solution stays unique.
4. **Validate deducibility** — a pure-deduction solver must be able to finish the
   puzzle; otherwise the attempt is retried.

The generated puzzle has a single solution and can be solved without guessing.

> **Note:** the Python reference retries generation up to 120 times. The web
> port raises that cap to 300 because the deducibility check succeeds only
> ~5.75% of the time; this makes an unlucky failure effectively impossible
> without changing the pipeline or the puzzles it produces.

## Specifications

This project was built spec-first. The behavior, visual design, and architecture
are documented in [`specs/`](specs/):

- [`specs/functional.md`](specs/functional.md)
- [`specs/ui-and-styling.md`](specs/ui-and-styling.md)
- [`specs/architecture.md`](specs/architecture.md)

## Credits

- Puzzle logic ported from the Python reference in `base_app/`.
- Visual language adapted from `base_stylesheet/`.
- Sun and moon icons from `assets/` (sourced via
  [SVG Repo](https://www.svgrepo.com/)).
