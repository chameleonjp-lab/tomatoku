import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_STAGE_BANK_ID,
  STAGE_BANK_CATALOG,
  assertCandidateBankRemainsInactive,
  getStageBankDescriptor,
} from "../../src/stage-bank-config.js";
import { STAGES } from "../../src/stages.js";
import { canonicalizeRegionGrid } from "./regions.js";
import {
  REQUIRED_CANONICAL_TARGET,
  buildStageBankFeasibilityManifest,
  enumeratePatternFeasibility,
} from "./feasibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`✓ ${name}`);
}

const manifest = buildStageBankFeasibilityManifest();

test("14種類の正解配置を全監査", () => {
  assert.equal(manifest.patternCount, 14);
  assert.equal(manifest.patterns.length, 14);
});

test("連結5マス×5領域の分割を21,452件列挙", () => {
  assert.equal(manifest.connectedPartitionCount, 21452);
});

test("一意解付きラベル盤面は36件", () => {
  assert.equal(manifest.uniqueSolutionCount, 36);
});

test("D4とエリア名正規化後の最大数は5", () => {
  assert.equal(manifest.maximumCanonicalStageCount, 5);
  assert.equal(manifest.canonicalStages.length, 5);
  assert.equal(new Set(manifest.canonicalStages.map((stage) => stage.stageId)).size, 5);
});

test("84問目標は現契約では不成立", () => {
  assert.equal(REQUIRED_CANONICAL_TARGET, 84);
  assert.equal(manifest.targetFeasible, false);
  assert.match(manifest.conclusion, /impossible/);
});

test("4配置には一意解盤面が存在しない", () => {
  assert.equal(manifest.unsupportedPatternCount, 4);
  assert.deepEqual(manifest.unsupportedPatternIds, [
    "SP-034477b0",
    "SP-5453e090",
    "SP-5d6caa30",
    "SP-f5f166b0",
  ]);
});

test("各canonical盤面は一意解と安定IDを保持", () => {
  for (const stage of manifest.canonicalStages) {
    assert.match(stage.stageId, /^STG-[0-9a-f]{8}$/);
    assert.equal(stage.regions.length, 5);
    assert.equal(stage.solution.length, 5);
    assert.ok(stage.supportingPatternIds.length >= 2);
  }
});

test("単一配置監査も決定論的", () => {
  const columns = [0, 2, 4, 1, 3];
  const first = enumeratePatternFeasibility(columns);
  const second = enumeratePatternFeasibility(columns);
  assert.deepEqual(first, second);
  assert.equal(first.connectedPartitionCount, 1421);
  assert.equal(first.uniqueSolutionCount, 4);
  assert.equal(first.canonicalStageCount, 4);
});

test("現行30問も同じcanonical 5型へ集約", () => {
  const counts = new Map();
  for (const stage of STAGES) {
    const signature = canonicalizeRegionGrid(stage.regions);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  assert.equal(STAGES.length, 30);
  assert.equal(counts.size, 5);
  assert.deepEqual([...counts.values()].sort((left, right) => right - left), [8, 7, 6, 6, 3]);
});

test("完成バンクが現行でcandidate-v2はBLOCKED", () => {
  const legacy = getStageBankDescriptor("legacy-v1");
  const candidate = STAGE_BANK_CATALOG["candidate-v2"];
  assert.equal(ACTIVE_STAGE_BANK_ID, "candidate-v2-variable-4-6-final");
  assert.equal(legacy.runtimeEnabled, true);
  assert.equal(legacy.rankingEligible, false);
  assert.equal(candidate.runtimeEnabled, false);
  assert.equal(candidate.rankingEligible, false);
  assert.equal(candidate.status, "blocked-by-constraints");
  assert.equal(candidate.requiredCanonicalStageCount, 84);
  assert.equal(candidate.auditedMaximumCanonicalStageCount, 5);
  assert.equal(assertCandidateBankRemainsInactive(), true);
});

test("コミット済みmanifestは全探索結果と完全一致", () => {
  const committed = JSON.parse(
    readFileSync(resolve(ROOT, "generated/stage-bank-feasibility-v2.json"), "utf8")
  );
  assert.deepEqual(committed, manifest);
});

console.log(`\n==== GENERATOR V2 FEASIBILITY TEST: PASS=${pass} FAIL=0 ====`);
