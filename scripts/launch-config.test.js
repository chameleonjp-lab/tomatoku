import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RANKING_CONFIG } from "../src/ranking-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.equal(RANKING_CONFIG.gameSlug, "tomatoku");
assert.equal(RANKING_CONFIG.rankingsEnabled, false);
assert.equal(RANKING_CONFIG.submissionsEnabled, false);
assert.equal(
  RANKING_CONFIG.clientVersion,
  "tomatooku-web-2.3.0-test-ranking-off"
);
assert.equal(RANKING_CONFIG.submitRpc, "submit_score");
assert.equal(RANKING_CONFIG.bestRankingRpc, "get_best_score_ranking");
assert.equal(RANKING_CONFIG.firstRankingRpc, "get_first_try_ranking");
assert.match(RANKING_CONFIG.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
assert.match(RANKING_CONFIG.supabasePublishableKey, /^sb_publishable_/);

const labUrl = "https://chameleonjp.codeberg.page/chameleonjp_lab/";
const detailUrl = `${labUrl}ranking.html?game=tomatoku`;
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
assert.equal((html.match(/data-ranking-only/g) || []).length, 4);
assert.match(html, /id="detail-ranking-link"[\s\S]*data-ranking-only[\s\S]*hidden/);

console.log("==== LAUNCH CONFIG TEST RESULT: PASS ====");
