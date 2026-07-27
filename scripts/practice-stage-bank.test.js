import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_PRACTICE_STAGE_BANK_ID,
  ACTIVE_STAGE_BANK_ID,
  PRACTICE_STAGE_BANK_FEATURE,
  assertPracticeStageBankRouting,
  getStageBankDescriptor,
  resolveActivePracticeStageBankId,
} from "../src/stage-bank-config.js";
import {
  GAME_MODE,
  GameSession,
  OFFICIAL_STAGE_IDS,
  solutionSignature,
} from "../src/game.js";
import {
  PRACTICE_STAGE_BANK_TIMEOUT_MS,
  createPracticeStageBankLoader,
  loadPracticeStageBank,
  validatePracticeStageBankPayload,
} from "../src/practice-stage-bank.js";
import { STAGES } from "../src/stages.js";

const finalBank = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../generated/variable-stage-bank-v2.json", import.meta.url)
    ),
    "utf8"
  )
);

const ENABLED_PRACTICE_FEATURE = Object.freeze({
  ...PRACTICE_STAGE_BANK_FEATURE,
  enabled: true,
});
const DISABLED_PRACTICE_FEATURE = Object.freeze({
  ...PRACTICE_STAGE_BANK_FEATURE,
  enabled: false,
});

let pass = 0;
async function test(name, fn) {
  await fn();
  pass++;
  console.log(`✓ ${name}`);
}

function response(body, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return structuredClone(body);
    },
  };
}

await test("公式バンクと練習バンクのactive IDを分離", async () => {
  assert.equal(ACTIVE_STAGE_BANK_ID, "legacy-v1");
  assert.equal(
    ACTIVE_PRACTICE_STAGE_BANK_ID,
    resolveActivePracticeStageBankId()
  );
  assert.equal(
    resolveActivePracticeStageBankId(ENABLED_PRACTICE_FEATURE),
    PRACTICE_STAGE_BANK_FEATURE.primaryBankId
  );
  assert.equal(
    resolveActivePracticeStageBankId(DISABLED_PRACTICE_FEATURE),
    PRACTICE_STAGE_BANK_FEATURE.fallbackBankId
  );
  assert.equal(PRACTICE_STAGE_BANK_FEATURE.fallbackBankId, "legacy-v1");
  assert.equal(assertPracticeStageBankRouting(), true);
});

await test("完成バンクpayloadは練習専用runtime契約へ合格", async () => {
  const validation = validatePracticeStageBankPayload(finalBank);
  assert.equal(validation.valid, true, validation.problems.join("; "));
  assert.equal(finalBank.runtimeEnabled, true);
  assert.equal(finalBank.rankingEligible, false);
  assert.equal(finalBank.status, "active-practice-only");
  assert.equal(finalBank.stageCount, 84);
});

await test("difficulty欠落・分布不正は完成bankとして受け付けない", async () => {
  const missingDifficulty = structuredClone(finalBank);
  delete missingDifficulty.stages[0].difficulty;
  const missingValidation =
    validatePracticeStageBankPayload(missingDifficulty);
  assert.equal(missingValidation.valid, false);
  assert.ok(
    missingValidation.problems.some((problem) =>
      problem.includes("difficulty is required")
    )
  );

  const wrongDistribution = structuredClone(finalBank);
  wrongDistribution.stages[0].difficulty = 2;
  const distributionValidation =
    validatePracticeStageBankPayload(wrongDistribution);
  assert.equal(distributionValidation.valid, false);
  assert.ok(
    distributionValidation.problems.some((problem) =>
      problem.includes("difficulty 1 count")
    )
  );
});

await test("成功時は完成84問を返す", async () => {
  const result = await loadPracticeStageBank({
    feature: ENABLED_PRACTICE_FEATURE,
    fetchImpl: async () => response(finalBank),
  });
  assert.equal(result.bankId, ENABLED_PRACTICE_FEATURE.primaryBankId);
  assert.equal(result.fallback, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.stages.length, 84);
  assert.ok(result.stages.every((stage) => stage.id.startsWith("STG-")));
});

await test("feature gate無効時はfetchせず旧30問へ戻る", async () => {
  let fetchCount = 0;
  const result = await loadPracticeStageBank({
    feature: DISABLED_PRACTICE_FEATURE,
    fetchImpl: async () => {
      fetchCount++;
      return response(finalBank);
    },
  });
  assert.equal(fetchCount, 0);
  assert.equal(result.bankId, "legacy-v1");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "feature-disabled");
  assert.equal(result.stages, STAGES);
});

await test("HTTP失敗・不正bank・通信例外は旧30問へフォールバック", async () => {
  const missingDifficulty = structuredClone(finalBank);
  missingDifficulty.stages.forEach((stage) => {
    delete stage.difficulty;
  });
  const cases = [
    [async () => response({}, { ok: false }), "http-error"],
    [async () => response({ ...finalBank, stageCount: 83 }), "invalid-bank"],
    [async () => response(missingDifficulty), "invalid-bank"],
    [async () => { throw new Error("offline"); }, "network-error"],
  ];
  for (const [fetchImpl, reason] of cases) {
    const result = await loadPracticeStageBank({
      feature: ENABLED_PRACTICE_FEATURE,
      fetchImpl,
    });
    assert.equal(result.bankId, "legacy-v1");
    assert.equal(result.fallback, true);
    assert.equal(result.fallbackReason, reason);
    assert.equal(result.stages, STAGES);
  }
});

await test("応答が停止しても時間切れで旧30問へ戻る", async () => {
  const result = await loadPracticeStageBank({
    feature: ENABLED_PRACTICE_FEATURE,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
      }),
  });
  assert.equal(PRACTICE_STAGE_BANK_TIMEOUT_MS, 8000);
  assert.equal(result.bankId, "legacy-v1");
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, "timeout");
});

await test("一時fallbackは次回再試行し、有効bankだけを再利用", async () => {
  let loadCount = 0;
  const validResult = {
    bankId: finalBank.id,
    stages: finalBank.stages,
    fallback: false,
    fallbackReason: null,
  };
  const ensure = createPracticeStageBankLoader({
    load: async () => {
      loadCount++;
      if (loadCount === 1) {
        return {
          bankId: "legacy-v1",
          stages: STAGES,
          fallback: true,
          fallbackReason: "network-error",
        };
      }
      return validResult;
    },
  });

  const first = await ensure();
  const second = await ensure();
  const third = await ensure();
  assert.equal(first.fallbackReason, "network-error");
  assert.equal(second, validResult);
  assert.equal(third, validResult);
  assert.equal(loadCount, 2);
});

await test("feature-disabled fallbackはページ内で再利用", async () => {
  let loadCount = 0;
  const disabledResult = {
    bankId: "legacy-v1",
    stages: STAGES,
    fallback: true,
    fallbackReason: "feature-disabled",
  };
  const ensure = createPracticeStageBankLoader({
    load: async () => {
      loadCount++;
      return disabledResult;
    },
  });

  assert.equal(await ensure(), disabledResult);
  assert.equal(await ensure(), disabledResult);
  assert.equal(loadCount, 1);
});

await test("完成bankを注入した練習セッションは難易度1→2→3", async () => {
  const session = new GameSession("A", () => 0.42, {
    mode: GAME_MODE.PRACTICE,
    playId: "practice-final",
    practiceStageBank: finalBank.stages,
    practiceStageBankId: finalBank.id,
    practiceStageBankFallback: false,
  });
  assert.equal(session.stageBankId, finalBank.id);
  assert.equal(session.stageBankFallback, false);
  assert.deepEqual(session.stages.map((stage) => stage.difficulty), [1, 2, 3]);
  assert.ok(session.stages.every((stage) => stage.id.startsWith("STG-")));
  assert.equal(new Set(session.stages.map((stage) => stage.id)).size, 3);
  assert.equal(new Set(session.stages.map(solutionSignature)).size, 3);
});

await test("公式セッションは練習bankを渡しても固定3問", async () => {
  const session = new GameSession("A", () => 0.42, {
    mode: GAME_MODE.OFFICIAL,
    playId: "official-isolated",
    practiceStageBank: finalBank.stages,
    practiceStageBankId: finalBank.id,
  });
  assert.equal(session.stageBankId, "legacy-v1");
  assert.deepEqual(session.stages.map((stage) => stage.id), OFFICIAL_STAGE_IDS);
});

await test("完成bank descriptorは練習runtimeのみ有効", async () => {
  const descriptor = getStageBankDescriptor(
    PRACTICE_STAGE_BANK_FEATURE.primaryBankId
  );
  assert.equal(descriptor.runtimeEnabled, true);
  assert.equal(descriptor.rankingEligible, false);
  assert.equal(descriptor.status, "active-practice-only");
  assert.equal(descriptor.stageCount, 84);
});

console.log(`\n==== PRACTICE STAGE BANK TEST: PASS=${pass} FAIL=0 ====`);
