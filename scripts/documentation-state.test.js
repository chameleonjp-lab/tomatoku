import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RANKING_CONFIG } from "../src/ranking-config.js";
import {
  PRACTICE_STAGE_BANK_FEATURE,
  ACTIVE_PRACTICE_STAGE_BANK_ID,
} from "../src/stage-bank-config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const requirements = read("docs/REQUIREMENTS_v2.md");
const spec = read("docs/SPEC_v2.md");
const plan = read("docs/IMPLEMENTATION_PLAN_v2.md");
const supabaseSetup = read("docs/SUPABASE_SETUP.md");
const pagesDeploy = read("docs/GITHUB_PAGES_DEPLOY.md");
const legacyRequirements = read("docs/REQUIREMENTS.md");
const legacySpec = read("docs/SPEC.md");
const legacyPlan = read("docs/IMPLEMENTATION_PLAN.md");

assert.match(spec, /文書種別: 現行実装仕様/);
assert.match(spec, /rankingsEnabled: true/);
assert.match(spec, /submissionsEnabled: true/);
assert.match(spec, /色別エリア.*0\.5倍速/);
assert.ok(spec.includes(RANKING_CONFIG.clientVersion));
assert.ok(spec.includes(PRACTICE_STAGE_BANK_FEATURE.primaryBankId));
assert.ok(spec.includes(PRACTICE_STAGE_BANK_FEATURE.fallbackBankId));
assert.doesNotMatch(spec, /public\.games.*未完了/);
assert.match(spec, /旧版の実プレイ1件/);
assert.match(spec, /accepting_runs=false/);
assert.match(spec, /操作記録から再計算/);

assert.match(requirements, /文書種別: 現行製品要件/);
assert.match(requirements, /公式と練習が同じ承認済み問題バンク/);
assert.match(requirements, /サーバーが公平抽選表/);
assert.match(requirements, /公式の読込失敗時は別問題へ切り替えず開始を止める/);
assert.match(requirements, /旧ランキング一時停止/);
assert.match(requirements, /同一操作記録の完了再送は保存済み結果/);
assert.match(requirements, /チュートリアル.*0\.5倍速/);
assert.ok(requirements.includes(PRACTICE_STAGE_BANK_FEATURE.primaryBankId));
assert.ok(requirements.includes(PRACTICE_STAGE_BANK_FEATURE.fallbackBankId));
assert.doesNotMatch(
  requirements,
  /将来版の製品要件|現行実装済み仕様ではない|廃止予定|表示名は将来実装/
);

assert.ok(plan.includes(ACTIVE_PRACTICE_STAGE_BANK_ID));
assert.match(plan, /ランダム練習primary: 公式と同じ公平抽選表/);
assert.match(plan, /公式primary:.*公平抽選済み/);
assert.match(plan, /active-official-and-practice/);
assert.ok(plan.includes(RANKING_CONFIG.clientVersion));
assert.match(plan, /REVIEW EXECUTION COMPLETED/);
assert.match(plan, /rankingsEnabled=true/);
assert.match(plan, /submissionsEnabled=true/);
assert.match(plan, /高速連続タップ/);
assert.match(plan, /GitHub Pages自動公開/);
assert.match(plan, /TUTORIAL_PLAYBACK_RATE=0\.5/);
assert.match(plan, /repository setting pending/);
assert.doesNotMatch(plan, /ランダム練習: 現行30問から3問選出/);
assert.doesNotMatch(plan, /現在はSupabase登録削除・ゲート停止/);
assert.doesNotMatch(plan, /Supabaseを再登録する時点/);

const finalBankDoc = read("docs/VARIABLE_STAGE_FINAL_BANK.md");
const releaseCheck = read("docs/RELEASE_DEVICE_CHECK_v2.md");
const historicalPracticeRollout = read("docs/PRACTICE_STAGE_BANK_ROLLOUT.md");
assert.match(finalBankDoc, /ACTIVE_STAGE_BANK_ID = candidate-v2-variable-4-6-final/);
assert.match(finalBankDoc, /final\.rankingEligible = true/);
assert.match(finalBankDoc, /公式は開始を止める/);
assert.match(releaseCheck, /公式bank \| `candidate-v2-variable-4-6-final`/);
assert.match(releaseCheck, /公式への`legacy-v1` fallback混入/);
assert.match(releaseCheck, /同一内容の再送は保存済み結果/);
assert.doesNotMatch(releaseCheck, /完了済みとして拒否/);
assert.match(historicalPracticeRollout, /現在の実装契約ではない/);

const publicHtml = read("index.html");
assert.doesNotMatch(publicHtml, /84問/);
assert.doesNotMatch(publicHtml, /固定3問|全員同じ3問/);
assert.match(publicHtml, /問題はランダムに選ばれます/);

assert.match(supabaseSetup, /旧ランキング`tomatoku`は`is_active=false`/);
assert.match(supabaseSetup, /tomatoku_competition_v1/);
assert.ok(supabaseSetup.includes(RANKING_CONFIG.clientVersion));
assert.match(supabaseSetup, /display_order: 34/);
assert.match(supabaseSetup, /操作記録から再計算/);
assert.match(supabaseSetup, /同じ確率/);

assert.match(pagesDeploy, /Supabaseへ再登録済みの`game_url`/);
assert.doesNotMatch(pagesDeploy, /将来Supabaseへ再登録/);

assert.match(legacyRequirements, /v1の履歴文書/);
assert.match(legacyRequirements, /REQUIREMENTS_v2\.md/);
assert.match(legacySpec, /v1履歴/);
assert.match(legacySpec, /現在の実装の正本ではありません/);
assert.match(legacyPlan, /v1の履歴文書/);
assert.match(legacyPlan, /IMPLEMENTATION_PLAN_v2\.md/);

console.log("✓ 現行要件・仕様・実装計画は主要コード契約と一致");
