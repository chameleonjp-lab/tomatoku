import { STAGES } from "./stages.js";
import { buildRandomStageSets } from "./game.js";
import {
  RANDOM_STAGE_BANK_FEATURE,
  getStageBankDescriptor,
} from "./stage-bank-config.js";
import {
  VARIABLE_STAGE_BANK_STATUS,
  validateVariableStageBank,
} from "./variable-stage-contract.js";
import {
  COMPETITION_DECKS_SHA256,
  COMPETITION_DRAW_ID,
  COMPETITION_MAX_DIFFICULTY_RATIO,
  COMPETITION_STAGE_BANK_ID,
} from "./competition-sets.js";

export const PRACTICE_STAGE_BANK_URL = new URL(
  "../generated/variable-stage-bank-v2.json",
  import.meta.url
).href;
export const PRACTICE_STAGE_BANK_TIMEOUT_MS = 8000;
export const RANDOM_STAGE_BANK_URL = PRACTICE_STAGE_BANK_URL;
export const RANDOM_STAGE_BANK_TIMEOUT_MS = PRACTICE_STAGE_BANK_TIMEOUT_MS;
export const COMPETITION_DRAW_URL = new URL(
  "../generated/balanced-official-draw-v1.json",
  import.meta.url
).href;

function fallbackResult(reason, feature = RANDOM_STAGE_BANK_FEATURE) {
  const descriptor = getStageBankDescriptor(feature.fallbackBankId);
  return {
    bankId: descriptor.id,
    stages: STAGES,
    competitionSets: null,
    fallback: true,
    fallbackReason: reason,
  };
}

function stageSolutionSignature(stage) {
  return stage.solution.map((position) => position[1]).join(",");
}

export function validateCompetitionDrawPayload(draw, stageBank) {
  const problems = [];
  if (!draw || typeof draw !== "object" || Array.isArray(draw)) {
    return { valid: false, problems: ["competition draw must be an object"] };
  }
  if (draw.schemaVersion !== 1) problems.push("competition draw schemaVersion must be 1");
  if (draw.id !== COMPETITION_DRAW_ID) {
    problems.push(`competition draw id must be ${COMPETITION_DRAW_ID}`);
  }
  if (draw.sourceBankId !== COMPETITION_STAGE_BANK_ID) {
    problems.push(`competition source bank must be ${COMPETITION_STAGE_BANK_ID}`);
  }
  if (
    draw.verification?.decksCanonicalSha256 !== COMPETITION_DECKS_SHA256
  ) {
    problems.push("competition draw hash does not match the approved fixture");
  }
  if (!Array.isArray(stageBank)) problems.push("competition stage bank must be an array");
  if (!Array.isArray(draw.decks) || draw.decks.length < 1) {
    problems.push("competition draw must provide decks");
  }
  if (problems.length) return { valid: false, problems };

  const stageById = new Map(stageBank.map((stage) => [stage.id, stage]));
  const stagesByDifficulty = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (const stage of stageBank) {
    stagesByDifficulty[stage.difficulty]?.add(stage.id);
  }
  const allTriples = new Set();
  const allStageCounts = new Map(stageBank.map((stage) => [stage.id, 0]));
  const competitionSets = [];
  let minimumScore = Infinity;
  let maximumScore = -Infinity;

  draw.decks.forEach((deck, deckIndex) => {
    if (!deck || !Array.isArray(deck.slots)) {
      problems.push(`decks[${deckIndex}] must provide slots`);
      return;
    }
    const perDifficulty = { 1: new Set(), 2: new Set(), 3: new Set() };
    for (const [slotIndex, slot] of deck.slots.entries()) {
      if (!Array.isArray(slot) || slot.length !== 4) {
        problems.push(`decks[${deckIndex}].slots[${slotIndex}] is invalid`);
        continue;
      }
      const ids = slot.slice(0, 3).map(String);
      const score = Number(slot[3]);
      const stages = ids.map((id) => stageById.get(id));
      if (stages.some((stage) => !stage)) {
        problems.push(`decks[${deckIndex}].slots[${slotIndex}] has an unknown stage`);
        continue;
      }
      if (!stages.every((stage, index) => stage.difficulty === index + 1)) {
        problems.push(`decks[${deckIndex}].slots[${slotIndex}] difficulty order is invalid`);
      }
      if (
        stageSolutionSignature(stages[0]) === stageSolutionSignature(stages[1]) ||
        stageSolutionSignature(stages[1]) === stageSolutionSignature(stages[2])
      ) {
        problems.push(`decks[${deckIndex}].slots[${slotIndex}] repeats an adjacent solution`);
      }
      const tripleKey = ids.join("|");
      if (allTriples.has(tripleKey)) {
        problems.push(`duplicate competition triple: ${tripleKey}`);
      }
      allTriples.add(tripleKey);
      stages.forEach((stage) => {
        perDifficulty[stage.difficulty].add(stage.id);
        allStageCounts.set(stage.id, (allStageCounts.get(stage.id) || 0) + 1);
      });
      if (!Number.isInteger(score) || score <= 0) {
        problems.push(`decks[${deckIndex}].slots[${slotIndex}] score is invalid`);
      } else {
        minimumScore = Math.min(minimumScore, score);
        maximumScore = Math.max(maximumScore, score);
      }
      competitionSets.push(Object.freeze(ids));
    }
    for (const difficulty of [1, 2, 3]) {
      const expected = stagesByDifficulty[difficulty];
      const actual = perDifficulty[difficulty];
      if (
        actual.size !== expected.size ||
        [...expected].some((stageId) => !actual.has(stageId))
      ) {
        problems.push(`decks[${deckIndex}] does not use every difficulty ${difficulty} stage once`);
      }
    }
  });

  const expectedAppearances = draw.decks.length;
  for (const [stageId, count] of allStageCounts) {
    if (count !== expectedAppearances) {
      problems.push(`${stageId} must appear ${expectedAppearances} times; got ${count}`);
    }
  }
  if (
    !Number.isFinite(minimumScore) ||
    !Number.isFinite(maximumScore) ||
    maximumScore / minimumScore > COMPETITION_MAX_DIFFICULTY_RATIO
  ) {
    problems.push("competition difficulty ratio exceeds the approved limit");
  }

  return {
    valid: problems.length === 0,
    problems,
    competitionSets,
    minimumScore,
    maximumScore,
  };
}

async function sha256Hex(value) {
  if (
    !globalThis.crypto?.subtle ||
    typeof globalThis.TextEncoder !== "function"
  ) {
    return null;
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function validateCompetitionDrawIntegrity(draw) {
  if (!draw || !Array.isArray(draw.decks)) return false;
  const actual = await sha256Hex(JSON.stringify(draw.decks));
  return actual === COMPETITION_DECKS_SHA256;
}

export function validatePracticeStageBankPayload(
  bank,
  feature = RANDOM_STAGE_BANK_FEATURE
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
  if (bank.rankingEligible !== true) {
    problems.push("random bank rankingEligible must be true");
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
        buildRandomStageSets(bank.stages);
      } catch (_) {
        problems.push("random bank must provide a valid difficulty 1-2-3 set");
      }
    }
  }

  return { valid: problems.length === 0, problems };
}

export async function loadRandomStageBank({
  fetchImpl = globalThis.fetch,
  feature = RANDOM_STAGE_BANK_FEATURE,
  url = RANDOM_STAGE_BANK_URL,
  drawUrl = COMPETITION_DRAW_URL,
  timeoutMs = RANDOM_STAGE_BANK_TIMEOUT_MS,
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
      const options = {
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {}),
      };
      const [bankResponse, drawResponse] = await Promise.all([
        fetchImpl(url, options),
        fetchImpl(drawUrl, options),
      ]);
      if (!bankResponse?.ok || !drawResponse?.ok) return { type: "http-error" };
      return {
        type: "bank",
        bank: await bankResponse.json(),
        draw: await drawResponse.json(),
      };
    })
    .catch(() => ({ type: timedOut ? "timeout" : "network-error" }));

  try {
    const outcome = await Promise.race([request, timeout]);
    if (outcome.type !== "bank") {
      return fallbackResult(outcome.type, feature);
    }

    const validation = validatePracticeStageBankPayload(outcome.bank, feature);
    if (!validation.valid) return fallbackResult("invalid-bank", feature);
    const drawValidation = validateCompetitionDrawPayload(
      outcome.draw,
      outcome.bank.stages
    );
    if (!drawValidation.valid) return fallbackResult("invalid-draw", feature);
    if (!(await validateCompetitionDrawIntegrity(outcome.draw))) {
      return fallbackResult("invalid-draw", feature);
    }

    return {
      bankId: outcome.bank.id,
      stages: outcome.bank.stages,
      competitionSets: drawValidation.competitionSets,
      fallback: false,
      fallbackReason: null,
    };
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}

export function createRandomStageBankLoader({
  load = loadRandomStageBank,
} = {}) {
  if (typeof load !== "function") {
    throw new TypeError("random stage bank loader must be a function");
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

/** 既存の開発用呼び出し名との互換。 */
export const loadPracticeStageBank = loadRandomStageBank;
export const createPracticeStageBankLoader = createRandomStageBankLoader;
