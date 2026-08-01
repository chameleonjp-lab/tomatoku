import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260802000000_tomatoku_verified_competition.sql"
  ),
  "utf8"
);
const reviewSafetyMigration = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260802010000_tomatoku_verified_competition_review_safety.sql"
  ),
  "utf8"
);
const networkToleranceMigration = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260802020000_tomatoku_verified_competition_network_tolerance.sql"
  ),
  "utf8"
);
const edge = fs.readFileSync(
  path.join(ROOT, "supabase/functions/tomatoku-competition/index.ts"),
  "utf8"
);
const bank = JSON.parse(
  fs.readFileSync(path.join(ROOT, "generated/variable-stage-bank-v2.json"), "utf8")
);
const draw = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "generated/balanced-official-draw-v1.json"),
    "utf8"
  )
);

const stageSeed = migration
  .slice(
    migration.indexOf("insert into private.tomatoku_stage_catalog_v1"),
    migration.indexOf("insert into private.tomatoku_draw_sets_v1")
  )
  .match(/^\s*\('STG-[0-9a-f]{8}'/gm) || [];
assert.equal(stageSeed.length, bank.stages.length, "SQL must seed every approved stage");

const drawSection = migration.slice(
  migration.indexOf("insert into private.tomatoku_draw_sets_v1")
);
const seededSets = [...drawSection.matchAll(
  /\((\d+), (\d+), array\['(STG-[0-9a-f]{8})', '(STG-[0-9a-f]{8})', '(STG-[0-9a-f]{8})'\]::text\[], (\d+)\)/g
)].map((match) => ({
  deckId: Number(match[1]),
  slotId: Number(match[2]),
  slot: [match[3], match[4], match[5], Number(match[6])],
}));
const expectedSets = draw.decks.flatMap((deck, deckIndex) =>
  deck.slots.map((slot, slotIndex) => ({
    deckId: deckIndex + 1,
    slotId: slotIndex + 1,
    slot,
  }))
);
assert.deepEqual(seededSets, expectedSets, "SQL draw seed must equal approved fixture");

assert.match(migration, /where game_slug = 'tomatoku';/);
assert.match(migration, /'tomatoku_competition_v1'[\s\S]*?false/);
assert.match(migration, /accepting_runs[\s\S]*?false/);
assert.match(migration, /before insert or update on public\.score_runs/);
assert.match(migration, /before insert or update on public\.game_scores/);
assert.match(migration, /verified score write requires an active run/);
assert.match(migration, /p_elapsed_ms < 60000[\s\S]*?v_time_gap_ms > 1000/);
assert.match(
  migration,
  /v_ranked_player_count < 10[\s\S]*?p_score <= v_top_ten_cutoff/
);
assert.match(
  migration,
  /v_first_ranked_player_count < 10[\s\S]*?p_score <= v_first_top_ten_cutoff/
);
assert.match(
  migration,
  /v_play_ranked_player_count < 10[\s\S]*?v_existing_play_count, 0\) \+ 1 >= v_play_top_ten_cutoff/
);
assert.match(migration, /v_time_gap_ms < 0 or v_time_gap_ms > 15000/);
assert.doesNotMatch(migration, /p_requires_review/);
assert.match(migration, /score_run_id = v_score_run_id/);
assert.match(migration, /where id = v_run\.score_run_id/);
assert.match(migration, /get diagnostics v_updated_count = row_count/);
assert.match(
  migration,
  /v_run\.status = 'completed'[\s\S]*?return v_run\.result_payload/
);
assert.match(migration, /hashtextextended\('tomatoku-prepare-v1'/);
assert.match(migration, /hashtextextended\('tomatoku-ranking-v1'/);
assert.ok(
  (migration.match(/coalesce\(gs\.ranking_status, 'normal'\) = 'normal'/g) || [])
    .length >= 3,
  "all top-ten checks must use only publicly ranked rows"
);
assert.match(
  migration,
  /v_existing_ranking_status[\s\S]*?<> 'normal'/,
  "a hidden aggregate must require review before it can become public again"
);
assert.match(migration, /'displayName', v_run\.display_name/);
assert.match(
  migration,
  /metadata->>'displayName'[\s\S]*?v_approved_display_name[\s\S]*?update public\.players/,
  "review must derive the public name from an approved run"
);
const finalizeSection = migration.slice(
  migration.indexOf("create or replace function public.tomatoku_finalize_run_internal"),
  migration.indexOf("create or replace function public.tomatoku_review_run_internal")
);
assert.ok(
  finalizeSection.indexOf("hashtextextended('tomatoku-ranking-v1'") >= 0 &&
  finalizeSection.indexOf("hashtextextended('tomatoku-ranking-v1'") <
    finalizeSection.indexOf("for update"),
  "finalize and review must lock ranking before a run row"
);
assert.match(
  migration,
  /status = 'completed'[\s\S]*?requires_review is false[\s\S]*?interval '90 days'/
);
assert.ok(
  (migration.match(/g\.is_active = true/g) || []).length >= 3,
  "prepare, begin and finalize must all require the public game gate"
);
assert.match(migration, /revoke all on function public\.tomatoku_prepare_run_internal/);
assert.match(migration, /grant execute on function public\.tomatoku_finalize_run_internal[\s\S]*?to service_role/);
assert.match(migration, /tomatoku_review_run_internal/);
assert.match(migration, /reviewStatus/);
assert.doesNotMatch(migration, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/);

assert.match(edge, /SUPABASE_PUBLISHABLE_KEYS/);
assert.match(edge, /SUPABASE_SECRET_KEYS/);
assert.match(edge, /req\.headers\.get\("apikey"\)/);
assert.doesNotMatch(edge, /Authorization/);
assert.doesNotMatch(edge, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/);
assert.match(edge, /validateTranscript/);
assert.match(edge, /p_transcript_hash/);
assert.match(edge, /p_request_key/);
assert.match(edge, /origin_not_allowed/);
assert.match(edge, /run\.completed === true/);
assert.doesNotMatch(
  edge.slice(
    edge.indexOf('body.action === "prepare"'),
    edge.indexOf('body.action === "begin"')
  ),
  /stageIds/
);

for (const [functionName, correctiveMigration] of [
  ["tomatoku_finalize_run_internal", networkToleranceMigration],
  ["tomatoku_review_run_internal", reviewSafetyMigration],
]) {
  const marker = `create or replace function public.${functionName}(`;
  const start = migration.indexOf(marker);
  const end = migration.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, `${functionName} must exist in base migration`);
  const definition = migration.slice(start, end + 4);
  assert.ok(
    correctiveMigration.includes(definition),
    `${functionName} correction must exactly match the base definition`
  );
}
assert.match(networkToleranceMigration, /tomatoku_runs_v1_draw_idx/);

console.log("==== COMPETITION MIGRATION TEST: PASS ====");
