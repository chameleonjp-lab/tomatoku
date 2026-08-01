const BOARD_SIZE = 5;
const MAX_ACTIONS = 300;
const MAX_ELAPSED_MS = 30 * 60 * 1000;
const FINAL_TIME_TOLERANCE_MS = 25;

function stageSolutionCells(stage) {
  if (!Array.isArray(stage.solution) || stage.solution.length !== BOARD_SIZE) {
    throw new Error("invalid_stage_solution");
  }
  return stage.solution.map((value, row) => {
    const col = Array.isArray(value) ? Number(value[1]) : Number(value);
    if (!Number.isInteger(col) || col < 0 || col >= BOARD_SIZE) {
      throw new Error("invalid_stage_solution");
    }
    return [row, col];
  });
}

function regionAt(stage, row, col) {
  const regions = stage.regions;
  if (
    !Array.isArray(regions) ||
    regions.length !== BOARD_SIZE ||
    regions.some((line) => typeof line !== "string" || line.length !== BOARD_SIZE)
  ) {
    throw new Error("invalid_stage_regions");
  }
  return regions[row][col];
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function canPlace(stage, placed, row, col) {
  if (placed.size >= BOARD_SIZE) return false;
  const targetRegion = regionAt(stage, row, col);
  for (const key of placed) {
    const [placedRow, placedCol] = key.split(":").map(Number);
    if (placedRow === row || placedCol === col) return false;
    if (regionAt(stage, placedRow, placedCol) === targetRegion) return false;
    if (
      Math.abs(placedRow - row) <= 1 &&
      Math.abs(placedCol - col) <= 1
    ) {
      return false;
    }
  }
  return true;
}

function isCleared(stage, placed) {
  if (placed.size !== BOARD_SIZE) return false;
  const rows = new Set();
  const cols = new Set();
  const regions = new Set();
  const cells = [];
  for (const key of placed) {
    const [row, col] = key.split(":").map(Number);
    rows.add(row);
    cols.add(col);
    regions.add(regionAt(stage, row, col));
    cells.push([row, col]);
  }
  if (
    rows.size !== BOARD_SIZE ||
    cols.size !== BOARD_SIZE ||
    regions.size !== BOARD_SIZE
  ) {
    return false;
  }
  for (let left = 0; left < cells.length; left++) {
    for (let right = left + 1; right < cells.length; right++) {
      if (
        Math.abs(cells[left][0] - cells[right][0]) <= 1 &&
        Math.abs(cells[left][1] - cells[right][1]) <= 1
      ) {
        return false;
      }
    }
  }
  return true;
}

export function validateTranscript({ stages, transcript, elapsedMs }) {
  const safeElapsedMs = Math.floor(Number(elapsedMs));
  if (
    !Number.isFinite(safeElapsedMs) ||
    safeElapsedMs < 0 ||
    safeElapsedMs > MAX_ELAPSED_MS
  ) {
    throw new Error("invalid_elapsed_time");
  }
  if (!Array.isArray(stages) || stages.length !== 3) {
    throw new Error("invalid_stage_set");
  }
  if (
    !stages.every(
      (stage, index) =>
        stage &&
        typeof stage.id === "string" &&
        Number(stage.difficulty) === index + 1
    )
  ) {
    throw new Error("invalid_stage_order");
  }
  if (
    !Array.isArray(transcript) ||
    transcript.length < 1 ||
    transcript.length > MAX_ACTIONS
  ) {
    throw new Error("invalid_transcript_length");
  }

  let currentStageIndex = 0;
  let placed = new Set();
  let mistakeCount = 0;
  let hintCount = 0;
  let previousAtMs = -1;

  for (const action of transcript) {
    if (!action || typeof action !== "object" || currentStageIndex >= 3) {
      throw new Error("action_after_completion");
    }
    const actionStageIndex = Number(action.stageIndex);
    const atMs = Number(action.atMs);
    if (
      !Number.isInteger(actionStageIndex) ||
      actionStageIndex !== currentStageIndex ||
      !Number.isInteger(atMs) ||
      atMs < previousAtMs ||
      atMs > safeElapsedMs
    ) {
      throw new Error("invalid_action_order");
    }
    previousAtMs = atMs;
    const stage = stages[currentStageIndex];

    if (action.type === "tap") {
      const row = Number(action.row);
      const col = Number(action.col);
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        row >= BOARD_SIZE ||
        col < 0 ||
        col >= BOARD_SIZE
      ) {
        throw new Error("invalid_tap_cell");
      }
      const key = cellKey(row, col);
      if (placed.has(key)) {
        placed.delete(key);
      } else if (canPlace(stage, placed, row, col)) {
        placed.add(key);
      } else {
        mistakeCount++;
      }
    } else if (action.type === "hint") {
      hintCount++;
      const solutionCells = stageSolutionCells(stage);
      const solutionKeys = new Set(
        solutionCells.map(([row, col]) => cellKey(row, col))
      );
      placed = new Set([...placed].filter((key) => solutionKeys.has(key)));
      const next = solutionCells.find(
        ([row, col]) => !placed.has(cellKey(row, col))
      );
      if (!next) throw new Error("hint_after_solution");
      placed.add(cellKey(next[0], next[1]));
    } else {
      throw new Error("invalid_action_type");
    }

    if (isCleared(stage, placed)) {
      currentStageIndex++;
      placed = new Set();
    }
  }

  if (currentStageIndex !== 3) throw new Error("run_not_completed");
  if (Math.abs(previousAtMs - safeElapsedMs) > FINAL_TIME_TOLERANCE_MS) {
    throw new Error("final_action_time_mismatch");
  }

  const score =
    Math.floor(safeElapsedMs / 10) + mistakeCount * 300 + hintCount * 3000;
  return {
    accepted: true,
    elapsedMs: safeElapsedMs,
    actionCount: transcript.length,
    mistakeCount,
    hintCount,
    score,
  };
}
