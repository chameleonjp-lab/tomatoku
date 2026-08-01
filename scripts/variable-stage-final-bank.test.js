import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_PRACTICE_STAGE_BANK_ID,
  ACTIVE_STAGE_BANK_ID,
  PRACTICE_STAGE_BANK_FEATURE,
  assertCandidateBankRemainsInactive,
  assertPracticeStageBankRouting,
  getStageBankDescriptor,
  resolveActivePracticeStageBankId,
} from "../src/stage-bank-config.js";
import {
  assertVariableStageFinalBank,
  buildVariableStageFinalBank,
  sha256Hex,
  VARIABLE_FINAL_BANK_GENERATOR_VERSION,
  VARIABLE_FINAL_BANK_ID,
  VARIABLE_FINAL_BANK_STAGE_COUNT,
  VARIABLE_FINAL_BANK_STATUS,
} from "./generator-v2/variable-final-bank.js";

const candidatePoolSource = readFileSync(
  fileURLToPath(
    new URL("../generated/variable-stage-candidate-pool-v2.json", import.meta.url)
  )
);
const reviewSource = readFileSync(
  fileURLToPath(
    new URL(
      "../review/decisions/variable-stage-review-round1.json",
      import.meta.url
    )
  )
);
const committedSource = readFileSync(
  fileURLToPath(
    new URL("../generated/variable-stage-bank-v2.json", import.meta.url)
  )
);

const candidatePool = JSON.parse(candidatePoolSource.toString("utf8"));
const review = JSON.parse(reviewSource.toString("utf8"));
const committed = JSON.parse(committedSource.toString("utf8"));
const rebuilt = buildVariableStageFinalBank({
  candidatePool,
  review,
  candidatePoolSha256: sha256Hex(candidatePoolSource),
  reviewSha256: sha256Hex(reviewSource),
});

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const keepIds = Object.entries(review.decisions)
  .filter(([, decision]) => decision.status === "keep")
  .map(([id]) => id)
  .sort();
const finalIds = committed.stages.map((stage) => stage.id).sort();

const expectedDistanceOnePairs = [
  ["STG-0385e52f", "STG-8e3e7a46"],
  ["STG-07455e25", "STG-c551c232"],
  ["STG-246317db", "STG-8e3e7a46"],
  ["STG-75e7cc16", "STG-bda38a0d"],
  ["STG-75e7cc16", "STG-ee9efd5b"],
  ["STG-8c4df48e", "STG-ba446d6d"],
  ["STG-8e3e7a46", "STG-e48d77b6"],
  ["STG-a6649fc6", "STG-edb742a5"],
  ["STG-bb3d9d29", "STG-ee9efd5b"],
].sort(([leftA, leftB], [rightA, rightB]) =>
  `${leftA}|${leftB}`.localeCompare(`${rightA}|${rightB}`)
);

test("完成バンクはレビューkeep 84問だけを含む", () => {
  assert.equal(committed.stageCount, VARIABLE_FINAL_BANK_STAGE_COUNT);
  assert.equal(committed.stages.length, VARIABLE_FINAL_BANK_STAGE_COUNT);
  assert.equal(committed.rejectedStageCount, 24);
  assert.deepEqual(finalIds, keepIds);
});

test("完成バンク状態と生成器versionを固定", () => {
  assert.equal(committed.id, VARIABLE_FINAL_BANK_ID);
  assert.equal(committed.status, VARIABLE_FINAL_BANK_STATUS);
  assert.equal(committed.generatorVersion, VARIABLE_FINAL_BANK_GENERATOR_VERSION);
  assert.equal(committed.runtimeEnabled, true);
  assert.equal(committed.rankingEligible, true);
  assert.equal(committed.stageSchemaVersion, 2);
});

test("候補プールとレビューJSONのSHA-256を出典として固定", () => {
  assert.deepEqual(committed.sourceCandidatePool, {
    path: "generated/variable-stage-candidate-pool-v2.json",
    generatorVersion: candidatePool.generatorVersion,
    sha256: sha256Hex(candidatePoolSource),
  });
  assert.deepEqual(committed.sourceReview, {
    path: "review/decisions/variable-stage-review-round1.json",
    schemaVersion: review.schemaVersion,
    exportedAt: review.exportedAt,
    sha256: sha256Hex(reviewSource),
  });
});

test("完成バンクは専用validatorへ合格", () => {
  assert.equal(assertVariableStageFinalBank(committed), committed);
});

test("完成バンク分布を34・33・17 / 28均等 / 61・23で固定", () => {
  assert.deepEqual(committed.distribution, {
    symmetryClass: {
      "SC-3a178cba": 17,
      "SC-95390462": 34,
      "SC-be359992": 33,
    },
    difficulty: { 1: 28, 2: 28, 3: 28 },
    regionProfile: {
      "4-4-5-6-6": 61,
      "4-5-5-5-6": 23,
    },
  });
});

test("距離1例外は希少クラス内の9組だけ", () => {
  assert.equal(committed.minimumPairDistance, 1);
  assert.equal(committed.distanceOnePairCount, 9);
  assert.deepEqual(committed.distanceOnePairs, expectedDistanceOnePairs);
  for (const [leftId, rightId] of committed.distanceOnePairs) {
    assert.equal(committed.metadata[leftId].symmetryClassId, "SC-3a178cba");
    assert.equal(committed.metadata[rightId].symmetryClassId, "SC-3a178cba");
  }
});

test("完成バンクmetadataは84問だけを完全にカバー", () => {
  assert.deepEqual(Object.keys(committed.metadata).sort(), finalIds);
  assert.ok(
    committed.stages.every(
      (stage) => committed.metadata[stage.id].difficultyLevel === stage.difficulty
    )
  );
});

test("同じ入力からコミット済みmanifestを完全再現", () => {
  assert.deepEqual(committed, rebuilt);
  assert.equal(
    committedSource.toString("utf8"),
    `${JSON.stringify(rebuilt, null, 2)}\n`
  );
});

test("bank catalogは完成バンクを公式・練習共通として登録", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, VARIABLE_FINAL_BANK_ID);
  assert.equal(
    ACTIVE_PRACTICE_STAGE_BANK_ID,
    resolveActivePracticeStageBankId(PRACTICE_STAGE_BANK_FEATURE)
  );
  const descriptor = getStageBankDescriptor(VARIABLE_FINAL_BANK_ID);
  assert.equal(descriptor.source, "generated/variable-stage-bank-v2.json");
  assert.equal(descriptor.stageCount, 84);
  assert.equal(descriptor.status, VARIABLE_FINAL_BANK_STATUS);
  assert.equal(descriptor.runtimeEnabled, true);
  assert.equal(descriptor.rankingEligible, true);
  assert.equal(assertCandidateBankRemainsInactive(), true);
  assert.equal(assertPracticeStageBankRouting(), true);
});

console.log(`\n==== VARIABLE FINAL BANK TEST: PASS=${pass} FAIL=0 ====`);
