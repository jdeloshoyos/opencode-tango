"use strict";

const DIFFICULTIES = {
  easy: {
    label: "Easy",
    cols: 10,
    rows: 10,
    mines: 10,
    blurb: "10 \u00D7 10 grid \u00B7 10 mines \u2014 a gentle warm-up.",
  },
  intermediate: {
    label: "Intermediate",
    cols: 16,
    rows: 16,
    mines: 40,
    blurb: "16 \u00D7 16 grid \u00B7 40 mines \u2014 a balanced challenge.",
  },
  hard: {
    label: "Hard",
    cols: 30,
    rows: 16,
    mines: 99,
    blurb: "30 \u00D7 16 grid \u00B7 99 mines \u2014 expert level.",
  },
};

// Cell sizing bounds for the auto-fit calculation.
const CELL_MIN = 16;
const CELL_MAX = 34;
const CELL_GAP = 1;

// Pause before the win/loss dialog, so the player can see the final board.
const RESULT_DELAY_MS = 1000;

const boardEl = document.getElementById("board");
const counterEl = document.getElementById("mine-counter");
const timerEl = document.getElementById("timer");
const difficultyLabelEl = document.getElementById("difficulty-label");
const playAgainBtn = document.getElementById("play-again");
const newGameBtn = document.getElementById("new-game");
const overlayEl = document.getElementById("difficulty");
const optionsEl = document.getElementById("difficulty-options");
const resultEl = document.getElementById("result");
const resultTitleEl = document.getElementById("result-title");
const resultSummaryEl = document.getElementById("result-summary");

// Per-game dimensions, set when a difficulty is chosen.
let cols = 0;
let rows = 0;
let mineCount = 0;

let board = [];          // board[r][c] = { mine, revealed, flagged, adjacent }
let cells = [];          // cells[r][c] = the DOM element
let state = "idle";      // "idle" | "playing" | "lost" | "won"
let minesPlaced = false; // mines are placed lazily on the first reveal
let flagCount = 0;
let exploded = null;     // { r, c } of the mine the player hit

let timerId = null;      // interval handle while the game is running
let startTime = null;    // ms timestamp of the first move
let elapsedSeconds = 0;  // elapsed game time in whole seconds
let resultTimeoutId = null; // pending end-of-game result-dialog timer

// ---------------------------------------------------------------------------
// Difficulty dialog
// ---------------------------------------------------------------------------

function buildDifficultyButtons() {
  optionsEl.innerHTML = "";
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "difficulty";
    btn.dataset.difficulty = key;

    const name = document.createElement("span");
    name.className = "difficulty__name";
    name.textContent = d.label;

    const desc = document.createElement("span");
    desc.className = "difficulty__desc";
    desc.textContent = d.blurb;

    btn.appendChild(name);
    btn.appendChild(desc);
    btn.addEventListener("click", () => startGame(key));
    optionsEl.appendChild(btn);
  }
}

function openDifficultyDialog() {
  closeResultDialog();
  overlayEl.hidden = false;
}

function closeDifficultyDialog() {
  overlayEl.hidden = true;
}

function showResult(kind) {
  const won = kind === "won";
  resultTitleEl.textContent = won ? "You won!" : "Game over";
  resultTitleEl.className = "dialog__title " + (won ? "is-won" : "is-lost");
  resultSummaryEl.textContent =
    difficultyLabelEl.textContent + " \u00B7 " + formatTime(elapsedSeconds);
  resultEl.hidden = false;
}

function closeResultDialog() {
  resultEl.hidden = true;
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

function updateCellSize() {
  if (cols === 0 || rows === 0) return;

  const availW = Math.min(window.innerWidth - 48, 1200);
  const availH = window.innerHeight - 190;

  const byWidth = (availW - (cols - 1) * CELL_GAP) / cols;
  const byHeight = (availH - (rows - 1) * CELL_GAP) / rows;

  let size = Math.floor(Math.min(byWidth, byHeight));
  size = Math.max(CELL_MIN, Math.min(CELL_MAX, size));

  boardEl.style.setProperty("--cell-size", size + "px");
  boardEl.style.setProperty("--cell-font", Math.max(10, Math.round(size * 0.55)) + "px");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function createCells() {
  boardEl.innerHTML = "";
  cells = [];
  boardEl.style.gridTemplateColumns = "repeat(" + cols + ", var(--cell-size))";
  boardEl.style.gridTemplateRows = "repeat(" + rows + ", var(--cell-size))";

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const el = document.createElement("div");
      el.className = "cell";
      el.dataset.r = String(r);
      el.dataset.c = String(c);
      boardEl.appendChild(el);
      row.push(el);
    }
    cells.push(row);
  }
}

function startGame(key) {
  const d = DIFFICULTIES[key];
  cols = d.cols;
  rows = d.rows;
  mineCount = d.mines;
  difficultyLabelEl.textContent = d.label;

  state = "playing";
  minesPlaced = false;
  flagCount = 0;
  exploded = null;

  board = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
    board.push(row);
  }

  closeResultDialog();

  newGameBtn.disabled = false;
  if (resultTimeoutId !== null) {
    clearTimeout(resultTimeoutId);
    resultTimeoutId = null;
  }

  stopTimer();
  startTime = null;
  elapsedSeconds = 0;
  updateTimerDisplay();

  updateCellSize();
  createCells();
  render();
  closeDifficultyDialog();
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

function formatTime(totalSeconds) {
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function updateTimerDisplay() {
  timerEl.textContent = formatTime(elapsedSeconds);
}

function startTimer() {
  if (timerId !== null) return; // already running
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
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------

function forEachNeighbor(r, c, callback) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      callback(nr, nc);
    }
  }
}

function placeMines(safeR, safeC) {
  // Every cell except the first clicked one is a candidate.
  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === safeR && c === safeC) continue;
      candidates.push([r, c]);
    }
  }

  // Partial Fisher-Yates shuffle: pick mineCount distinct cells.
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;

    const [r, c] = candidates[i];
    board[r][c].mine = true;
  }

  computeAdjacents();
}

function computeAdjacents() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      forEachNeighbor(r, c, (nr, nc) => {
        if (board[nr][nc].mine) count++;
      });
      board[r][c].adjacent = count;
    }
  }
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

function revealCell(r, c) {
  if (state !== "playing") return;

  const cell = board[r][c];
  if (!cell || cell.revealed || cell.flagged) return;

  startTimer();

  if (!minesPlaced) {
    placeMines(r, c);
    minesPlaced = true;
  }

  if (cell.mine) {
    lose(r, c);
    return;
  }

  floodFill(r, c);
  checkWin();
  render();
}

function floodFill(startR, startC) {
  const stack = [[startR, startC]];
  while (stack.length > 0) {
    const [r, c] = stack.pop();
    const cell = board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) continue;

    cell.revealed = true;

    // Only blank squares spread the fill; numbered squares act as a border.
    if (cell.adjacent === 0) {
      forEachNeighbor(r, c, (nr, nc) => {
        if (!board[nr][nc].revealed) stack.push([nr, nc]);
      });
    }
  }
}

function chordReveal(r, c) {
  if (state !== "playing") return;

  const cell = board[r][c];
  // Only a revealed cell showing a number (adjacent mines > 0) can be chorded.
  if (!cell || !cell.revealed || cell.adjacent === 0) return;

  // Fire only when the number of adjacent flags equals the cell's number.
  let flags = 0;
  forEachNeighbor(r, c, (nr, nc) => {
    if (board[nr][nc].flagged) flags++;
  });
  if (flags !== cell.adjacent) return;

  // Open every adjacent covered, unflagged cell, exactly as a normal reveal.
  const targets = [];
  forEachNeighbor(r, c, (nr, nc) => {
    if (!board[nr][nc].revealed && !board[nr][nc].flagged) targets.push([nr, nc]);
  });

  for (const [nr, nc] of targets) {
    if (board[nr][nc].mine) {
      lose(nr, nc);
      return;
    }
    floodFill(nr, nc);
  }

  checkWin();
  render();
}

function toggleFlag(r, c) {
  if (state !== "playing") return;

  const cell = board[r][c];
  if (!cell || cell.revealed) return;

  startTimer();

  cell.flagged = !cell.flagged;
  flagCount += cell.flagged ? 1 : -1;

  checkWin();
  render();
}

function checkWin() {
  if (state !== "playing" || !minesPlaced) return;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.mine && !cell.flagged) return;   // a mine is unmarked
      if (!cell.mine && cell.flagged) return;   // a non-mine is wrongly flagged
    }
  }

  win();
}

function lose(hitR, hitC) {
  exploded = { r: hitR, c: hitC };
  endGame("lost");
}

function win() {
  endGame("won");
}

// Ends the game: updates the board immediately, stops the timer, disables
// New game, and shows the result dialog after a short pause.
function endGame(kind) {
  state = kind;
  stopTimer();
  newGameBtn.disabled = true;

  if (kind === "lost") {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) board[r][c].revealed = true;
      }
    }
  }

  render(); // the final board is visible right away

  if (resultTimeoutId !== null) clearTimeout(resultTimeoutId);
  resultTimeoutId = setTimeout(() => {
    resultTimeoutId = null;
    showResult(kind);
  }, RESULT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      const el = cells[r][c];

      el.className = "cell";
      el.textContent = "";

      if (cell.revealed) {
        el.classList.add("revealed");
        if (cell.mine) {
          el.classList.add("mine");
          if (exploded && exploded.r === r && exploded.c === c) {
            el.classList.add("exploded");
          }
          el.textContent = "\uD83D\uDCA3"; // 💣
        } else if (cell.adjacent > 0) {
          el.classList.add("n" + cell.adjacent);
          el.textContent = String(cell.adjacent);
        }
      } else if (cell.flagged) {
        if (state === "lost" && !cell.mine) {
          el.classList.add("wrong");
          el.textContent = "\u274C"; // ❌ wrong flag
        } else {
          el.classList.add("flagged");
          el.textContent = "\uD83D\uDEA9"; // 🚩
        }
      }
    }
  }

  counterEl.textContent = String(mineCount - flagCount);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function cellCoords(el) {
  return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
}

boardEl.addEventListener("click", (event) => {
  const el = event.target.closest(".cell");
  if (!el) return;
  const { r, c } = cellCoords(el);
  revealCell(r, c);
});

boardEl.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const el = event.target.closest(".cell");
  if (!el) return;
  const { r, c } = cellCoords(el);
  toggleFlag(r, c);
});

boardEl.addEventListener("dblclick", (event) => {
  const el = event.target.closest(".cell");
  if (!el) return;
  const { r, c } = cellCoords(el);
  chordReveal(r, c);
});

playAgainBtn.addEventListener("click", openDifficultyDialog);
newGameBtn.addEventListener("click", openDifficultyDialog);
window.addEventListener("resize", updateCellSize);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

buildDifficultyButtons();
openDifficultyDialog();
