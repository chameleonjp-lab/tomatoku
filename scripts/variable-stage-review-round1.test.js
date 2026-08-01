import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertVariableStageBank,
  validateVariableStage,
} from "../src/variable-stage-contract.js";
import {
  ACTIVE_STAGE_BANK_ID,
  assertCandidateBankRemainsInactive,
} from "../src/stage-bank-config.js";
import { minimumVariableStageDistance } from "./generator-v2/variable-pool.js";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../generated/variable-stage-candidate-pool-v2.json", import.meta.url)
    ),
    "utf8"
  )
);
const review = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../review/decisions/variable-stage-review-round1.json",
        import.meta.url
      )
    ),
    "utf8"
  )
);
const report = readFileSync(
  fileURLToPath(
    new URL("../docs/VARIABLE_STAGE_REVIEW_ROUND1.md", import.meta.url)
  ),
  "utf8"
);

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const stagesById = new Map(manifest.stages.map((stage) => [stage.id, stage]));
const decisions = review.decisions;
const keepIds = Object.entries(decisions)
  .filter(([, decision]) => decision.status === "keep")
  .map(([id]) => id)
  .sort();
const rejectIds = Object.entries(decisions)
  .filter(([, decision]) => decision.status === "reject")
  .map(([id]) => id)
  .sort();
const keptStages = keepIds.map((id) => stagesById.get(id));

function distribution(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return result;
}

function symmetricDistance(left, right) {
  return Math.min(
    minimumVariableStageDistance(left.regions, right.regions),
    minimumVariableStageDistance(right.regions, left.regions)
  );
}

const retainedDistanceOnePairs = [];
for (let leftIndex = 0; leftIndex < keptStages.length; leftIndex++) {
  for (
    let rightIndex = leftIndex + 1;
    rightIndex < keptStages.length;
    rightIndex++
  ) {
    const left = keptStages[leftIndex];
    const right = keptStages[rightIndex];
    if (symmetricDistance(left, right) === 1) {
      retainedDistanceOnePairs.push([left.id, right.id]);
    }
  }
}

const expectedRetainedDistanceOnePairs = [
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

retainedDistanceOnePairs.sort(([leftA, leftB], [rightA, rightB]) =>
  `${leftA}|${leftB}`.localeCompare(`${rightA}|${rightB}`)
);

test("レビューJSONは候補manifestと同じ108問を完全に判断", () => {
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.manifestGeneratorVersion, manifest.generatorVersion);
  assert.equal(review.stageCount, 108);
  assert.equal(Object.keys(decisions).length, 108);
  assert.deepEqual(Object.keys(decisions).sort(), [...stagesById.keys()].sort());
});

test("採用84・除外24・保留0・未判断0", () => {
  assert.equal(keepIds.length, 84);
  assert.equal(rejectIds.length, 24);
  assert.equal(
    Object.values(decisions).filter((decision) => decision.status === "hold")
      .length,
    0
  );
  assert.ok(
    Object.values(decisions).every((decision) =>
      ["keep", "reject"].includes(decision.status)
    )
  );
});

test("判断フィールドと除外根拠はreview schemaに適合", () => {
  for (const [id, decision] of Object.entries(decisions)) {
    assert.ok(stagesById.has(id));
    assert.ok(typeof decision.reason === "string");
    assert.ok(typeof decision.note === "string" && decision.note.length <= 500);
    assert.ok(!Number.isNaN(Date.parse(decision.reviewedAt)));
    if (decision.status === "reject") {
      assert.equal(decision.reason, "near-duplicate");
      const representative = decision.note.match(/(STG-[0-9a-f]{8})を代表/);
      assert.ok(representative, `${id} must name a retained representative`);
      assert.equal(decisions[representative[1]]?.status, "keep");
      assert.ok(
        symmetricDistance(stagesById.get(id), stagesById.get(representative[1])) <=
          2,
        `${id} representative must be within distance 2`
      );
    } else {
      assert.equal(decision.reason, "");
    }
  }
});

test("採用84問は独立Stage Schema v2 bank validatorへ合格", () => {
  for (const stage of keptStages) {
    const validation = validateVariableStage(stage);
    assert.equal(validation.valid, true, `${stage.id}: ${validation.problems}`);
  }
  assertVariableStageBank({
    schemaVersion: 1,
    id: "candidate-v2-variable-4-6-round1",
    status: "contract-proposed-pending-approval",
    runtimeEnabled: false,
    rankingEligible: false,
    stages: keptStages,
  });
});

test("採用84問の対称クラス分布は34・33・17", () => {
  assert.deepEqual(
    distribution(keepIds.map((id) => manifest.metadata[id].symmetryClassId)),
    {
      "SC-95390462": 34,
      "SC-be359992": 33,
      "SC-3a178cba": 17,
    }
  );
});

test("採用84問の難易度は28・28・28", () => {
  assert.deepEqual(
    distribution(keptStages.map((stage) => String(stage.difficulty))),
    { 1: 28, 2: 28, 3: 28 }
  );
});

test("採用84問のサイズ構成は61・23", () => {
  assert.deepEqual(
    distribution(keepIds.map((id) => manifest.metadata[id].regionProfile)),
    {
      "4-4-5-6-6": 61,
      "4-5-5-5-6": 23,
    }
  );
});

test("距離1例外は希少クラス内の明示した9組だけ", () => {
  assert.deepEqual(
    retainedDistanceOnePairs,
    expectedRetainedDistanceOnePairs
  );
  for (const [leftId, rightId] of retainedDistanceOnePairs) {
    assert.equal(manifest.metadata[leftId].symmetryClassId, "SC-3a178cba");
    assert.equal(manifest.metadata[rightId].symmetryClassId, "SC-3a178cba");
  }
});

test("共通2クラスには距離1の同時採用なし", () => {
  const commonClasses = new Set(["SC-95390462", "SC-be359992"]);
  assert.ok(
    retainedDistanceOnePairs.every(
      ([leftId, rightId]) =>
        !commonClasses.has(manifest.metadata[leftId].symmetryClassId) &&
        !commonClasses.has(manifest.metadata[rightId].symmetryClassId)
    )
  );
});

test("現行完成バンクと候補バンクの安全境界を維持", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "candidate-v2-variable-4-6-final");
  assert.equal(assertCandidateBankRemainsInactive(), true);
});

test("レビュー報告は提案状態と次工程を明記", () => {
  assert.match(report, /AI補助による構造最適化＋盤面ペア視覚確認/);
  assert.match(report, /proposed \/ human approval pending/);
  assert.match(report, /採用\s+84/);
  assert.match(report, /除外\s+24/);
  assert.match(report, /完成バンクmanifest/);
  assert.match(report, /ACTIVE_STAGE_BANK_ID = legacy-v1/);
});

console.log(`\n==== VARIABLE REVIEW ROUND 1 TEST: PASS=${pass} FAIL=0 ====`);
