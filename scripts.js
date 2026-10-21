"use strict";

/*
 * Tango — browser-only port of the Python reference (base_app/).
 *
 * Sections:
 *   1. Constants & config
 *   2. Utilities
 *   3. Generator & solver   (port of tango_generator.py)
 *   4. Game state & rules    (port of tango_game.py)
 *   5. Rendering
 *   6. Timer & status
 *   7. Input wiring + bootstrap
 */
(function () {
  // ---------------------------------------------------------------------
  // 1. Constants & config
  // ---------------------------------------------------------------------
  const N = 6;
  const SUN = 1;
  const MOON = 0;
  const EMPTY = null;

  // The reference uses 120 attempts. The web port raises the budget to 300:
  // the deducibility check succeeds ~5.75% of the time, so 300 attempts makes a
  // rare unlucky streak effectively impossible without changing the pipeline.
  const MAX_ATTEMPTS = 300;
  const MIN_EDGES = 2;

  const CELL_MIN = 40;
  const CELL_MAX = 72;
  const EDGE_GAP = 4; // must match the CSS --edge-gap token (sizing math only)

  const RESULT_DELAY_MS = 600;

  const KEY = (r, c) => r + "," + c;
  const PARSE = (k) => k.split(",").map(Number);

  // ---------------------------------------------------------------------
  // 2. Utilities
  // ---------------------------------------------------------------------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function noThreeInARow(seq) {
    let runVal = null;
    let runLen = 0;
    for (const v of seq) {
      if (v === EMPTY) {
        runVal = null;
        runLen = 0;
        continue;
      }
      if (v === runVal) {
        runLen++;
        if (runLen >= 3) return false;
      } else {
        runVal = v;
        runLen = 1;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // 3. Generator & solver
  // ---------------------------------------------------------------------

  // All 6-length rows with exactly 3 suns and 3 moons, free of triples.
  // (C(6,3) = 20 candidates; 14 survive the filter.)
  function buildValidRows() {
    const rows = [];
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        for (let c = b + 1; c < N; c++) {
          const row = new Array(N).fill(MOON);
          row[a] = SUN;
          row[b] = SUN;
          row[c] = SUN;
          if (noThreeInARow(row)) rows.push(row);
        }
      }
    }
    return rows;
  }

  const VALID_ROWS = buildValidRows();

  // Phase 1 — random, fully valid grid (backtracking row by row).
  function generateSolution() {
    const grid = Array.from({ length: N }, () => new Array(N).fill(EMPTY));

    function columnsValidBelow(rowIdx) {
      if (rowIdx >= 2) {
        for (let c = 0; c < N; c++) {
          if (
            grid[rowIdx - 2][c] === grid[rowIdx - 1][c] &&
            grid[rowIdx - 1][c] === grid[rowIdx][c]
          ) {
            return false;
          }
        }
      }
      for (let c = 0; c < N; c++) {
        let suns = 0;
        let moons = 0;
        for (let r = 0; r <= rowIdx; r++) {
          if (grid[r][c] === SUN) suns++;
          else if (grid[r][c] === MOON) moons++;
        }
        if (suns > 3 || moons > 3) return false;
      }
      return true;
    }

    function backtrack(rowIdx) {
      if (rowIdx === N) return true;
      const candidates = shuffle(VALID_ROWS.map((row) => row.slice()));
      for (const row of candidates) {
        grid[rowIdx] = row;
        if (columnsValidBelow(rowIdx) && backtrack(rowIdx + 1)) return true;
        grid[rowIdx] = new Array(N).fill(EMPTY);
      }
      return false;
    }

    if (!backtrack(0)) throw new Error("Failed to generate a solution");
    return grid;
  }

  // Phase 2 — derive every possible cell and edge clue from a solution.
  function deriveClues(solution) {
    const cells = new Map();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) cells.set(KEY(r, c), solution[r][c]);
    }

    const hClues = new Map();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N - 1; c++) {
        hClues.set(KEY(r, c), solution[r][c] === solution[r][c + 1] ? "=" : "X");
      }
    }

    const vClues = new Map();
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N; c++) {
        vClues.set(KEY(r, c), solution[r][c] === solution[r + 1][c] ? "=" : "X");
      }
    }

    return { cells, hClues, vClues };
  }

  // Backtracking solver: counts solutions up to `limit` (used for uniqueness).
  function countSolutions(cells, hClues, vClues, limit = 2) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
    for (const [k, v] of cells) {
      const [r, c] = PARSE(k);
      grid[r][c] = v;
    }

    let count = 0;

    function rowOK(r, upToCol) {
      let suns = 0;
      let moons = 0;
      let runVal = null;
      let runLen = 0;
      for (let c = 0; c <= upToCol; c++) {
        const v = grid[r][c];
        if (v === EMPTY) {
          runVal = null;
          runLen = 0;
          continue;
        }
        if (v === SUN) suns++;
        else moons++;
        if (v === runVal) {
          runLen++;
          if (runLen >= 3) return false;
        } else {
          runVal = v;
          runLen = 1;
        }
      }
      return suns <= 3 && moons <= 3;
    }

    function colOK(c, upToRow) {
      let suns = 0;
      let moons = 0;
      let runVal = null;
      let runLen = 0;
      for (let r = 0; r <= upToRow; r++) {
        const v = grid[r][c];
        if (v === EMPTY) {
          runVal = null;
          runLen = 0;
          continue;
        }
        if (v === SUN) suns++;
        else moons++;
        if (v === runVal) {
          runLen++;
          if (runLen >= 3) return false;
        } else {
          runVal = v;
          runLen = 1;
        }
      }
      return suns <= 3 && moons <= 3;
    }

    function edgeOK(r, c) {
      if (c > 0) {
        const t = hClues.get(KEY(r, c - 1));
        if (t === "=" && grid[r][c] !== grid[r][c - 1]) return false;
        if (t === "X" && grid[r][c] === grid[r][c - 1]) return false;
      }
      if (r > 0) {
        const t = vClues.get(KEY(r - 1, c));
        if (t === "=" && grid[r][c] !== grid[r - 1][c]) return false;
        if (t === "X" && grid[r][c] === grid[r - 1][c]) return false;
      }
      return true;
    }

    function backtrack(idx) {
      if (count >= limit) return;
      if (idx === N * N) {
        count++;
        return;
      }
      const r = Math.floor(idx / N);
      const c = idx % N;

      if (grid[r][c] !== EMPTY) {
        if (rowOK(r, c) && colOK(c, r) && edgeOK(r, c)) backtrack(idx + 1);
        return;
      }

      for (const v of [SUN, MOON]) {
        grid[r][c] = v;
        if (rowOK(r, c) && colOK(c, r) && edgeOK(r, c)) {
          backtrack(idx + 1);
          if (count >= limit) {
            grid[r][c] = EMPTY;
            return;
          }
        }
        grid[r][c] = EMPTY;
      }
    }

    backtrack(0);
    return count;
  }

  // Phase 3 — remove clues while the solution stays unique.
  function reduceClues(cells, hClues, vClues, minEdges = MIN_EDGES) {
    const c = new Map(cells);
    const h = new Map(hClues);
    const v = new Map(vClues);

    const items = [];
    for (const k of c.keys()) items.push(["cell", k]);
    for (const k of h.keys()) items.push(["bh", k]);
    for (const k of v.keys()) items.push(["bv", k]);
    shuffle(items);

    for (const [type, k] of items) {
      // Source quirk: the guard applies only to horizontal edges.
      if (type === "bh" && h.size + v.size <= minEdges) continue;

      let value;
      if (type === "cell") {
        value = c.get(k);
        c.delete(k);
      } else if (type === "bh") {
        value = h.get(k);
        h.delete(k);
      } else {
        value = v.get(k);
        v.delete(k);
      }

      if (countSolutions(c, h, v, 2) !== 1) {
        if (type === "cell") c.set(k, value);
        else if (type === "bh") h.set(k, value);
        else v.set(k, value);
      }
    }

    return { cells: c, hClues: h, vClues: v };
  }

  // Phase 4 — pure-deduction solver (validates the puzzle is fair).
  function solveLogically(cells, hClues, vClues) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
    for (const [k, v] of cells) {
      const [r, c] = PARSE(k);
      grid[r][c] = v;
    }

    const opposite = (v) => (v === SUN ? MOON : SUN);

    const allLines = [];
    for (let r = 0; r < N; r++) {
      const line = [];
      for (let c = 0; c < N; c++) line.push([r, c]);
      allLines.push(line);
    }
    for (let c = 0; c < N; c++) {
      const line = [];
      for (let r = 0; r < N; r++) line.push([r, c]);
      allLines.push(line);
    }

    function applyThreeRule(line) {
      let changed = false;
      const vals = line.map(([r, c]) => grid[r][c]);
      for (let i = 0; i < N - 2; i++) {
        const known = [];
        const unknown = [];
        for (let j = i; j < i + 3; j++) {
          const v = vals[j];
          if (v === EMPTY) unknown.push(line[j]);
          else known.push({ pos: line[j], v });
        }
        if (
          known.length === 2 &&
          unknown.length === 1 &&
          known[0].v === known[1].v
        ) {
          const [ur, uc] = unknown[0];
          grid[ur][uc] = opposite(known[0].v);
          changed = true;
        }
      }
      return changed;
    }

    function applyCountRule(line) {
      let changed = false;
      const vals = line.map(([r, c]) => grid[r][c]);
      let suns = 0;
      let moons = 0;
      for (const v of vals) {
        if (v === SUN) suns++;
        else if (v === MOON) moons++;
      }
      if (suns === 3 || moons === 3) {
        const missing = moons === 3 ? SUN : MOON;
        for (let i = 0; i < N; i++) {
          if (vals[i] === EMPTY) {
            const [r, c] = line[i];
            grid[r][c] = missing;
            changed = true;
          }
        }
      }
      return changed;
    }

    function applyEdges() {
      let changed = false;
      for (const [k, t] of hClues) {
        const [r, c] = PARSE(k);
        const a = grid[r][c];
        const b = grid[r][c + 1];
        if (a !== EMPTY && b === EMPTY) {
          grid[r][c + 1] = t === "=" ? a : opposite(a);
          changed = true;
        } else if (b !== EMPTY && a === EMPTY) {
          grid[r][c] = t === "=" ? b : opposite(b);
          changed = true;
        }
      }
      for (const [k, t] of vClues) {
        const [r, c] = PARSE(k);
        const a = grid[r][c];
        const b = grid[r + 1][c];
        if (a !== EMPTY && b === EMPTY) {
          grid[r + 1][c] = t === "=" ? a : opposite(a);
          changed = true;
        } else if (b !== EMPTY && a === EMPTY) {
          grid[r][c] = t === "=" ? b : opposite(b);
          changed = true;
        }
      }
      return changed;
    }

    let progress = true;
    while (progress) {
      progress = false;
      for (const line of allLines) {
        if (applyThreeRule(line)) progress = true;
        if (applyCountRule(line)) progress = true;
      }
      if (applyEdges()) progress = true;
    }

    let complete = true;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r][c] === EMPTY) complete = false;
      }
    }
    return { complete, grid };
  }

  // Full pipeline (retries until the puzzle is deducible without guessing).
  function generatePuzzle(maxAttempts = MAX_ATTEMPTS, minEdges = MIN_EDGES) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const solution = generateSolution();
      const { cells, hClues, vClues } = deriveClues(solution);
      const reduced = reduceClues(cells, hClues, vClues, minEdges);
      const result = solveLogically(
        reduced.cells,
        reduced.hClues,
        reduced.vClues
      );
      if (result.complete) {
        return {
          solution,
          cells: reduced.cells,
          hClues: reduced.hClues,
          vClues: reduced.vClues,
          attempts: attempt,
        };
      }
    }
    throw new Error(
      "Could not generate a deducible puzzle within " + maxAttempts + " attempts"
    );
  }

  // ---------------------------------------------------------------------
  // 4. Game state & rules
  // ---------------------------------------------------------------------
  const state = {
    solution: null,
    fixedCells: new Map(),
    hClues: new Map(),
    vClues: new Map(),
    grid: null,
    won: false,
    generating: false,
  };

  let cellEls = []; // cellEls[r][c] -> DOM element
  let winTimeoutId = null;

  function gridFromFixed() {
    const grid = Array.from({ length: N }, () => new Array(N).fill(EMPTY));
    for (const [k, v] of state.fixedCells) {
      const [r, c] = PARSE(k);
      grid[r][c] = v;
    }
    return grid;
  }

  function resetGrid() {
    state.grid = gridFromFixed();
    state.won = false;
  }

  async function newPuzzle() {
    if (state.generating) return;
    state.generating = true;
    setButtonsDisabled(true);
    setStatus("Generating…");
    hideWin();

    // Yield a frame so the status message can paint before the sync work.
    await new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });

    try {
      const result = generatePuzzle();
      state.solution = result.solution;
      state.fixedCells = result.cells;
      state.hClues = result.hClues;
      state.vClues = result.vClues;
      resetGrid();
      resetTimer();
      setStatus("");
      render();
      startTimer();
    } catch (err) {
      console.error(err);
      setStatus("Could not generate a puzzle. Try again.");
    } finally {
      state.generating = false;
      setButtonsDisabled(false);
    }
  }

  function resetPuzzle() {
    if (state.generating) return;
    if (!state.grid) return; // nothing generated yet
    resetGrid();
    resetTimer();
    hideWin();
    setStatus("");
    render();
    startTimer();
  }

  // Real-time rule validation; returns a Set of "r,c" keys.
  function computeInvalidCells() {
    const invalid = new Set();
    const grid = state.grid;
    if (!grid) return invalid;

    function markInvalidLine(values, positions) {
      for (let i = 0; i < values.length - 2; i++) {
        const a = values[i];
        const b = values[i + 1];
        const d = values[i + 2];
        if (a !== EMPTY && a === b && b === d) {
          invalid.add(KEY(positions[i][0], positions[i][1]));
          invalid.add(KEY(positions[i + 1][0], positions[i + 1][1]));
          invalid.add(KEY(positions[i + 2][0], positions[i + 2][1]));
        }
      }

      let suns = 0;
      let moons = 0;
      for (const v of values) {
        if (v === SUN) suns++;
        else if (v === MOON) moons++;
      }
      if (suns > 3) {
        for (let i = 0; i < values.length; i++) {
          if (values[i] === SUN) {
            invalid.add(KEY(positions[i][0], positions[i][1]));
          }
        }
      }
      if (moons > 3) {
        for (let i = 0; i < values.length; i++) {
          if (values[i] === MOON) {
            invalid.add(KEY(positions[i][0], positions[i][1]));
          }
        }
      }
    }

    for (let r = 0; r < N; r++) {
      const values = [];
      const positions = [];
      for (let c = 0; c < N; c++) {
        values.push(grid[r][c]);
        positions.push([r, c]);
      }
      markInvalidLine(values, positions);
    }

    for (let c = 0; c < N; c++) {
      const values = [];
      const positions = [];
      for (let r = 0; r < N; r++) {
        values.push(grid[r][c]);
        positions.push([r, c]);
      }
      markInvalidLine(values, positions);
    }

    for (const [k, t] of state.hClues) {
      const [r, c] = PARSE(k);
      const a = grid[r][c];
      const b = grid[r][c + 1];
      if (a !== EMPTY && b !== EMPTY) {
        if ((t === "=" && a !== b) || (t === "X" && a === b)) {
          invalid.add(KEY(r, c));
          invalid.add(KEY(r, c + 1));
        }
      }
    }

    for (const [k, t] of state.vClues) {
      const [r, c] = PARSE(k);
      const a = grid[r][c];
      const b = grid[r + 1][c];
      if (a !== EMPTY && b !== EMPTY) {
        if ((t === "=" && a !== b) || (t === "X" && a === b)) {
          invalid.add(KEY(r, c));
          invalid.add(KEY(r + 1, c));
        }
      }
    }

    return invalid;
  }

  function checkWin() {
    if (!state.grid) return;
    let complete = true;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (state.grid[r][c] === EMPTY) complete = false;
      }
    }

    if (complete && computeInvalidCells().size === 0) {
      state.won = true;
      stopTimer();
      if (winTimeoutId !== null) clearTimeout(winTimeoutId);
      winTimeoutId = setTimeout(() => {
        winTimeoutId = null;
        showWin();
      }, RESULT_DELAY_MS);
    } else {
      state.won = false;
    }
  }

  // ---------------------------------------------------------------------
  // 5. Rendering
  // ---------------------------------------------------------------------
  const boardEl = document.getElementById("board");
  const remainingEl = document.getElementById("remaining");
  const timerEl = document.getElementById("timer");
  const statusMsgEl = document.getElementById("status-message");
  const newGameBtn = document.getElementById("new-game");
  const resetGameBtn = document.getElementById("reset-game");
  const winEl = document.getElementById("win");
  const winSummaryEl = document.getElementById("win-summary");
  const playAgainBtn = document.getElementById("play-again");

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + N + ", var(--cell-size))";
    boardEl.style.gridTemplateRows = "repeat(" + N + ", var(--cell-size))";
    cellEls = [];

    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.setAttribute("role", "gridcell");
        boardEl.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }
  }

  function addEdgeBadges(el, r, c) {
    const hType = state.hClues.get(KEY(r, c));
    if (hType) {
      const badge = document.createElement("span");
      badge.className = "edge-hint edge-hint--right";
      badge.textContent = hType;
      badge.setAttribute("aria-hidden", "true");
      el.appendChild(badge);
    }

    const vType = state.vClues.get(KEY(r, c));
    if (vType) {
      const badge = document.createElement("span");
      badge.className = "edge-hint edge-hint--bottom";
      badge.textContent = vType;
      badge.setAttribute("aria-hidden", "true");
      el.appendChild(badge);
    }
  }

  function cellLabel(r, c, value, isFixed, isInvalid) {
    const stateText = value === SUN ? "sun" : value === MOON ? "moon" : "empty";
    let label = "Row " + (r + 1) + ", column " + (c + 1) + ", " + stateText;
    if (isFixed) label += ", given";
    if (isInvalid) label += ", invalid";
    return label;
  }

  function render() {
    if (!state.grid) return;
    const invalid = computeInvalidCells();

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const el = cellEls[r][c];
        const value = state.grid[r][c];
        const isFixed = state.fixedCells.has(KEY(r, c));
        const isInvalid = invalid.has(KEY(r, c));

        el.className = "cell";
        if (isFixed) el.classList.add("fixed");
        if (isInvalid) el.classList.add("invalid");
        el.textContent = "";

        if (value !== EMPTY) {
          const img = document.createElement("img");
          img.className = "symbol";
          img.src = value === SUN ? "assets/sun.svg" : "assets/moon.svg";
          img.alt = value === SUN ? "Sun" : "Moon";
          img.draggable = false;
          el.appendChild(img);
        }

        addEdgeBadges(el, r, c);
        el.setAttribute("aria-label", cellLabel(r, c, value, isFixed, isInvalid));
      }
    }

    updateRemaining();
  }

  function updateRemaining() {
    if (!state.grid) {
      remainingEl.textContent = "--";
      return;
    }
    let empty = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (state.grid[r][c] === EMPTY) empty++;
      }
    }
    remainingEl.textContent = String(empty);
  }

  function updateCellSize() {
    const chromeH = 190; // topbar + status + gaps + page padding
    const availW = Math.min(window.innerWidth - 48, 1200);
    const availH = window.innerHeight - chromeH;
    const boardPad = 16; // 2 × 8px board padding

    const byWidth = (availW - (N - 1) * EDGE_GAP - boardPad) / N;
    const byHeight = (availH - (N - 1) * EDGE_GAP - boardPad) / N;

    let size = Math.floor(Math.min(byWidth, byHeight));
    size = Math.max(CELL_MIN, Math.min(CELL_MAX, size));

    boardEl.style.setProperty("--cell-size", size + "px");
    boardEl.style.setProperty(
      "--cell-font",
      Math.max(10, Math.round(size * 0.4)) + "px"
    );
  }

  // ---------------------------------------------------------------------
  // 6. Timer & status
  // ---------------------------------------------------------------------
  let timerId = null;
  let startTime = null;
  let elapsedSeconds = 0;

  function formatTime(totalSeconds) {
    const pad = (n) => String(n).padStart(2, "0");
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return pad(m) + ":" + pad(s);
  }

  function updateTimerDisplay() {
    timerEl.textContent = formatTime(elapsedSeconds);
  }

  function startTimer() {
    if (timerId !== null) return;
    startTime = Date.now();
    timerId = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      updateTimerDisplay();
    }, 200);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    if (startTime !== null) {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      updateTimerDisplay();
    }
  }

  function resetTimer() {
    stopTimer();
    startTime = null;
    elapsedSeconds = 0;
    updateTimerDisplay();
  }

  function setStatus(message) {
    statusMsgEl.textContent = message || "";
  }

  function setButtonsDisabled(disabled) {
    newGameBtn.disabled = disabled;
    resetGameBtn.disabled = disabled;
  }

  function hideWin() {
    if (winTimeoutId !== null) {
      clearTimeout(winTimeoutId);
      winTimeoutId = null;
    }
    winEl.hidden = true;
  }

  function showWin() {
    winSummaryEl.textContent =
      "Solved in " + formatTime(elapsedSeconds) + " \u00B7 6\u00D76";
    winEl.hidden = false;
    playAgainBtn.focus();
  }

  // ---------------------------------------------------------------------
  // 7. Input wiring + bootstrap
  // ---------------------------------------------------------------------
  function afterMove() {
    render();
    checkWin();
  }

  function onCellPrimary(r, c) {
    if (state.generating || state.won || !state.grid) return;
    if (state.fixedCells.has(KEY(r, c))) return;

    const value = state.grid[r][c];
    if (value === EMPTY) state.grid[r][c] = SUN;
    else if (value === SUN) state.grid[r][c] = MOON;
    else state.grid[r][c] = EMPTY;
    afterMove();
  }

  function onCellContext(r, c) {
    if (state.generating || state.won || !state.grid) return;
    if (state.fixedCells.has(KEY(r, c))) return;
    if (state.grid[r][c] === EMPTY) return; // no-op

    state.grid[r][c] = EMPTY;
    afterMove();
  }

  function cellCoords(el) {
    return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
  }

  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    const k = event.key.toLowerCase();
    if (k === "n") {
      event.preventDefault();
      newPuzzle();
    } else if (k === "r") {
      event.preventDefault();
      resetPuzzle();
    }
  }

  function wireEvents() {
    boardEl.addEventListener("click", (event) => {
      const el = event.target.closest(".cell");
      if (!el || !boardEl.contains(el)) return;
      const { r, c } = cellCoords(el);
      onCellPrimary(r, c);
    });

    boardEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const el = event.target.closest(".cell");
      if (!el || !boardEl.contains(el)) return;
      const { r, c } = cellCoords(el);
      onCellContext(r, c);
    });

    newGameBtn.addEventListener("click", () => newPuzzle());
    resetGameBtn.addEventListener("click", () => resetPuzzle());
    playAgainBtn.addEventListener("click", () => {
      hideWin();
      newPuzzle();
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateCellSize);
  }

  function init() {
    buildBoard();
    updateCellSize();
    wireEvents();
    newPuzzle();
  }

  init();
})();
