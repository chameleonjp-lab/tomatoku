import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVariableRegionFeasibilityManifest,
  regionSizeProfile,
  solveVariableRegionGrid,
  validateVariableRegionGrid,
} from "./variable-feasibility.js";
import {
  ACTIVE_STAGE_BANK_ID,
  STAGE_BANK_CATALOG,
  assertCandidateBankRemainsInactive,
} from "../../src/stage-bank-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const committed = JSON.parse(
  readFileSync(
    resolve(ROOT, "generated/stage-bank-variable-feasibility-v2.json"),
    "utf8"
  )
);

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const small = buildVariableRegionFeasibilityManifest({
  requiredCanonicalTarget: 5,
  minRegionSize: 4,
  maxRegionSize: 6,
});

test("4〜6マスの最小緩和で5問の存在証拠を生成", () => {
  assert.equal(small.targetFeasible, true);
  assert.equal(small.canonicalStageCount, 5);
  assert.equal(small.patternsVisited, 1);
  assert.equal(small.connectedPartitionCountVisited, 2826);
  assert.equal(small.uniqueSolutionCountVisited, 5);
});

test("最初の正解配置の候補領域数をfixture化", () => {
  assert.deepEqual(small.patternAudits[0].candidateRegionCounts, [66, 516, 197, 409, 142]);
  assert.equal(small.patternAudits[0].patternSignature, "0,2,4,1,3");
});

test("全証拠盤面が4〜6マス・連結・一意解", () => {
  for (const stage of small.canonicalStages) {
    const validation = validateVariableRegionGrid(stage.regions, {
      minRegionSize: 4,
      maxRegionSize: 6,
    });
    assert.deepEqual(validation, { valid: true, problems: [] });
    assert.deepEqual(regionSizeProfile(stage.regions), stage.regionSizes);
    const solved = solveVariableRegionGrid(stage.regions, {
      minRegionSize: 4,
      maxRegionSize: 6,
    });
    assert.equal(solved.unique, true);
    assert.deepEqual(
      solved.firstSolution.map((col, row) => [row, col]),
      stage.solution
    );
  }
});

test("同じ条件から同じ小型manifestを再現", () => {
  assert.deepEqual(
    buildVariableRegionFeasibilityManifest({
      requiredCanonicalTarget: 5,
      minRegionSize: 4,
      maxRegionSize: 6,
    }),
    small
  );
});

test("コミット済み84問manifestの実測値を固定", () => {
  assert.equal(committed.auditMode, "threshold-witness");
  assert.equal(committed.exhaustive, false);
  assert.equal(committed.requiredCanonicalTarget, 84);
  assert.equal(committed.targetFeasible, true);
  assert.equal(committed.canonicalStageCount, 84);
  assert.equal(committed.patternsVisited, 1);
  assert.equal(committed.connectedPartitionCountVisited, 9524);
  assert.equal(committed.uniqueSolutionCountVisited, 84);
  assert.deepEqual(committed.profileDistribution, {
    "4-5-5-5-6": 19,
    "4-4-5-6-6": 65,
  });
  assert.equal(new Set(committed.canonicalStages.map((stage) => stage.stageId)).size, 84);
});

test("コミット済み84問すべてが可変サイズ契約を満たす", () => {
  for (const stage of committed.canonicalStages) {
    assert.deepEqual(
      validateVariableRegionGrid(stage.regions, {
        minRegionSize: 4,
        maxRegionSize: 6,
      }),
      { valid: true, problems: [] }
    );
    const solved = solveVariableRegionGrid(stage.regions, {
      minRegionSize: 4,
      maxRegionSize: 6,
    });
    assert.equal(solved.unique, true);
    assert.deepEqual(
      solved.firstSolution.map((col, row) => [row, col]),
      stage.solution
    );
  }
});

test("完成バンクが現行で可変候補は契約承認待ち", () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "candidate-v2-variable-4-6-final");
  const variable = STAGE_BANK_CATALOG["candidate-v2-variable-4-6"];
  assert.equal(variable.witnessedCanonicalStageCount, 84);
  assert.equal(variable.runtimeEnabled, false);
  assert.equal(variable.rankingEligible, false);
  assert.equal(variable.status, "contract-proposed-pending-approval");
  assert.equal(assertCandidateBankRemainsInactive(), true);
});

test("成立しないサイズ範囲を拒否", () => {
  assert.throws(
    () =>
      buildVariableRegionFeasibilityManifest({
        requiredCanonicalTarget: 1,
        minRegionSize: 6,
        maxRegionSize: 7,
      }),
    /cannot cover/
  );
});

console.log(`\n==== VARIABLE REGION FEASIBILITY TEST: PASS=${pass} FAIL=0 ====`);
