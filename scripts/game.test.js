import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADJUSTED_TIME,
  GAME_MODE,
  GameSession,
  N,
  SESSION_STATUS,
  StageState,
  buildRandomStageSets,
  computeAdjustedTime,
  formatAdjustedTime,
  formatCentiseconds,
  formatTime,
  pickStages,
  selectPracticeStages,
  selectRandomStages,
  solutionSignature,
} from "../src/game.js";
import { STAGES } from "../src/stages.js";
import { validateCompetitionDrawPayload } from "../src/practice-stage-bank.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finalBank = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "generated/variable-stage-bank-v2.json"),
    "utf8"
  )
);
const competitionDraw = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "generated/balanced-official-draw-v1.json"),
    "utf8"
  )
);
const competitionValidation = validateCompetitionDrawPayload(
  competitionDraw,
  finalBank.stages
);
assert.equal(
  competitionValidation.valid,
  true,
  competitionValidation.problems.join("; ")
);
const competitionSets = competitionValidation.competitionSets;

let pass = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function seededRand(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("ステージバンクは30問以上・各難易度あり", () => {
  assert.ok(STAGES.length >= 30);
  for (const difficulty of [1, 2, 3]) {
    assert.ok(STAGES.some((stage) => stage.difficulty === difficulty));
  }
});

test("公式・練習共通の有効3問組を事前列挙できる", () => {
  const sets = buildRandomStageSets();
  assert.ok(sets.length > 0);
  for (const stages of sets) {
    assert.deepEqual(stages.map((stage) => stage.difficulty), [1, 2, 3]);
    assert.equal(new Set(stages.map((stage) => stage.id)).size, 3);
    assert.equal(new Set(stages.map(solutionSignature)).size, 3);
  }
});

test("完成バンクの全問題が複数のランダム3問組へ到達可能", () => {
  const sets = buildRandomStageSets(finalBank.stages);
  const reachableIds = new Set(sets.flatMap((stages) => stages.map((stage) => stage.id)));
  assert.ok(sets.length > finalBank.stageCount);
  assert.equal(reachableIds.size, finalBank.stageCount);
  assert.deepEqual(
    [1, 2, 3].map(
      (difficulty) =>
        new Set(
          sets
            .flat()
            .filter((stage) => stage.difficulty === difficulty)
            .map((stage) => stage.id)
        ).size
    ),
    [28, 28, 28]
  );
});

test("不正な問題バンクからはランダム3問を作らない", () => {
  assert.throws(() => buildRandomStageSets(null), TypeError);
  assert.throws(() => buildRandomStageSets([]), /有効なランダムステージ組/);
});

test("ランダム選出500回でID・正解配置が重複しない", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const stages = selectRandomStages(seededRand(seed));
    assert.equal(stages.length, 3);
    assert.equal(new Set(stages.map((stage) => stage.id)).size, 3);
    assert.equal(new Set(stages.map(solutionSignature)).size, 3);
  }
});

test("pickStagesは練習選出の互換API", () => {
  const a = pickStages(() => 0);
  const b = selectRandomStages(() => 0);
  assert.deepEqual(a.map((stage) => stage.id), b.map((stage) => stage.id));
  assert.deepEqual(
    selectPracticeStages(() => 0).map((stage) => stage.id),
    b.map((stage) => stage.id)
  );
});

test("全ステージは正解順タップでクリア", () => {
  for (const stage of STAGES) {
    const state = new StageState(stage);
    for (const [r, c] of stage.solution) {
      assert.notEqual(state.tap(r, c).type, "mistake");
    }
    assert.equal(state.cleared, true, stage.id);
  }
});

test("盤面ルール違反は誤タップ", () => {
  const state = new StageState(STAGES[0]);
  const [r, c] = STAGES[0].solution[0];
  state.tap(r, c);
  const other = c === 0 ? 1 : 0;
  assert.equal(state.tap(r, other).type, "mistake");
});

test("ヒントは誤配置を除去し正解を1つ置く", () => {
  const stage = STAGES[0];
  const state = new StageState(stage);
  const solutionSet = new Set(stage.solution.map(([r, c]) => r * N + c));
  outer: for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!solutionSet.has(r * N + c) && state.canPlace(r, c).ok) {
        state.place(r, c);
        break outer;
      }
    }
  }
  const result = state.applyHint();
  assert.ok(result.placed);
  assert.ok(result.removed.length >= 1);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (state.has(r, c)) assert.ok(solutionSet.has(r * N + c));
    }
  }
});

test("補正タイムは実時間+誤3秒+ヒント30秒", () => {
  assert.equal(
    computeAdjustedTime({ elapsedMs: 12_345, mistakeCount: 2, hintCount: 1 }),
    1234 + 600 + 3000
  );
  assert.equal(ADJUSTED_TIME.MISTAKE_CENTISECONDS, 300);
  assert.equal(ADJUSTED_TIME.HINT_CENTISECONDS, 3000);
});

test("補正タイムは非負整数", () => {
  assert.equal(
    computeAdjustedTime({ elapsedMs: -1, mistakeCount: -1, hintCount: -1 }),
    0
  );
  assert.equal(
    Number.isInteger(
      computeAdjustedTime({ elapsedMs: 123.99, mistakeCount: 0, hintCount: 0 })
    ),
    true
  );
});

test("補正タイム表示は小数2桁", () => {
  assert.equal(formatCentiseconds(4835), "48.35");
  assert.equal(formatAdjustedTime(4835), "48.35秒");
});

test("3分を超える補正タイムも上限で切らない", () => {
  const score = computeAdjustedTime({
    elapsedMs: 181_000,
    mistakeCount: 1,
    hintCount: 0,
  });
  assert.equal(score, 18_100 + 300);
  assert.equal(formatCentiseconds(score), "184.00");
});

test("公式セッションはサーバー発行の公平抽選セットだけを使用", () => {
  for (let index = 0; index < competitionSets.length; index += 17) {
    const officialStageIds = competitionSets[index];
    const session = new GameSession("A", seededRand(index + 1), {
      mode: GAME_MODE.OFFICIAL,
      playId: `official-${index}`,
      stageBank: finalBank.stages,
      stageBankId: finalBank.id,
      stageBankFallback: false,
      competitionSets,
      officialStageIds,
      runToken: `run-${index}`,
    });
    assert.equal(session.mode, GAME_MODE.OFFICIAL);
    assert.deepEqual(session.stages.map((stage) => stage.difficulty), [1, 2, 3]);
    assert.deepEqual(session.stages.map((stage) => stage.id), officialStageIds);
    assert.equal(session.runToken, `run-${index}`);
  }
});

test("公式セッションは未指定・fallbackの問題バンクを拒否", () => {
  assert.throws(
    () =>
      new GameSession("A", seededRand(1), {
        mode: GAME_MODE.OFFICIAL,
        playId: "official-missing-bank",
      }),
    /承認済み/
  );
  assert.throws(
    () =>
      new GameSession("A", seededRand(1), {
        mode: GAME_MODE.OFFICIAL,
        playId: "official-fallback-bank",
        stageBank: finalBank.stages,
        stageBankId: finalBank.id,
        stageBankFallback: true,
        competitionSets,
        officialStageIds: competitionSets[0],
      }),
    /承認済み/
  );
  assert.throws(
    () =>
      new GameSession("A", seededRand(1), {
        mode: GAME_MODE.OFFICIAL,
        playId: "official-missing-server-set",
        stageBank: finalBank.stages,
        stageBankId: finalBank.id,
        stageBankFallback: false,
        competitionSets,
      }),
    /サーバー発行/
  );
  assert.throws(
    () =>
      new GameSession("A", seededRand(1), {
        mode: GAME_MODE.OFFICIAL,
        playId: "official-forged-set",
        stageBank: finalBank.stages,
        stageBankId: finalBank.id,
        stageBankFallback: false,
        competitionSets,
        officialStageIds: ["STG-0001", "STG-0029", "STG-9999"],
      }),
    /サーバー発行/
  );
});

test("練習セッションは練習モード", () => {
  const session = new GameSession("A", seededRand(2), {
    mode: GAME_MODE.PRACTICE,
    playId: "practice-1",
  });
  assert.equal(session.mode, GAME_MODE.PRACTICE);
  assert.deepEqual(session.stages.map((stage) => stage.difficulty), [1, 2, 3]);
});

test("計測開始前は0、startStage後だけ加算", () => {
  const session = new GameSession("A", seededRand(3), { playId: "timer-1" });
  assert.equal(session.elapsedMs(5000), 0);
  assert.equal(session.startStage(1000), true);
  assert.equal(session.elapsedMs(2500), 1500);
});

test("finishStage二重呼び出しで重複加算しない", () => {
  const session = new GameSession("A", seededRand(4), { playId: "timer-2" });
  session.startStage(1000);
  assert.equal(session.finishStage(2000), 1000);
  assert.equal(session.finishStage(5000), 0);
  assert.equal(session.accumulatedMs, 1000);
});

test("演出・描画待ちは計測されない", () => {
  const session = new GameSession("A", seededRand(5), { playId: "timer-3" });
  session.startStage(0);
  session.finishStage(1000);
  session.advance(6000);
  assert.equal(session.elapsedMs(8000), 1000);
  session.startStage(9000);
  assert.equal(session.elapsedMs(10_000), 2000);
});

test("最終ステージの終了時刻は正解入力時刻へ固定", () => {
  const session = new GameSession("A", seededRand(51), { playId: "timer-final" });
  session.index = session.totalStages - 1;
  session.startStage(1_000);
  session.finishStage(2_345);
  assert.equal(session.advance(9_999), true);
  assert.equal(session.endTime, 2_345);
  assert.equal(session.completedAt, 2_345);
  assert.equal(session.accumulatedMs, 1_345);
});

test("操作記録は入力時刻・ステージ・マスを保持", () => {
  const session = new GameSession("A", seededRand(52), { playId: "actions" });
  session.startStage(1_000);
  session.recordTap(2, 3, 1_250);
  session.recordHintAction(1_500);
  assert.deepEqual(session.transcript(), [
    { type: "tap", stageIndex: 0, row: 2, col: 3, atMs: 250 },
    { type: "hint", stageIndex: 0, atMs: 500 },
  ]);
});

test("ステージ別時間と累計が一致", () => {
  const session = new GameSession("A", seededRand(6), { playId: "timer-4" });
  let now = 0;
  for (let index = 0; index < 3; index++) {
    session.startStage(now);
    now += 1000 + index * 100;
    session.finishStage(now);
    now += 500;
    session.advance(now);
  }
  assert.deepEqual(session.stageTimesMs, [1000, 1100, 1200]);
  assert.equal(session.accumulatedMs, 3300);
  assert.equal(session.status, SESSION_STATUS.RESULT);
});

test("誤タップ・ヒントをステージ別に保持", () => {
  const session = new GameSession("A", seededRand(7), { playId: "counts" });
  session.recordMistake();
  session.recordHint();
  assert.deepEqual(session.stageMistakeCounts, [1, 0, 0]);
  assert.deepEqual(session.stageHintCounts, [1, 0, 0]);
});

test("結果内訳の補正値が一致", () => {
  const session = new GameSession("A", seededRand(8), { playId: "result" });
  session.startStage(0);
  session.recordMistake();
  session.recordHint();
  session.finishStage(5000);
  const result = session.resultBreakdown(5000);
  assert.equal(result.elapsedMs, 5000);
  assert.equal(result.mistakePenaltyCentiseconds, 300);
  assert.equal(result.hintPenaltyCentiseconds, 3000);
  assert.equal(result.adjustedTimeCentiseconds, 500 + 300 + 3000);
});

test("リタイア後は計測を停止", () => {
  const session = new GameSession("A", seededRand(9), { playId: "retire" });
  session.startStage(1000);
  assert.equal(session.retire(), true);
  assert.equal(session.elapsedMs(5000), 0);
  assert.equal(session.status, SESSION_STATUS.RETIRED);
});

test("formatTime互換", () => {
  assert.equal(formatTime(0), "0:00.0");
  assert.equal(formatTime(65_400), "1:05.4");
});

console.log(`\n==== TEST RESULT: PASS=${pass} FAIL=0 ====`);
