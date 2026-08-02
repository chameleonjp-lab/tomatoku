import assert from "node:assert/strict";
import {
  createRankingClient,
  isConfigured,
  isRankingEnabled,
  isSubmissionEnabled,
  normalizeDisplayName,
} from "../src/ranking.js";

const CONFIG = {
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  gameSlug: "tomatoku_competition_v1",
  clientVersion: "tomatooku-test",
  timeoutMs: 20,
  competitionFunction: "tomatoku-competition",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  rankingsEnabled: true,
  submissionsEnabled: true,
};
const TRANSCRIPT = Array.from({ length: 15 }, (_, index) => ({
  type: "tap",
  stageIndex: Math.floor(index / 5),
  row: index % 5,
  col: index % 5,
  atMs: (index + 1) * 100,
}));

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

let pass = 0;
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

await test("設定判定と送信ゲートを区別", () => {
  assert.equal(isConfigured(CONFIG), true);
  assert.equal(isRankingEnabled(CONFIG), true);
  assert.equal(isSubmissionEnabled(CONFIG), true);
  assert.equal(isRankingEnabled({ ...CONFIG, rankingsEnabled: false }), false);
  assert.equal(
    isSubmissionEnabled({ ...CONFIG, rankingsEnabled: false }),
    false
  );
  assert.equal(isSubmissionEnabled({ ...CONFIG, submissionsEnabled: false }), false);
  assert.equal(isConfigured({ ...CONFIG, supabaseUrl: "" }), false);
});

await test("表示名をNFKC正規化し20文字以内にする", () => {
  assert.equal(normalizeDisplayName("  Ｔｅｓｔ\u0000   太郎  "), "Test 太郎");
  assert.equal(normalizeDisplayName("123456789012345678901234").length, 20);
});

await test("練習モードは通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(CONFIG, {
    fetch: async () => {
      calls++;
      return jsonResponse([]);
    },
  });
  const result = await client.submitScore({
    playId: "p1",
    mode: "practice",
    runToken: "unused",
    transcript: TRANSCRIPT,
    elapsedMs: 1500,
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls, 0);
});

await test("送信ゲートOFFの公式は通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(
    { ...CONFIG, submissionsEnabled: false },
    {
      fetch: async () => {
        calls++;
        return jsonResponse([]);
      },
    }
  );
  const result = await client.submitScore({
    playId: "p2",
    mode: "official",
    runToken: "run-2",
    transcript: TRANSCRIPT,
    elapsedMs: 1500,
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls, 0);
});

await test("ランキング停止中は取得も通信しない", async () => {
  let calls = 0;
  const client = createRankingClient(
    { ...CONFIG, rankingsEnabled: false, submissionsEnabled: false },
    {
      fetch: async () => {
        calls++;
        return jsonResponse([]);
      },
    }
  );
  const result = await client.fetchBestRanking(10);
  assert.equal(result.status, "disabled");
  assert.equal(calls, 0);
});

await test("公式の準備・開始は検証用Edge Functionとapikeyだけを使う", async () => {
  const requests = [];
  const client = createRankingClient(CONFIG, {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (body.action === "prepare") {
        return jsonResponse({
          accepted: true,
          runToken: "server-run",
        });
      }
      return jsonResponse({
        accepted: true,
        stageIds: ["STG-0001", "STG-0029", "STG-0057"],
      });
    },
  });
  const prepared = await client.prepareOfficialRun({ playerName: "  テスト  " });
  assert.equal(prepared.status, "ok");
  assert.deepEqual(prepared.stageIds, []);
  assert.deepEqual(
    await client.beginOfficialRun({ runToken: prepared.runToken }),
    {
      status: "ok",
      stageIds: ["STG-0001", "STG-0029", "STG-0057"],
    }
  );
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => /functions\/v1\/tomatoku-competition$/.test(request.url)));
  assert.ok(requests.every((request) => request.options.headers.apikey === CONFIG.supabasePublishableKey));
  assert.ok(requests.every((request) => !("Authorization" in request.options.headers)));
  assert.deepEqual(requests[0].body, {
    action: "prepare",
    clientVersion: "tomatooku-test",
    playerName: "テスト",
  });
  assert.deepEqual(requests[1].body, {
    action: "begin",
    clientVersion: "tomatooku-test",
    runToken: "server-run",
  });
});

await test("公式送信はスコアを自己申告せず操作記録だけを送る", async () => {
  let request;
  const client = createRankingClient(CONFIG, {
    fetch: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        accepted: true,
        score: 4835,
        result_first_score: 5000,
        result_best_score: 4800,
        result_play_count: 2,
        is_first_play: false,
        is_new_best: true,
      });
    },
  });
  const result = await client.submitScore({
    playId: "play-1",
    mode: "official",
    runToken: "server-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1835.9,
  });
  assert.match(request.url, /functions\/v1\/tomatoku-competition$/);
  assert.equal(request.options.headers.apikey, CONFIG.supabasePublishableKey);
  assert.equal("Authorization" in request.options.headers, false);
  assert.deepEqual(JSON.parse(request.options.body), {
    action: "finish",
    clientVersion: "tomatooku-test",
    runToken: "server-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1835,
  });
  assert.equal("score" in JSON.parse(request.options.body), false);
  assert.equal(result.status, "ok");
  assert.equal(result.bestScore, 4800);
});

await test("同じplayIdは同一Promise・通信1回", async () => {
  let calls = 0;
  const client = createRankingClient(CONFIG, {
    fetch: async () => {
      calls++;
      return jsonResponse({ accepted: true, score: 10 });
    },
  });
  const args = {
    playId: "same",
    mode: "official",
    runToken: "same-run",
    transcript: TRANSCRIPT,
    elapsedMs: 1000,
  };
  const first = client.submitScore(args);
  const second = client.submitScore(args);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

await test("ベストランキングを正規化", async () => {
  let body;
  const client = createRankingClient(CONFIG, {
    fetch: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse([
        {
          rank_no: 1,
          display_name: "A",
          first_score: 6000,
          best_score: 5000,
          play_count: 3,
        },
      ]);
    },
  });
  const result = await client.fetchBestRanking(3);
  assert.deepEqual(body, { p_game_slug: "tomatoku_competition_v1", p_limit: 3 });
  assert.equal(result.status, "ok");
  assert.equal(result.rows[0].bestScore, 5000);
});

await test("初回ランキングは専用RPC", async () => {
  let url;
  const client = createRankingClient(CONFIG, {
    fetch: async (value) => {
      url = value;
      return jsonResponse([]);
    },
  });
  const result = await client.fetchFirstRanking(10);
  assert.match(url, /get_first_try_ranking$/);
  assert.equal(result.status, "empty");
});

await test("未設定・HTTPエラー・形式不正を状態で返す", async () => {
  const unconfigured = createRankingClient({ ...CONFIG, supabaseUrl: "" });
  assert.equal((await unconfigured.fetchBestRanking()).status, "not_configured");

  const httpError = createRankingClient(CONFIG, {
    fetch: async () => jsonResponse({}, 500),
  });
  assert.equal((await httpError.fetchBestRanking()).status, "error");

  const malformed = createRankingClient(CONFIG, {
    fetch: async () => jsonResponse({ rows: [] }),
  });
  assert.equal((await malformed.fetchBestRanking()).status, "error");
});

await test("タイムアウト時はAbortControllerで中止", async () => {
  let aborted = false;
  const client = createRankingClient(
    { ...CONFIG, timeoutMs: 5 },
    {
      fetch: async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            aborted = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }
  );
  assert.equal((await client.fetchBestRanking()).status, "error");
  assert.equal(aborted, true);
});

console.log(`\n==== RANKING TEST RESULT: PASS=${pass} FAIL=0 ====`);
