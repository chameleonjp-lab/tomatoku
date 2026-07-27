import { STAGES } from "./stages.js";
import { buildPracticeStageSets } from "./game.js";
import {
  PRACTICE_STAGE_BANK_FEATURE,
  getStageBankDescriptor,
} from "./stage-bank-config.js";
import {
  VARIABLE_STAGE_BANK_STATUS,
  validateVariableStageBank,
} from "./variable-stage-contract.js";

export const PRACTICE_STAGE_BANK_URL = new URL(
  "../generated/variable-stage-bank-v2.json",
  import.meta.url
).href;
export const PRACTICE_STAGE_BANK_TIMEOUT_MS = 8000;

function fallbackResult(reason, feature = PRACTICE_STAGE_BANK_FEATURE) {
  const descriptor = getStageBankDescriptor(feature.fallbackBankId);
  return {
    bankId: descriptor.id,
    stages: STAGES,
    fallback: true,
    fallbackReason: reason,
  };
}

export function validatePracticeStageBankPayload(
  bank,
  feature = PRACTICE_STAGE_BANK_FEATURE
) {
  const descriptor = getStageBankDescriptor(feature.primaryBankId);
  const problems = [];

  if (!bank || typeof bank !== "object" || Array.isArray(bank)) {
    return { valid: false, problems: ["practice bank must be an object"] };
  }
  if (bank.id !== descriptor.id) {
    problems.push(`practice bank id must be ${descriptor.id}`);
  }
  if (bank.status !== descriptor.status) {
    problems.push(`practice bank status must be ${descriptor.status}`);
  }
  if (bank.runtimeEnabled !== true) {
    problems.push("practice bank runtimeEnabled must be true");
  }
  if (bank.rankingEligible !== false) {
    problems.push("practice bank rankingEligible must be false");
  }
  if (bank.stageCount !== descriptor.stageCount) {
    problems.push(`practice bank stageCount must be ${descriptor.stageCount}`);
  }
  if (!Array.isArray(bank.stages) || bank.stages.length !== descriptor.stageCount) {
    problems.push("practice bank stages must match stageCount");
  }

  if (Array.isArray(bank.stages)) {
    const validation = validateVariableStageBank(
      {
        ...bank,
        status: VARIABLE_STAGE_BANK_STATUS,
        runtimeEnabled: false,
        rankingEligible: false,
      },
      { minimumStageCount: descriptor.stageCount }
    );
    problems.push(...validation.problems);

    const difficultyCounts = { 1: 0, 2: 0, 3: 0 };
    bank.stages.forEach((stage, index) => {
      if (![1, 2, 3].includes(stage?.difficulty)) {
        problems.push(`stages[${index}]: difficulty is required`);
        return;
      }
      difficultyCounts[stage.difficulty]++;
    });

    const expectedDistribution = descriptor.difficultyDistribution || {};
    for (const difficulty of [1, 2, 3]) {
      const expected = Number(expectedDistribution[difficulty]);
      if (
        Number.isInteger(expected) &&
        difficultyCounts[difficulty] !== expected
      ) {
        problems.push(
          `difficulty ${difficulty} count must be ${expected}; got ${difficultyCounts[difficulty]}`
        );
      }
    }

    if (!problems.length) {
      try {
        buildPracticeStageSets(bank.stages);
      } catch (_) {
        problems.push("practice bank must provide a valid difficulty 1-2-3 set");
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

export async function loadPracticeStageBank({
  fetchImpl = globalThis.fetch,
  feature = PRACTICE_STAGE_BANK_FEATURE,
  url = PRACTICE_STAGE_BANK_URL,
  timeoutMs = PRACTICE_STAGE_BANK_TIMEOUT_MS,
} = {}) {
  if (!feature.enabled) return fallbackResult("feature-disabled", feature);
  if (typeof fetchImpl !== "function") {
    return fallbackResult("fetch-unavailable", feature);
  }

  const parsedTimeoutMs = Number(timeoutMs);
  const safeTimeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : PRACTICE_STAGE_BANK_TIMEOUT_MS;
  const controller =
    typeof globalThis.AbortController === "function"
      ? new globalThis.AbortController()
      : null;
  let timeoutId = null;
  let timedOut = false;

  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({ type: "timeout" });
      if (controller) controller.abort();
    }, safeTimeoutMs);
  });
  const request = Promise.resolve()
    .then(async () => {
      const response = await fetchImpl(url, {
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response || !response.ok) return { type: "http-error" };
      return { type: "bank", bank: await response.json() };
    })
    .catch(() => ({ type: timedOut ? "timeout" : "network-error" }));

  try {
    const outcome = await Promise.race([request, timeout]);
    if (outcome.type !== "bank") {
      return fallbackResult(outcome.type, feature);
    }

    const validation = validatePracticeStageBankPayload(outcome.bank, feature);
    if (!validation.valid) return fallbackResult("invalid-bank", feature);

    return {
      bankId: outcome.bank.id,
      stages: outcome.bank.stages,
      fallback: false,
      fallbackReason: null,
    };
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

export function createPracticeStageBankLoader({
  load = loadPracticeStageBank,
} = {}) {
  if (typeof load !== "function") {
    throw new TypeError("practice stage bank loader must be a function");
  }

  let cachedPromise = null;
  return function ensurePracticeStageBank() {
    if (!cachedPromise) {
      cachedPromise = Promise.resolve()
        .then(() => load())
        .then(
          (result) => {
            if (
              result?.fallback &&
              result.fallbackReason !== "feature-disabled"
            ) {
              cachedPromise = null;
            }
            return result;
          },
          (error) => {
            cachedPromise = null;
            throw error;
          }
        );
    }
    return cachedPromise;
  };
}
