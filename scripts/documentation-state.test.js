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

assert.match(requirements, /文書種別: 現行製品要件/);
assert.match(requirements, /T001 \/ T011 \/ T021/);
assert.match(requirements, /ランキング取得・送信再開/);
assert.match(requirements, /チュートリアル.*0\.5倍速/);
assert.ok(requirements.includes(PRACTICE_STAGE_BANK_FEATURE.primaryBankId));
assert.ok(requirements.includes(PRACTICE_STAGE_BANK_FEATURE.fallbackBankId));
assert.doesNotMatch(
  requirements,
  /将来版の製品要件|現行実装済み仕様ではない|廃止予定|表示名は将来実装/
);

assert.ok(plan.includes(ACTIVE_PRACTICE_STAGE_BANK_ID));
assert.match(plan, /ランダム練習primary:.*84問/);
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

assert.match(supabaseSetup, /public\.games`登録: \*\*登録済み・is_active=true\*\*/);
assert.match(supabaseSetup, /実スコア送信: \*\*Publishable keyで確認済み\*\*/);
assert.ok(supabaseSetup.includes(RANKING_CONFIG.clientVersion));
assert.match(supabaseSetup, /display_order: 34/);
assert.doesNotMatch(supabaseSetup, /tomatoku.*未登録/);
assert.doesNotMatch(supabaseSetup, /実スコア送信: \*\*未実施\*\*/);

assert.match(pagesDeploy, /Supabaseへ再登録済みの`game_url`/);
assert.doesNotMatch(pagesDeploy, /将来Supabaseへ再登録/);

assert.match(legacyRequirements, /v1の履歴文書/);
assert.match(legacyRequirements, /REQUIREMENTS_v2\.md/);
assert.match(legacySpec, /v1履歴/);
assert.match(legacySpec, /現在の実装の正本ではありません/);
assert.match(legacyPlan, /v1の履歴文書/);
assert.match(legacyPlan, /IMPLEMENTATION_PLAN_v2\.md/);

console.log("✓ 現行要件・仕様・実装計画は主要コード契約と一致");
