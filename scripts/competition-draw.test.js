import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  COMPETITION_DECKS_SHA256,
  COMPETITION_DRAW_SHA256,
} from "../src/competition-sets.js";
import {
  validateCompetitionDrawIntegrity,
  validateCompetitionDrawPayload,
} from "../src/practice-stage-bank.js";

const bank = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL("../generated/variable-stage-bank-v2.json", import.meta.url)),
    "utf8"
  )
);
const drawPath = fileURLToPath(
  new URL("../generated/balanced-official-draw-v1.json", import.meta.url)
);
const drawText = fs.readFileSync(drawPath, "utf8");
const draw = JSON.parse(drawText);

assert.equal(
  crypto.createHash("sha256").update(drawText).digest("hex"),
  COMPETITION_DRAW_SHA256
);
assert.equal(
  crypto
    .createHash("sha256")
    .update(JSON.stringify(draw.decks))
    .digest("hex"),
  COMPETITION_DECKS_SHA256
);

const validation = validateCompetitionDrawPayload(draw, bank.stages);
assert.equal(validation.valid, true, validation.problems.join("; "));
assert.equal(await validateCompetitionDrawIntegrity(draw), true);
assert.equal(validation.competitionSets.length, 224);
assert.equal(validation.minimumScore, 1258);
assert.equal(validation.maximumScore, 1355);

const stageCounts = new Map(bank.stages.map((stage) => [stage.id, 0]));
for (const set of validation.competitionSets) {
  for (const stageId of set) stageCounts.set(stageId, stageCounts.get(stageId) + 1);
}
assert.deepEqual(new Set(stageCounts.values()), new Set([8]));
assert.equal(new Set(validation.competitionSets.map((set) => set.join("|"))).size, 224);

const tampered = structuredClone(draw);
tampered.decks[0].slots[0][0] = tampered.decks[0].slots[1][0];
assert.equal(
  validateCompetitionDrawPayload(tampered, bank.stages).valid,
  false
);

const structurallyBalancedButUnapproved = structuredClone(draw);
[
  structurallyBalancedButUnapproved.decks[0].slots[0][0],
  structurallyBalancedButUnapproved.decks[0].slots[3][0],
] = [
  structurallyBalancedButUnapproved.decks[0].slots[3][0],
  structurallyBalancedButUnapproved.decks[0].slots[0][0],
];
assert.equal(
  validateCompetitionDrawPayload(
    structurallyBalancedButUnapproved,
    bank.stages
  ).valid,
  true
);
assert.equal(
  await validateCompetitionDrawIntegrity(structurallyBalancedButUnapproved),
  false,
  "structurally balanced but unapproved sets must fail canonical hash verification"
);

console.log("==== COMPETITION DRAW TEST: PASS ====");
