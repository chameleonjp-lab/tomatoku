import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RANKING_CONFIG } from "../src/ranking-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");

assert.equal(RANKING_CONFIG.gameSlug, "tomatoku_competition_v1");
assert.doesNotMatch(html, /gameSlug:\s*["']tomatoku["']/);
assert.equal(RANKING_CONFIG.rankingsEnabled, true);
assert.equal(RANKING_CONFIG.submissionsEnabled, true);
assert.equal(
  RANKING_CONFIG.clientVersion,
  "tomatooku-web-3.0.0-verified-competition-v1"
);
assert.equal(RANKING_CONFIG.competitionFunction, "tomatoku-competition");
assert.equal("submitRpc" in RANKING_CONFIG, false);
assert.equal(RANKING_CONFIG.bestRankingRpc, "get_best_score_ranking");
assert.equal(RANKING_CONFIG.firstRankingRpc, "get_first_try_ranking");
assert.match(RANKING_CONFIG.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
assert.match(RANKING_CONFIG.supabasePublishableKey, /^sb_publishable_/);

const labUrl = "https://chameleonjp-lab.github.io/chameleonjp_lab/";
const detailUrl = `${labUrl}ranking.html?game=tomatoku_competition_v1`;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

assert.equal(
  (html.match(new RegExp(`href="${escapeRegExp(labUrl)}"`, "g")) || []).length,
  2
);
assert.equal(
  (html.match(new RegExp(`href="${escapeRegExp(detailUrl)}"`, "g")) || []).length,
  2
);
assert.match(html, /id="lab-link"/);
assert.match(html, /id="detail-ranking-link"/);
assert.match(html, /id="result-lab-link"/);
assert.match(html, /id="result-detail-ranking-link"/);
assert.equal((html.match(/data-ranking-only/g) || []).length, 3);
assert.match(html, /id="detail-ranking-link"[\s\S]*data-ranking-only[\s\S]*hidden/);
assert.doesNotMatch(html, /id="home-ranking"/);
assert.match(
  html,
  /id="screen-result"[\s\S]*公式ランキング 上位10名（補正タイム・短い順）[\s\S]*id="result-ranking"/
);
assert.doesNotMatch(main, /loadRankingInto\("#home-ranking"\)/);
assert.match(main, /loadRankingInto\("#result-ranking"\)/);
assert.match(main, /fetchBestRanking\(10\)/);
assert.match(
  html,
  /公式プレイでは、プレイヤー名、操作記録、計測時間、ゲーム名、ゲームの版を送信し、サーバーで補正タイムを確認します/
);
assert.match(html, /1プレイにつき1回ランキングへ送信/);
assert.doesNotMatch(html, /現在は記録を保存しません/);

console.log("==== LAUNCH CONFIG TEST RESULT: PASS ====");
