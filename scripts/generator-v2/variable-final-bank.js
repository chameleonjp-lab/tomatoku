import { createHash } from "node:crypto";
import {
  VARIABLE_STAGE_BANK_STATUS,
  assertVariableStageBank,
} from "../../src/variable-stage-contract.js";
import { minimumVariableStageDistance } from "./variable-pool.js";

export const VARIABLE_FINAL_BANK_ID = "candidate-v2-variable-4-6-final";
export const VARIABLE_FINAL_BANK_STATUS = "active-official-and-practice";
export const VARIABLE_FINAL_BANK_GENERATOR_VERSION =
  "2.9.0-random-official.1";
export const VARIABLE_FINAL_BANK_STAGE_COUNT = 84;

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function distribution(values) {
  const result = {};
  for (const value of values) {
    const key = String(value);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right))
  );
}

function symmetricDistance(left, right) {
  return Math.min(
    minimumVariableStageDistance(left.regions, right.regions),
    minimumVariableStageDistance(right.regions, left.regions)
  );
}

function assertSourceState(candidatePool, review) {
  if (!candidatePool || candidatePool.stageCount !== 108) {
    throw new TypeError("candidate pool must contain exactly 108 stages");
  }
  if (
    candidatePool.runtimeEnabled !== false ||
    candidatePool.rankingEligible !== false
  ) {
    throw new TypeError("candidate pool must remain runtime and ranking disabled");
  }
  if (!review || review.schemaVersion !== 1 || review.stageCount !== 108) {
    throw new TypeError("review must use schemaVersion 1 and cover 108 stages");
  }
  if (review.manifestGeneratorVersion !== candidatePool.generatorVersion) {
    throw new TypeError("review manifestGeneratorVersion must match candidate pool");
  }
}

export function assertVariableStageFinalBank(bank) {
  if (!bank || typeof bank !== "object" || Array.isArray(bank)) {
    throw new TypeError("final bank must be an object");
  }
  if (bank.id !== VARIABLE_FINAL_BANK_ID) {
    throw new TypeError(`final bank id must be ${VARIABLE_FINAL_BANK_ID}`);
  }
  if (bank.status !== VARIABLE_FINAL_BANK_STATUS) {
    throw new TypeError(
      `final bank status must be ${VARIABLE_FINAL_BANK_STATUS}`
    );
  }
  if (bank.runtimeEnabled !== true || bank.rankingEligible !== true) {
    throw new TypeError(
      "final bank must be runtime enabled for official and practice ranking"
    );
  }
  if (bank.stageCount !== VARIABLE_FINAL_BANK_STAGE_COUNT) {
    throw new TypeError(
      `final bank stageCount must be ${VARIABLE_FINAL_BANK_STAGE_COUNT}`
    );
  }
  if (!Array.isArray(bank.stages) || bank.stages.length !== bank.stageCount) {
    throw new TypeError("final bank stages must match stageCount");
  }

  assertVariableStageBank(
    {
      ...bank,
      status: VARIABLE_STAGE_BANK_STATUS,
      runtimeEnabled: false,
      rankingEligible: false,
    },
    { minimumStageCount: VARIABLE_FINAL_BANK_STAGE_COUNT }
  );
  return bank;
}

export function buildVariableStageFinalBank({
  candidatePool,
  review,
  candidatePoolSha256,
  reviewSha256,
  candidatePoolPath = "generated/variable-stage-candidate-pool-v2.json",
  reviewPath = "review/decisions/variable-stage-review-round1.json",
} = {}) {
  assertSourceState(candidatePool, review);

  const stagesById = new Map(
    candidatePool.stages.map((stage) => [stage.id, stage])
  );
  const candidateIds = [...stagesById.keys()].sort();
  const decisionIds = Object.keys(review.decisions || {}).sort();
  if (JSON.stringify(candidateIds) !== JSON.stringify(decisionIds)) {
    throw new TypeError(
      "review decisions must exactly cover the candidate pool IDs"
    );
  }

  const keptIds = decisionIds.filter(
    (id) => review.decisions[id]?.status === "keep"
  );
  const rejectedIds = decisionIds.filter(
    (id) => review.decisions[id]?.status === "reject"
  );
  const unsupported = decisionIds.filter(
    (id) => !["keep", "reject"].includes(review.decisions[id]?.status)
  );
  if (unsupported.length) {
    throw new TypeError(
      `review contains unsupported decisions: ${unsupported.join(", ")}`
    );
  }
  if (
    keptIds.length !== VARIABLE_FINAL_BANK_STAGE_COUNT ||
    rejectedIds.length !== 24
  ) {
    throw new TypeError(
      `review must select 84 keep and 24 reject; got ${keptIds.length}/${rejectedIds.length}`
    );
  }

  const stages = keptIds.map((id) => stagesById.get(id));
  const metadata = Object.fromEntries(
    keptIds.map((id) => [id, candidatePool.metadata[id]])
  );
  if (Object.values(metadata).some((value) => !value)) {
    throw new TypeError("every kept stage must have candidate metadata");
  }

  const distanceOnePairs = [];
  let minimumPairDistance = 25;
  for (let leftIndex = 0; leftIndex < stages.length; leftIndex++) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < stages.length;
      rightIndex++
    ) {
      const left = stages[leftIndex];
      const right = stages[rightIndex];
      const distance = symmetricDistance(left, right);
      minimumPairDistance = Math.min(minimumPairDistance, distance);
      if (distance === 1) distanceOnePairs.push([left.id, right.id]);
    }
  }
  distanceOnePairs.sort(([leftA, leftB], [rightA, rightB]) =>
    `${leftA}|${leftB}`.localeCompare(`${rightA}|${rightB}`)
  );

  const bank = {
    schemaVersion: 1,
    id: VARIABLE_FINAL_BANK_ID,
    status: VARIABLE_FINAL_BANK_STATUS,
    runtimeEnabled: true,
    rankingEligible: true,
    stageSchemaVersion: 2,
    generatorVersion: VARIABLE_FINAL_BANK_GENERATOR_VERSION,
    sourceCandidatePool: {
      path: candidatePoolPath,
      generatorVersion: candidatePool.generatorVersion,
      sha256: candidatePoolSha256,
    },
    sourceReview: {
      path: reviewPath,
      schemaVersion: review.schemaVersion,
      exportedAt: review.exportedAt,
      sha256: reviewSha256,
    },
    boardSize: candidatePool.boardSize,
    constraints: candidatePool.constraints,
    stageCount: stages.length,
    rejectedStageCount: rejectedIds.length,
    minimumPairDistance,
    distanceOnePairCount: distanceOnePairs.length,
    distanceOnePairs,
    distribution: {
      symmetryClass: distribution(
        keptIds.map((id) => metadata[id].symmetryClassId)
      ),
      difficulty: distribution(stages.map((stage) => stage.difficulty)),
      regionProfile: distribution(
        keptIds.map((id) => metadata[id].regionProfile)
      ),
    },
    stages,
    metadata,
  };

  assertVariableStageFinalBank(bank);
  return bank;
}
