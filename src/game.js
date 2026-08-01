/**
 * トマトオク ゲームロジック (DOM 非依存)
 *
 * v2:
 * - 公式・練習: 共通バンクの有効な難易度1/2/3の組からランダム出題
 * - 記録値: 実時間 + 誤タップ3秒 + ヒント30秒（100分の1秒単位）
 */

import { ACTIVE_RANDOM_STAGE_BANK_ID } from "./stage-bank-config.js";

import { STAGES } from "./stages.js";

export const N = 5;

/** v1互換。v2画面では補正タイムを使用する。 */
export const SCORE = Object.freeze({
  BASE: 180000,
  MISTAKE_PENALTY: 3000,
  HINT_PENALTY: 30000,
});

export const GAME_MODE = Object.freeze({
  OFFICIAL: "official",
  PRACTICE: "practice",
});

export const ADJUSTED_TIME = Object.freeze({
  MISTAKE_CENTISECONDS: 300,
  HINT_CENTISECONDS: 3000,
});

export const SESSION_STATUS = Object.freeze({
  READY: "ready",
  PLAYING: "playing",
  STAGE_TRANSITION: "stageTransition",
  RESULT: "result",
  RETIRED: "retired",
});

export function monotonicNow() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.performance &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function createPlayId() {
  const cryptoObject =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `play-${Date.now().toString(36)}-${random}`;
}

const DIRS8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function solutionSignature(stage) {
  return stage.solution.map((position) => position[1]).join(",");
}

function stagesByDifficulty(stageBank = STAGES) {
  const groups = { 1: [], 2: [], 3: [] };
  for (const stage of stageBank) {
    if (groups[stage.difficulty]) groups[stage.difficulty].push(stage);
  }
  return groups;
}

export function buildRandomStageSets(stageBank = STAGES) {
  if (!Array.isArray(stageBank)) {
    throw new TypeError("ランダムステージバンクは配列である必要があります");
  }
  const groups = stagesByDifficulty(stageBank);
  const sets = [];

  for (const easy of groups[1]) {
    for (const normal of groups[2]) {
      for (const hard of groups[3]) {
        const candidate = [easy, normal, hard];
        if (new Set(candidate.map((stage) => stage.id)).size !== 3) continue;
        if (new Set(candidate.map(solutionSignature)).size !== 3) continue;
        sets.push(candidate);
      }
    }
  }

  if (!sets.length) {
    throw new Error("有効なランダムステージ組を生成できません");
  }
  return sets;
}

/** 既存の開発用呼び出し名との互換。 */
export const buildPracticeStageSets = buildRandomStageSets;

const LEGACY_RANDOM_STAGE_SETS = buildRandomStageSets();
const RANDOM_STAGE_SET_CACHE = new WeakMap();

function randomStageSetsFor(stageBank) {
  if (stageBank === STAGES) return LEGACY_RANDOM_STAGE_SETS;
  if (!Array.isArray(stageBank)) {
    throw new TypeError("ランダムステージバンクは配列である必要があります");
  }
  let sets = RANDOM_STAGE_SET_CACHE.get(stageBank);
  if (!sets) {
    sets = buildRandomStageSets(stageBank);
    RANDOM_STAGE_SET_CACHE.set(stageBank, sets);
  }
  return sets;
}

export function selectRandomStages(rand = Math.random, stageBank = STAGES) {
  const sets = randomStageSetsFor(stageBank);
  const value = Number(rand());
  const normalized = Number.isFinite(value)
    ? Math.min(0.999999999999, Math.max(0, value))
    : 0;
  return sets[Math.floor(normalized * sets.length)];
}

/** 既存の開発用呼び出し名との互換。 */
export function selectPracticeStages(rand = Math.random, stageBank = STAGES) {
  return selectRandomStages(rand, stageBank);
}

/** v1呼び出し名の互換。 */
export function pickStages(rand = Math.random, stageBank = STAGES) {
  return selectRandomStages(rand, stageBank);
}

export function buildRegionMap(regions) {
  const map = new Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      map[r * N + c] = regions[r].charCodeAt(c) - 65;
    }
  }
  return map;
}

export class StageState {
  constructor(stage) {
    this.stage = stage;
    this.regionMap = buildRegionMap(stage.regions);
    this.placed = Array.from({ length: N }, () => new Array(N).fill(false));
    this.count = 0;
    this.cleared = false;
  }

  has(r, c) {
    return this.placed[r][c];
  }

  canPlace(r, c) {
    if (this.placed[r][c]) return { ok: false, reason: "occupied" };
    if (this.count >= N) return { ok: false, reason: "full" };

    for (let cc = 0; cc < N; cc++) {
      if (cc !== c && this.placed[r][cc]) {
        return { ok: false, reason: "row" };
      }
    }
    for (let rr = 0; rr < N; rr++) {
      if (rr !== r && this.placed[rr][c]) {
        return { ok: false, reason: "col" };
      }
    }

    const region = this.regionMap[r * N + c];
    for (let rr = 0; rr < N; rr++) {
      for (let cc = 0; cc < N; cc++) {
        if (
          this.placed[rr][cc] &&
          this.regionMap[rr * N + cc] === region
        ) {
          return { ok: false, reason: "region" };
        }
      }
    }

    for (const [dr, dc] of DIRS8) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      if (this.placed[nr][nc]) {
        return { ok: false, reason: "adjacent" };
      }
    }

    return { ok: true, reason: null };
  }

  place(r, c) {
    if (!this.placed[r][c]) {
      this.placed[r][c] = true;
      this.count++;
    }
  }

  remove(r, c) {
    if (this.placed[r][c]) {
      this.placed[r][c] = false;
      this.count--;
      this.cleared = false;
    }
  }

  tap(r, c) {
    if (this.placed[r][c]) {
      this.remove(r, c);
      return { type: "remove" };
    }

    const check = this.canPlace(r, c);
    if (!check.ok) return { type: "mistake", reason: check.reason };

    this.place(r, c);
    if (this.checkCleared()) this.cleared = true;
    return { type: "place" };
  }

  checkCleared() {
    if (this.count !== N) return false;

    const rows = new Array(N).fill(0);
    const cols = new Array(N).fill(0);
    const regions = new Array(N).fill(0);
    const cells = [];

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!this.placed[r][c]) continue;
        rows[r]++;
        cols[c]++;
        regions[this.regionMap[r * N + c]]++;
        cells.push([r, c]);
      }
    }

    if (rows.some((value) => value !== 1)) return false;
    if (cols.some((value) => value !== 1)) return false;
    if (regions.some((value) => value !== 1)) return false;

    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dr = Math.abs(cells[i][0] - cells[j][0]);
        const dc = Math.abs(cells[i][1] - cells[j][1]);
        if (dr <= 1 && dc <= 1) return false;
      }
    }
    return true;
  }

  remainingSolutionCells() {
    return this.stage.solution.filter(([r, c]) => !this.placed[r][c]);
  }

  applyHint() {
    if (this.cleared) return null;

    const solutionSet = new Set(
      this.stage.solution.map(([r, c]) => r * N + c)
    );
    const removed = [];

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.placed[r][c] && !solutionSet.has(r * N + c)) {
          this.remove(r, c);
          removed.push([r, c]);
        }
      }
    }

    const remaining = this.remainingSolutionCells();
    if (!remaining.length) return { placed: null, removed };

    const [r, c] = remaining[0];
    this.place(r, c);
    if (this.checkCleared()) this.cleared = true;
    return { placed: [r, c], removed };
  }

  canHint() {
    return !this.cleared && this.remainingSolutionCells().length > 0;
  }
}

export class GameSession {
  constructor(playerName, rand = Math.random, options = {}) {
    this.playerName = playerName;
    this.playId = String(options.playId || createPlayId());
    this.mode =
      options.mode === GAME_MODE.OFFICIAL
        ? GAME_MODE.OFFICIAL
        : GAME_MODE.PRACTICE;
    const suppliedStageBank = options.stageBank || options.practiceStageBank;
    const suppliedStageBankId = String(
      options.stageBankId || options.practiceStageBankId || "legacy-v1"
    );
    const suppliedStageBankFallback = Boolean(
      options.stageBankFallback ?? options.practiceStageBankFallback
    );
    if (
      this.mode === GAME_MODE.OFFICIAL &&
      (!Array.isArray(suppliedStageBank) ||
        suppliedStageBankId !== ACTIVE_RANDOM_STAGE_BANK_ID ||
        suppliedStageBankFallback)
    ) {
      throw new Error("公式モードには承認済みの問題バンクが必要です");
    }
    this.stageBank = suppliedStageBank || STAGES;
    this.practiceStageBank =
      this.mode === GAME_MODE.PRACTICE ? this.stageBank : null;
    this.stageBankId = suppliedStageBankId;
    this.stageBankFallback = suppliedStageBankFallback;
    this.stages = selectRandomStages(rand, this.stageBank);
    this.index = 0;
    this.states = this.stages.map((stage) => new StageState(stage));
    this.mistakeCount = 0;
    this.hintCount = 0;
    this.stageMistakeCounts = new Array(this.stages.length).fill(0);
    this.stageHintCounts = new Array(this.stages.length).fill(0);

    this.stageTimesMs = [];
    this.accumulatedMs = 0;
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.startedAt = null;
    this.startTime = null;
    this.completedAt = null;
    this.endTime = null;
    this.status = SESSION_STATUS.READY;
  }

  get current() {
    return this.states[this.index];
  }

  get stageNumber() {
    return this.index + 1;
  }

  get totalStages() {
    return this.stages.length;
  }

  isLastStage() {
    return this.index === this.states.length - 1;
  }

  start(now = monotonicNow()) {
    if (this.startedAt == null) {
      this.startedAt = now;
      this.startTime = now;
    }
    return this.startStage(now);
  }

  startStage(now = monotonicNow()) {
    if (
      this.status === SESSION_STATUS.RESULT ||
      this.status === SESSION_STATUS.RETIRED ||
      this.stageStartedAt != null
    ) {
      return false;
    }

    if (this.startedAt == null) {
      this.startedAt = now;
      this.startTime = now;
    }

    this.stageStartedAt = now;
    this.stageStartTime = now;
    this.status = SESSION_STATUS.PLAYING;
    return true;
  }

  finishStage(now = monotonicNow()) {
    if (this.stageStartedAt == null) return 0;

    const duration = Math.max(0, now - this.stageStartedAt);
    this.stageTimesMs[this.index] = duration;
    this.accumulatedMs = this.stageTimesMs.reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0
    );
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.status = SESSION_STATUS.STAGE_TRANSITION;
    return duration;
  }

  clearCurrentStage(now = monotonicNow()) {
    return this.finishStage(now);
  }

  advance(now = monotonicNow()) {
    this.finishStage(now);

    if (this.index < this.states.length - 1) {
      this.index++;
      this.status = SESSION_STATUS.STAGE_TRANSITION;
      return false;
    }

    this.completedAt = now;
    this.endTime = now;
    this.status = SESSION_STATUS.RESULT;
    return true;
  }

  currentStageElapsedMs(now = monotonicNow()) {
    if (this.stageStartedAt == null) return 0;
    return Math.max(0, now - this.stageStartedAt);
  }

  elapsedMs(now = monotonicNow()) {
    return this.accumulatedMs + this.currentStageElapsedMs(now);
  }

  recordMistake() {
    this.mistakeCount++;
    this.stageMistakeCounts[this.index]++;
  }

  recordHint() {
    this.hintCount++;
    this.stageHintCounts[this.index]++;
  }

  retire() {
    if (this.status === SESSION_STATUS.RESULT) return false;
    this.stageStartedAt = null;
    this.stageStartTime = null;
    this.status = SESSION_STATUS.RETIRED;
    return true;
  }

  adjustedTime(now = monotonicNow()) {
    return computeAdjustedTime({
      elapsedMs: this.elapsedMs(now),
      mistakeCount: this.mistakeCount,
      hintCount: this.hintCount,
    });
  }

  score(now = monotonicNow()) {
    return this.adjustedTime(now);
  }

  resultBreakdown(now = monotonicNow()) {
    const elapsedMs = this.elapsedMs(now);
    return {
      mode: this.mode,
      elapsedMs,
      stageTimesMs: this.stageTimesMs.slice(),
      stageMistakeCounts: this.stageMistakeCounts.slice(),
      stageHintCounts: this.stageHintCounts.slice(),
      mistakeCount: this.mistakeCount,
      hintCount: this.hintCount,
      mistakePenaltyCentiseconds:
        this.mistakeCount * ADJUSTED_TIME.MISTAKE_CENTISECONDS,
      hintPenaltyCentiseconds:
        this.hintCount * ADJUSTED_TIME.HINT_CENTISECONDS,
      adjustedTimeCentiseconds: computeAdjustedTime({
        elapsedMs,
        mistakeCount: this.mistakeCount,
        hintCount: this.hintCount,
      }),
    };
  }
}

export function computeAdjustedTime({ elapsedMs, mistakeCount, hintCount }) {
  const baseCentiseconds = Math.floor(
    Math.max(0, Number(elapsedMs) || 0) / 10
  );
  const mistakePenalty =
    Math.max(0, Number(mistakeCount) || 0) *
    ADJUSTED_TIME.MISTAKE_CENTISECONDS;
  const hintPenalty =
    Math.max(0, Number(hintCount) || 0) *
    ADJUSTED_TIME.HINT_CENTISECONDS;
  return Math.floor(baseCentiseconds + mistakePenalty + hintPenalty);
}

/** v1互換。新規ランキング値には使用しない。 */
export function computeScore({ elapsedMs, mistakeCount, hintCount }) {
  const timePenalty = Math.floor(Math.max(0, Number(elapsedMs) || 0));
  const mistakePenalty =
    Math.max(0, Number(mistakeCount) || 0) * SCORE.MISTAKE_PENALTY;
  const hintPenalty =
    Math.max(0, Number(hintCount) || 0) * SCORE.HINT_PENALTY;
  return Math.max(
    0,
    SCORE.BASE - timePenalty - mistakePenalty - hintPenalty
  );
}

export function formatTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSec = safeMs / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  const tenth = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenth}`;
}

export function formatCentiseconds(value) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  return (safe / 100).toFixed(2);
}

export function formatAdjustedTime(value) {
  return `${formatCentiseconds(value)}秒`;
}
