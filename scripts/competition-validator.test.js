import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { validateTranscript } from "../supabase/functions/tomatoku-competition/validator.js";

const bank = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL("../generated/variable-stage-bank-v2.json", import.meta.url)),
    "utf8"
  )
);
const draw = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL("../generated/balanced-official-draw-v1.json", import.meta.url)),
    "utf8"
  )
);
const stageById = new Map(bank.stages.map((stage) => [stage.id, stage]));
const stages = draw.decks[0].slots[0]
  .slice(0, 3)
  .map((stageId) => stageById.get(stageId));

function solvedTranscript(selectedStages, { mistake = false } = {}) {
  const actions = [];
  let atMs = 0;
  selectedStages.forEach((stage, stageIndex) => {
    stage.solution.forEach(([row, col], solutionIndex) => {
      atMs += 1000;
      actions.push({ type: "tap", stageIndex, row, col, atMs });
      if (mistake && stageIndex === 0 && solutionIndex === 0) {
        atMs += 500;
        actions.push({
          type: "tap",
          stageIndex,
          row,
          col: col === 0 ? 1 : 0,
          atMs,
        });
      }
    });
  });
  return { actions, elapsedMs: atMs };
}

const clean = solvedTranscript(stages);
const cleanResult = validateTranscript({
  stages,
  transcript: clean.actions,
  elapsedMs: clean.elapsedMs,
});
assert.equal(cleanResult.accepted, true);
assert.equal(cleanResult.mistakeCount, 0);
assert.equal(cleanResult.hintCount, 0);
assert.equal(cleanResult.score, 1500);

const withMistake = solvedTranscript(stages, { mistake: true });
const mistakeResult = validateTranscript({
  stages,
  transcript: withMistake.actions,
  elapsedMs: withMistake.elapsedMs,
});
assert.equal(mistakeResult.mistakeCount, 1);
assert.equal(mistakeResult.score, 1550 + 300);

const hints = [];
let hintAt = 0;
for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
  for (let count = 0; count < 5; count++) {
    hintAt += 1000;
    hints.push({ type: "hint", stageIndex, atMs: hintAt });
  }
}
const hintResult = validateTranscript({
  stages,
  transcript: hints,
  elapsedMs: hintAt,
});
assert.equal(hintResult.hintCount, 15);
assert.equal(hintResult.score, 1500 + 15 * 3000);

const forged = structuredClone(clean.actions);
forged[forged.length - 1].col = (forged[forged.length - 1].col + 1) % 5;
assert.throws(
  () => validateTranscript({ stages, transcript: forged, elapsedMs: clean.elapsedMs }),
  /run_not_completed|invalid/
);
assert.throws(
  () =>
    validateTranscript({
      stages,
      transcript: clean.actions,
      elapsedMs: clean.elapsedMs + 200,
    }),
  /final_action_time_mismatch/
);

console.log("==== COMPETITION VALIDATOR TEST: PASS ====");
