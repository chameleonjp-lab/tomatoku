create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

alter table public.games
  add column if not exists submission_mode text not null default 'shared';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_submission_mode_check'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_submission_mode_check
      check (submission_mode in ('shared', 'verified'));
  end if;
end;
$$;

update public.games
set is_active = false
where game_slug = 'tomatoku';

insert into public.games (
  game_slug,
  title,
  game_url,
  description,
  share_text,
  score_order,
  score_unit,
  is_active,
  release_date,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  display_order,
  top_ranking_type,
  submission_mode
)
select
  'tomatoku_competition_v1',
  title,
  game_url,
  description,
  share_text,
  score_order,
  score_unit,
  false,
  release_date,
  score_scale,
  score_decimals,
  score_label,
  first_score_label,
  best_score_label,
  display_order,
  top_ranking_type,
  'verified'
from public.games
where game_slug = 'tomatoku'
on conflict (game_slug) do update
set
  title = excluded.title,
  game_url = excluded.game_url,
  description = excluded.description,
  share_text = excluded.share_text,
  score_order = excluded.score_order,
  score_unit = excluded.score_unit,
  is_active = false,
  score_scale = excluded.score_scale,
  score_decimals = excluded.score_decimals,
  score_label = excluded.score_label,
  first_score_label = excluded.first_score_label,
  best_score_label = excluded.best_score_label,
  display_order = excluded.display_order,
  top_ranking_type = excluded.top_ranking_type,
  submission_mode = 'verified';

create table if not exists private.tomatoku_competition_config (
  singleton boolean primary key default true check (singleton),
  generation text not null,
  client_version text not null,
  decks_sha256 text not null,
  accepting_runs boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.tomatoku_competition_config (
  singleton,
  generation,
  client_version,
  decks_sha256,
  accepting_runs
)
values (
  true,
  'random_official_v2',
  'tomatooku-web-3.0.0-verified-competition-v1',
  '1a5c14ef8ff0d45b22f54beb1bf0539dfe83a1e97973efbad2faa7807ec9b68d',
  false
)
on conflict (singleton) do update
set
  generation = excluded.generation,
  client_version = excluded.client_version,
  decks_sha256 = excluded.decks_sha256,
  accepting_runs = false,
  updated_at = now();

create table if not exists private.tomatoku_stage_catalog_v1 (
  stage_id text primary key,
  difficulty smallint not null check (difficulty between 1 and 3),
  difficulty_score integer not null check (difficulty_score > 0),
  regions text[] not null check (cardinality(regions) = 5),
  solution integer[] not null check (cardinality(solution) = 5),
  solution_signature text not null
);

create table if not exists private.tomatoku_draw_sets_v1 (
  deck_id smallint not null check (deck_id between 1 and 8),
  slot_id smallint not null check (slot_id between 1 and 28),
  stage_ids text[] not null check (cardinality(stage_ids) = 3),
  difficulty_score integer not null check (
    difficulty_score between 1258 and 1355
  ),
  primary key (deck_id, slot_id),
  unique (stage_ids)
);

create table if not exists private.tomatoku_runs_v1 (
  run_token uuid primary key,
  game_slug text not null default 'tomatoku_competition_v1'
    check (game_slug = 'tomatoku_competition_v1'),
  generation text not null,
  client_version text not null,
  display_name text not null,
  normalized_name text not null,
  request_key text not null check (request_key ~ '^[0-9a-f]{64}$'),
  deck_id smallint not null,
  slot_id smallint not null,
  stage_ids text[] not null check (cardinality(stage_ids) = 3),
  status text not null default 'prepared'
    check (status in ('prepared', 'active', 'completed', 'expired', 'rejected')),
  prepared_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  client_elapsed_ms integer,
  action_count integer,
  mistake_count integer,
  hint_count integer,
  score integer,
  score_run_id bigint,
  transcript_hash text,
  requires_review boolean not null default false,
  rejection_reason text,
  result_payload jsonb,
  foreign key (deck_id, slot_id)
    references private.tomatoku_draw_sets_v1(deck_id, slot_id)
);

create index if not exists tomatoku_runs_v1_status_expires_idx
  on private.tomatoku_runs_v1 (status, expires_at);
create index if not exists tomatoku_runs_v1_name_prepared_idx
  on private.tomatoku_runs_v1 (normalized_name, prepared_at desc);
create index if not exists tomatoku_runs_v1_request_prepared_idx
  on private.tomatoku_runs_v1 (request_key, prepared_at desc);

revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

-- STAGE_AND_DRAW_SEED
insert into private.tomatoku_stage_catalog_v1 (
  stage_id, difficulty, difficulty_score, regions, solution, solution_signature
) values
  ('STG-01bd306d', 1, 393, array['AAAAB', 'ACABB', 'CCCBB', 'CDDDE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-0385e52f', 3, 553, array['AAAAB', 'ACDAB', 'CCDDB', 'CEEDB', 'CEEDD']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-05388253', 1, 393, array['AAAAB', 'ACBAB', 'CCBBB', 'CDDEE', 'CDDEE']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-07455e25', 3, 569, array['AAAAA', 'ABCDD', 'BBCCD', 'BEECD', 'BEECD']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-0a930c10', 1, 393, array['AAAAA', 'ABCDD', 'EBCCD', 'EBBCD', 'EEBDD']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-0b14368d', 1, 393, array['AAAAB', 'ACBAB', 'DCBBB', 'DCCEE', 'DDCEE']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-0b2e4fff', 2, 430, array['AAAAA', 'ABBBB', 'CCCBB', 'DDCCE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-0e1026c7', 3, 489, array['AAAAB', 'AACCB', 'DDCCB', 'DEEEB', 'DDDEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-0ee6ca8d', 1, 393, array['AAAAB', 'CCBBB', 'DCCCE', 'DDDCE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-0f378577', 1, 393, array['AAABB', 'ACBBB', 'ACCCB', 'DDECC', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-11b0d0ab', 1, 393, array['AAAAB', 'AACBB', 'DCCBE', 'DCBBE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-13fc715e', 2, 400, array['AAAAB', 'ABBBB', 'CCCDB', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-14696f34', 3, 469, array['AAAAB', 'CBBBB', 'CCCCD', 'EEDCD', 'EEDDD']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-158d53a5', 1, 393, array['AAAAB', 'ACDBB', 'CCDDB', 'CEEDE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-1bf62619', 1, 393, array['AAAAB', 'ACBBB', 'CCBDD', 'CDDDE', 'CCEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-1dc27319', 2, 393, array['AAAAB', 'ACDAB', 'CCDDB', 'CDDBB', 'CEEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-1e3f1e3c', 1, 370, array['AAAAA', 'ABBBB', 'CCCCB', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-20357d3a', 1, 385, array['AAAAA', 'ABBCC', 'DDBBC', 'EDDDC', 'EEECC']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-20431284', 1, 381, array['AAAAA', 'ABBBC', 'BBDDC', 'EDDCC', 'EEECC']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-20ebf5b8', 1, 389, array['AAABB', 'ABBBC', 'DDDCC', 'DCCCE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-210399ce', 1, 389, array['AAABB', 'ABBBC', 'AACCC', 'DCCEE', 'DDDEE']::text[], array[3, 0, 2, 4, 1]::integer[], '3,0,2,4,1'),
  ('STG-21d3b7b3', 2, 400, array['AAAAB', 'ACBBB', 'ACDDB', 'CCDDB', 'CEEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-224ae596', 3, 553, array['AAAAB', 'ACDAB', 'CCDBB', 'CDDDE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-23a5d49f', 3, 553, array['AAAAB', 'ACDAB', 'ECDDB', 'ECCDB', 'EECDD']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-246317db', 1, 385, array['AAAAA', 'ABBCC', 'DDBBC', 'DDEEC', 'EEECC']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-2580944b', 3, 477, array['AAAAB', 'AACCB', 'DDCBB', 'DCCBE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-27c59f21', 2, 393, array['AAABB', 'ACBBB', 'CCBDD', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-283aea60', 3, 553, array['AAAAB', 'ACCAB', 'DDCEB', 'DCCEB', 'DDCEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-2857ff8d', 3, 553, array['AAABB', 'ACAAB', 'CCDBB', 'CDDDE', 'CDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-293dd948', 2, 400, array['AAAAB', 'ACBBB', 'ACCDB', 'EECDD', 'EECCD']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-30cd98cb', 3, 593, array['AAAAB', 'AACDB', 'EECDB', 'ECCDB', 'EEDDD']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-34ba9d68', 2, 400, array['AAAAB', 'ACBBB', 'CCBDB', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-38da58ee', 3, 569, array['AAAAA', 'ABCCC', 'DBEEC', 'DBBEC', 'DDBEC']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-397ca53d', 3, 465, array['AAAAB', 'AABBB', 'CCCBB', 'DDCCE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-39ba6d43', 3, 576, array['AAAAB', 'ACCCB', 'DDCEB', 'DCCEB', 'DDDEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-3bb4740f', 3, 476, array['AAABB', 'AAACB', 'DDDCB', 'DEECC', 'DDEEC']::text[], array[4, 1, 3, 0, 2]::integer[], '4,1,3,0,2'),
  ('STG-3f8c1d3f', 3, 549, array['AAAAB', 'ACDAB', 'CCDDB', 'CEEDB', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-423cb2b0', 1, 389, array['AAAAB', 'AACCB', 'DCCBB', 'DEEBE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-43d3c2c1', 3, 552, array['AAAAB', 'ABBBB', 'CDDDB', 'CCCDE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-4c7c450d', 3, 553, array['AAAAB', 'ACCAB', 'DCEEB', 'DCCEB', 'DDCEE']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-587cd483', 3, 493, array['AAAAB', 'AACCB', 'DDCBB', 'DCCEE', 'DDDEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-5aed412d', 3, 500, array['AAABB', 'AACCB', 'DDDCB', 'DCCCE', 'DDEEE']::text[], array[4, 1, 3, 0, 2]::integer[], '4,1,3,0,2'),
  ('STG-5e04e56a', 3, 469, array['AAAAA', 'ABCCD', 'BBCDD', 'BCCDE', 'BCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-6168b936', 2, 393, array['AAAAB', 'ACBBB', 'CCCDB', 'CDDDE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-6319808f', 1, 389, array['AAABB', 'ABBBC', 'ABCCC', 'DEEEC', 'DDDEE']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-697800f8', 2, 393, array['AAAAB', 'ABBBB', 'CCCCB', 'CDDDE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-6c245710', 1, 389, array['AAABB', 'ABBBB', 'CCCDD', 'CDDDE', 'CCEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-70140499', 2, 393, array['AAABB', 'AABBC', 'ACCCC', 'DEEEC', 'DDDEE']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-736d5a60', 2, 400, array['AAAAB', 'ACCBB', 'DCCBE', 'DCEBE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-75e7cc16', 2, 393, array['AAAAB', 'ACCAB', 'DCBBB', 'DCCCE', 'DDEEE']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-77f0d4b9', 2, 393, array['AAAAB', 'ABBBB', 'ABCDD', 'ECCCD', 'EEECD']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-79279693', 2, 393, array['AAABB', 'ACAAB', 'DCBBB', 'DCCEE', 'DDCEE']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-7dfeb90a', 3, 553, array['AAAAB', 'ACDAB', 'CCDEB', 'CDDEB', 'CCDEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-82b47f4f', 1, 389, array['AAAAA', 'ABCCC', 'BBCDC', 'BDDDE', 'BDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-8a377eb4', 3, 476, array['AAAAB', 'CCABB', 'DCCBE', 'DCEBE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-8c4df48e', 1, 389, array['AAABB', 'ABBBC', 'DECCC', 'DEECC', 'DDEEE']::text[], array[1, 3, 0, 4, 2]::integer[], '1,3,0,4,2'),
  ('STG-8e3e7a46', 1, 389, array['AAAAA', 'BBBCC', 'DDBBC', 'DDEEC', 'EEECC']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-94ef9261', 2, 400, array['AAAAB', 'ABBBB', 'ACDDB', 'CCDDE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-a27903af', 1, 385, array['AAAAA', 'BACCC', 'BCCDD', 'BDDDE', 'BBEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-a53237c1', 1, 389, array['AAAAA', 'ABCCC', 'BBBCC', 'BDDDE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-a6649fc6', 2, 393, array['AAAAB', 'ACCAB', 'CCBBB', 'CDEEE', 'CDDDE']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-a6de5d4e', 3, 508, array['AAAAB', 'ACDBB', 'ACDDB', 'ECCDB', 'EEEDD']::text[], array[2, 4, 1, 3, 0]::integer[], '2,4,1,3,0'),
  ('STG-a75c43f5', 2, 400, array['AAAAB', 'ABBBB', 'ACCCB', 'DDCCE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-aaee755b', 2, 393, array['AAAAB', 'ACBAB', 'CCBBB', 'CDDDD', 'CEEEE']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-b0ff7699', 1, 369, array['AAAAA', 'ABBBB', 'BBCDD', 'ECCCD', 'EEECD']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-b5dc2753', 2, 400, array['AAAAB', 'ACABB', 'CCBBB', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-b90b2bf2', 3, 461, array['AAAAA', 'ABBBC', 'DDDBC', 'EEDDC', 'EECCC']::text[], array[3, 1, 4, 2, 0]::integer[], '3,1,4,2,0'),
  ('STG-ba446d6d', 1, 389, array['AAABB', 'ABBBC', 'DBCCC', 'DEECC', 'DDEEE']::text[], array[1, 3, 0, 4, 2]::integer[], '1,3,0,4,2'),
  ('STG-bb3d9d29', 2, 400, array['AAAAB', 'ACCCB', 'DCBBB', 'DCCBE', 'DDEEE']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-bda38a0d', 2, 393, array['AAAAB', 'ACBAB', 'DCBBB', 'DCCCE', 'DDEEE']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-c551c232', 2, 393, array['AAAAA', 'ABCDD', 'BBCCD', 'BEECD', 'BEEDD']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-c6d111cc', 1, 389, array['AAAAB', 'AABBB', 'CCCCB', 'CDDCE', 'DDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4'),
  ('STG-c8be2e53', 2, 449, array['AAAAB', 'ABBBB', 'CCCCB', 'DDECC', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-d14a7bfa', 1, 389, array['AAABB', 'ABBBC', 'DCCCC', 'DEEEC', 'DDEEE']::text[], array[1, 3, 0, 4, 2]::integer[], '1,3,0,4,2'),
  ('STG-d4c697b7', 2, 393, array['AAABB', 'AACCB', 'DDDCB', 'DEECC', 'DDEEE']::text[], array[4, 1, 3, 0, 2]::integer[], '4,1,3,0,2'),
  ('STG-d50fa544', 3, 552, array['AAAAB', 'ABBBB', 'CDDDB', 'CDEDE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-d6eb37e7', 2, 393, array['AAAAB', 'ACDAB', 'CCDBB', 'CDDBE', 'CDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-e035bb47', 3, 542, array['AAAAB', 'ACBBB', 'DCCCC', 'DEECE', 'DDEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-e48d77b6', 1, 385, array['AAAAA', 'BACCC', 'BCCDD', 'BEEDD', 'BBEEE']::text[], array[1, 3, 0, 4, 2]::integer[], '1,3,0,4,2'),
  ('STG-edb742a5', 2, 393, array['AAAAB', 'ACBAB', 'CCBBB', 'CDEEE', 'CDDDE']::text[], array[2, 4, 0, 3, 1]::integer[], '2,4,0,3,1'),
  ('STG-ee9efd5b', 2, 393, array['AAAAB', 'ACCAB', 'DCBBB', 'DCCBE', 'DDEEE']::text[], array[3, 1, 4, 0, 2]::integer[], '3,1,4,0,2'),
  ('STG-f523e201', 3, 484, array['AAAAB', 'ACDDB', 'CCDBB', 'CDDBE', 'CCEEE']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-f8f2d8e6', 3, 576, array['AAAAB', 'ACCDB', 'EECDB', 'ECCDB', 'EEEDD']::text[], array[1, 4, 2, 0, 3]::integer[], '1,4,2,0,3'),
  ('STG-fad5b9d3', 2, 393, array['AAAAB', 'AABBB', 'CCCBB', 'CDDDE', 'CDEEE']::text[], array[1, 3, 0, 2, 4]::integer[], '1,3,0,2,4')
on conflict (stage_id) do update
set
  difficulty = excluded.difficulty,
  difficulty_score = excluded.difficulty_score,
  regions = excluded.regions,
  solution = excluded.solution,
  solution_signature = excluded.solution_signature;

insert into private.tomatoku_draw_sets_v1 (
  deck_id, slot_id, stage_ids, difficulty_score
) values
  (1, 1, array['STG-01bd306d', 'STG-75e7cc16', 'STG-2580944b']::text[], 1263),
  (1, 2, array['STG-05388253', 'STG-27c59f21', 'STG-8a377eb4']::text[], 1262),
  (1, 3, array['STG-0a930c10', 'STG-13fc715e', 'STG-587cd483']::text[], 1286),
  (1, 4, array['STG-0b14368d', 'STG-d4c697b7', 'STG-43d3c2c1']::text[], 1338),
  (1, 5, array['STG-0ee6ca8d', 'STG-ee9efd5b', 'STG-0385e52f']::text[], 1339),
  (1, 6, array['STG-0f378577', 'STG-70140499', 'STG-d50fa544']::text[], 1338),
  (1, 7, array['STG-11b0d0ab', 'STG-34ba9d68', 'STG-397ca53d']::text[], 1258),
  (1, 8, array['STG-158d53a5', 'STG-b5dc2753', 'STG-283aea60']::text[], 1346),
  (1, 9, array['STG-1bf62619', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1284),
  (1, 10, array['STG-1e3f1e3c', 'STG-21d3b7b3', 'STG-a6de5d4e']::text[], 1278),
  (1, 11, array['STG-20357d3a', 'STG-aaee755b', 'STG-2857ff8d']::text[], 1331),
  (1, 12, array['STG-20431284', 'STG-79279693', 'STG-f8f2d8e6']::text[], 1350),
  (1, 13, array['STG-20ebf5b8', 'STG-edb742a5', 'STG-f523e201']::text[], 1266),
  (1, 14, array['STG-210399ce', 'STG-d6eb37e7', 'STG-23a5d49f']::text[], 1335),
  (1, 15, array['STG-246317db', 'STG-77f0d4b9', 'STG-0e1026c7']::text[], 1267),
  (1, 16, array['STG-423cb2b0', 'STG-a6649fc6', 'STG-7dfeb90a']::text[], 1335),
  (1, 17, array['STG-6319808f', 'STG-c551c232', 'STG-224ae596']::text[], 1335),
  (1, 18, array['STG-6c245710', 'STG-736d5a60', 'STG-5aed412d']::text[], 1289),
  (1, 19, array['STG-82b47f4f', 'STG-293dd948', 'STG-14696f34']::text[], 1258),
  (1, 20, array['STG-8c4df48e', 'STG-c8be2e53', 'STG-3bb4740f']::text[], 1314),
  (1, 21, array['STG-8e3e7a46', 'STG-a75c43f5', 'STG-4c7c450d']::text[], 1342),
  (1, 22, array['STG-a27903af', 'STG-94ef9261', 'STG-38da58ee']::text[], 1354),
  (1, 23, array['STG-a53237c1', 'STG-bda38a0d', 'STG-e035bb47']::text[], 1324),
  (1, 24, array['STG-b0ff7699', 'STG-fad5b9d3', 'STG-30cd98cb']::text[], 1355),
  (1, 25, array['STG-ba446d6d', 'STG-697800f8', 'STG-3f8c1d3f']::text[], 1331),
  (1, 26, array['STG-c6d111cc', 'STG-bb3d9d29', 'STG-5e04e56a']::text[], 1258),
  (1, 27, array['STG-d14a7bfa', 'STG-1dc27319', 'STG-07455e25']::text[], 1351),
  (1, 28, array['STG-e48d77b6', 'STG-6168b936', 'STG-39ba6d43']::text[], 1354),
  (2, 1, array['STG-01bd306d', 'STG-a6649fc6', 'STG-587cd483']::text[], 1279),
  (2, 2, array['STG-05388253', 'STG-fad5b9d3', 'STG-8a377eb4']::text[], 1262),
  (2, 3, array['STG-0a930c10', 'STG-edb742a5', 'STG-0e1026c7']::text[], 1275),
  (2, 4, array['STG-0b14368d', 'STG-94ef9261', 'STG-0385e52f']::text[], 1346),
  (2, 5, array['STG-0ee6ca8d', 'STG-ee9efd5b', 'STG-283aea60']::text[], 1339),
  (2, 6, array['STG-0f378577', 'STG-293dd948', 'STG-5e04e56a']::text[], 1262),
  (2, 7, array['STG-11b0d0ab', 'STG-13fc715e', 'STG-397ca53d']::text[], 1258),
  (2, 8, array['STG-158d53a5', 'STG-6168b936', 'STG-2580944b']::text[], 1263),
  (2, 9, array['STG-1bf62619', 'STG-a75c43f5', 'STG-a6de5d4e']::text[], 1301),
  (2, 10, array['STG-1e3f1e3c', 'STG-aaee755b', 'STG-39ba6d43']::text[], 1339),
  (2, 11, array['STG-20357d3a', 'STG-736d5a60', 'STG-07455e25']::text[], 1354),
  (2, 12, array['STG-20431284', 'STG-79279693', 'STG-2857ff8d']::text[], 1327),
  (2, 13, array['STG-20ebf5b8', 'STG-21d3b7b3', 'STG-4c7c450d']::text[], 1342),
  (2, 14, array['STG-210399ce', 'STG-27c59f21', 'STG-3f8c1d3f']::text[], 1331),
  (2, 15, array['STG-246317db', 'STG-c551c232', 'STG-f8f2d8e6']::text[], 1354),
  (2, 16, array['STG-423cb2b0', 'STG-bb3d9d29', 'STG-23a5d49f']::text[], 1342),
  (2, 17, array['STG-6319808f', 'STG-70140499', 'STG-43d3c2c1']::text[], 1334),
  (2, 18, array['STG-6c245710', 'STG-d4c697b7', 'STG-e035bb47']::text[], 1324),
  (2, 19, array['STG-82b47f4f', 'STG-77f0d4b9', 'STG-7dfeb90a']::text[], 1335),
  (2, 20, array['STG-8c4df48e', 'STG-b5dc2753', 'STG-14696f34']::text[], 1258),
  (2, 21, array['STG-8e3e7a46', 'STG-1dc27319', 'STG-38da58ee']::text[], 1351),
  (2, 22, array['STG-a27903af', 'STG-75e7cc16', 'STG-d50fa544']::text[], 1330),
  (2, 23, array['STG-a53237c1', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1280),
  (2, 24, array['STG-b0ff7699', 'STG-697800f8', 'STG-30cd98cb']::text[], 1355),
  (2, 25, array['STG-ba446d6d', 'STG-c8be2e53', 'STG-3bb4740f']::text[], 1314),
  (2, 26, array['STG-c6d111cc', 'STG-d6eb37e7', 'STG-5aed412d']::text[], 1282),
  (2, 27, array['STG-d14a7bfa', 'STG-bda38a0d', 'STG-f523e201']::text[], 1266),
  (2, 28, array['STG-e48d77b6', 'STG-34ba9d68', 'STG-224ae596']::text[], 1338),
  (3, 1, array['STG-01bd306d', 'STG-77f0d4b9', 'STG-d50fa544']::text[], 1338),
  (3, 2, array['STG-05388253', 'STG-79279693', 'STG-2580944b']::text[], 1263),
  (3, 3, array['STG-0a930c10', 'STG-697800f8', 'STG-e035bb47']::text[], 1328),
  (3, 4, array['STG-0b14368d', 'STG-edb742a5', 'STG-8a377eb4']::text[], 1262),
  (3, 5, array['STG-0ee6ca8d', 'STG-ee9efd5b', 'STG-2857ff8d']::text[], 1339),
  (3, 6, array['STG-0f378577', 'STG-13fc715e', 'STG-397ca53d']::text[], 1258),
  (3, 7, array['STG-11b0d0ab', 'STG-aaee755b', 'STG-7dfeb90a']::text[], 1339),
  (3, 8, array['STG-158d53a5', 'STG-fad5b9d3', 'STG-43d3c2c1']::text[], 1338),
  (3, 9, array['STG-1bf62619', 'STG-736d5a60', 'STG-5aed412d']::text[], 1293),
  (3, 10, array['STG-1e3f1e3c', 'STG-21d3b7b3', 'STG-4c7c450d']::text[], 1323),
  (3, 11, array['STG-20357d3a', 'STG-75e7cc16', 'STG-f8f2d8e6']::text[], 1354),
  (3, 12, array['STG-20431284', 'STG-6168b936', 'STG-587cd483']::text[], 1267),
  (3, 13, array['STG-20ebf5b8', 'STG-94ef9261', 'STG-23a5d49f']::text[], 1342),
  (3, 14, array['STG-210399ce', 'STG-34ba9d68', 'STG-14696f34']::text[], 1258),
  (3, 15, array['STG-246317db', 'STG-a75c43f5', 'STG-0385e52f']::text[], 1338),
  (3, 16, array['STG-423cb2b0', 'STG-c551c232', 'STG-38da58ee']::text[], 1351),
  (3, 17, array['STG-6319808f', 'STG-70140499', 'STG-f523e201']::text[], 1266),
  (3, 18, array['STG-6c245710', 'STG-1dc27319', 'STG-07455e25']::text[], 1351),
  (3, 19, array['STG-82b47f4f', 'STG-bb3d9d29', 'STG-283aea60']::text[], 1342),
  (3, 20, array['STG-8c4df48e', 'STG-d6eb37e7', 'STG-a6de5d4e']::text[], 1290),
  (3, 21, array['STG-8e3e7a46', 'STG-d4c697b7', 'STG-0e1026c7']::text[], 1271),
  (3, 22, array['STG-a27903af', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1276),
  (3, 23, array['STG-a53237c1', 'STG-c8be2e53', 'STG-3bb4740f']::text[], 1314),
  (3, 24, array['STG-b0ff7699', 'STG-27c59f21', 'STG-30cd98cb']::text[], 1355),
  (3, 25, array['STG-ba446d6d', 'STG-b5dc2753', 'STG-224ae596']::text[], 1342),
  (3, 26, array['STG-c6d111cc', 'STG-293dd948', 'STG-5e04e56a']::text[], 1258),
  (3, 27, array['STG-d14a7bfa', 'STG-bda38a0d', 'STG-3f8c1d3f']::text[], 1331),
  (3, 28, array['STG-e48d77b6', 'STG-a6649fc6', 'STG-39ba6d43']::text[], 1354),
  (4, 1, array['STG-01bd306d', 'STG-a75c43f5', 'STG-4c7c450d']::text[], 1346),
  (4, 2, array['STG-05388253', 'STG-13fc715e', 'STG-397ca53d']::text[], 1258),
  (4, 3, array['STG-0a930c10', 'STG-bb3d9d29', 'STG-5e04e56a']::text[], 1262),
  (4, 4, array['STG-0b14368d', 'STG-ee9efd5b', 'STG-2580944b']::text[], 1263),
  (4, 5, array['STG-0ee6ca8d', 'STG-d4c697b7', 'STG-e035bb47']::text[], 1328),
  (4, 6, array['STG-0f378577', 'STG-fad5b9d3', 'STG-07455e25']::text[], 1355),
  (4, 7, array['STG-11b0d0ab', 'STG-c551c232', 'STG-f523e201']::text[], 1270),
  (4, 8, array['STG-158d53a5', 'STG-697800f8', 'STG-0e1026c7']::text[], 1275),
  (4, 9, array['STG-1bf62619', 'STG-94ef9261', 'STG-3bb4740f']::text[], 1269),
  (4, 10, array['STG-1e3f1e3c', 'STG-70140499', 'STG-f8f2d8e6']::text[], 1339),
  (4, 11, array['STG-20357d3a', 'STG-a6649fc6', 'STG-587cd483']::text[], 1271),
  (4, 12, array['STG-20431284', 'STG-75e7cc16', 'STG-7dfeb90a']::text[], 1327),
  (4, 13, array['STG-20ebf5b8', 'STG-c8be2e53', 'STG-a6de5d4e']::text[], 1346),
  (4, 14, array['STG-210399ce', 'STG-6168b936', 'STG-d50fa544']::text[], 1334),
  (4, 15, array['STG-246317db', 'STG-b5dc2753', 'STG-8a377eb4']::text[], 1261),
  (4, 16, array['STG-423cb2b0', 'STG-27c59f21', 'STG-43d3c2c1']::text[], 1334),
  (4, 17, array['STG-6319808f', 'STG-34ba9d68', 'STG-2857ff8d']::text[], 1342),
  (4, 18, array['STG-6c245710', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1280),
  (4, 19, array['STG-82b47f4f', 'STG-bda38a0d', 'STG-283aea60']::text[], 1335),
  (4, 20, array['STG-8c4df48e', 'STG-d6eb37e7', 'STG-38da58ee']::text[], 1351),
  (4, 21, array['STG-8e3e7a46', 'STG-736d5a60', 'STG-0385e52f']::text[], 1342),
  (4, 22, array['STG-a27903af', 'STG-1dc27319', 'STG-5aed412d']::text[], 1278),
  (4, 23, array['STG-a53237c1', 'STG-77f0d4b9', 'STG-3f8c1d3f']::text[], 1331),
  (4, 24, array['STG-b0ff7699', 'STG-aaee755b', 'STG-30cd98cb']::text[], 1355),
  (4, 25, array['STG-ba446d6d', 'STG-edb742a5', 'STG-224ae596']::text[], 1335),
  (4, 26, array['STG-c6d111cc', 'STG-21d3b7b3', 'STG-23a5d49f']::text[], 1342),
  (4, 27, array['STG-d14a7bfa', 'STG-293dd948', 'STG-14696f34']::text[], 1258),
  (4, 28, array['STG-e48d77b6', 'STG-79279693', 'STG-39ba6d43']::text[], 1354),
  (5, 1, array['STG-01bd306d', 'STG-bb3d9d29', 'STG-2857ff8d']::text[], 1346),
  (5, 2, array['STG-05388253', 'STG-a75c43f5', 'STG-23a5d49f']::text[], 1346),
  (5, 3, array['STG-0a930c10', 'STG-13fc715e', 'STG-14696f34']::text[], 1262),
  (5, 4, array['STG-0b14368d', 'STG-a6649fc6', 'STG-d50fa544']::text[], 1338),
  (5, 5, array['STG-0ee6ca8d', 'STG-70140499', 'STG-07455e25']::text[], 1355),
  (5, 6, array['STG-0f378577', 'STG-34ba9d68', 'STG-397ca53d']::text[], 1258),
  (5, 7, array['STG-11b0d0ab', 'STG-fad5b9d3', 'STG-3f8c1d3f']::text[], 1335),
  (5, 8, array['STG-158d53a5', 'STG-6168b936', 'STG-43d3c2c1']::text[], 1338),
  (5, 9, array['STG-1bf62619', 'STG-79279693', 'STG-587cd483']::text[], 1279),
  (5, 10, array['STG-1e3f1e3c', 'STG-d6eb37e7', 'STG-38da58ee']::text[], 1332),
  (5, 11, array['STG-20357d3a', 'STG-75e7cc16', 'STG-224ae596']::text[], 1331),
  (5, 12, array['STG-20431284', 'STG-aaee755b', 'STG-39ba6d43']::text[], 1350),
  (5, 13, array['STG-20ebf5b8', 'STG-0b2e4fff', 'STG-a6de5d4e']::text[], 1327),
  (5, 14, array['STG-210399ce', 'STG-ee9efd5b', 'STG-0e1026c7']::text[], 1271),
  (5, 15, array['STG-246317db', 'STG-77f0d4b9', 'STG-7dfeb90a']::text[], 1331),
  (5, 16, array['STG-423cb2b0', 'STG-b5dc2753', 'STG-5e04e56a']::text[], 1258),
  (5, 17, array['STG-6319808f', 'STG-27c59f21', 'STG-8a377eb4']::text[], 1258),
  (5, 18, array['STG-6c245710', 'STG-d4c697b7', 'STG-f523e201']::text[], 1266),
  (5, 19, array['STG-82b47f4f', 'STG-c8be2e53', 'STG-b90b2bf2']::text[], 1299),
  (5, 20, array['STG-8c4df48e', 'STG-bda38a0d', 'STG-2580944b']::text[], 1259),
  (5, 21, array['STG-8e3e7a46', 'STG-293dd948', 'STG-283aea60']::text[], 1342),
  (5, 22, array['STG-a27903af', 'STG-1dc27319', 'STG-4c7c450d']::text[], 1331),
  (5, 23, array['STG-a53237c1', 'STG-edb742a5', 'STG-e035bb47']::text[], 1324),
  (5, 24, array['STG-b0ff7699', 'STG-c551c232', 'STG-30cd98cb']::text[], 1355),
  (5, 25, array['STG-ba446d6d', 'STG-736d5a60', 'STG-3bb4740f']::text[], 1265),
  (5, 26, array['STG-c6d111cc', 'STG-94ef9261', 'STG-0385e52f']::text[], 1342),
  (5, 27, array['STG-d14a7bfa', 'STG-21d3b7b3', 'STG-5aed412d']::text[], 1289),
  (5, 28, array['STG-e48d77b6', 'STG-697800f8', 'STG-f8f2d8e6']::text[], 1354),
  (6, 1, array['STG-01bd306d', 'STG-94ef9261', 'STG-5aed412d']::text[], 1293),
  (6, 2, array['STG-05388253', 'STG-293dd948', 'STG-5e04e56a']::text[], 1262),
  (6, 3, array['STG-0a930c10', 'STG-c551c232', 'STG-7dfeb90a']::text[], 1339),
  (6, 4, array['STG-0b14368d', 'STG-70140499', 'STG-0e1026c7']::text[], 1275),
  (6, 5, array['STG-0ee6ca8d', 'STG-13fc715e', 'STG-587cd483']::text[], 1286),
  (6, 6, array['STG-0f378577', 'STG-b5dc2753', 'STG-397ca53d']::text[], 1258),
  (6, 7, array['STG-11b0d0ab', 'STG-79279693', 'STG-3bb4740f']::text[], 1262),
  (6, 8, array['STG-158d53a5', 'STG-bda38a0d', 'STG-43d3c2c1']::text[], 1338),
  (6, 9, array['STG-1bf62619', 'STG-aaee755b', 'STG-e035bb47']::text[], 1328),
  (6, 10, array['STG-1e3f1e3c', 'STG-a75c43f5', 'STG-23a5d49f']::text[], 1323),
  (6, 11, array['STG-20357d3a', 'STG-75e7cc16', 'STG-39ba6d43']::text[], 1354),
  (6, 12, array['STG-20431284', 'STG-1dc27319', 'STG-07455e25']::text[], 1343),
  (6, 13, array['STG-20ebf5b8', 'STG-bb3d9d29', 'STG-3f8c1d3f']::text[], 1338),
  (6, 14, array['STG-210399ce', 'STG-27c59f21', 'STG-2580944b']::text[], 1259),
  (6, 15, array['STG-246317db', 'STG-21d3b7b3', 'STG-38da58ee']::text[], 1354),
  (6, 16, array['STG-423cb2b0', 'STG-34ba9d68', 'STG-14696f34']::text[], 1258),
  (6, 17, array['STG-6319808f', 'STG-d6eb37e7', 'STG-0385e52f']::text[], 1335),
  (6, 18, array['STG-6c245710', 'STG-c8be2e53', 'STG-a6de5d4e']::text[], 1346),
  (6, 19, array['STG-82b47f4f', 'STG-a6649fc6', 'STG-f523e201']::text[], 1266),
  (6, 20, array['STG-8c4df48e', 'STG-697800f8', 'STG-283aea60']::text[], 1335),
  (6, 21, array['STG-8e3e7a46', 'STG-fad5b9d3', 'STG-224ae596']::text[], 1335),
  (6, 22, array['STG-a27903af', 'STG-77f0d4b9', 'STG-f8f2d8e6']::text[], 1354),
  (6, 23, array['STG-a53237c1', 'STG-736d5a60', 'STG-4c7c450d']::text[], 1342),
  (6, 24, array['STG-b0ff7699', 'STG-edb742a5', 'STG-30cd98cb']::text[], 1355),
  (6, 25, array['STG-ba446d6d', 'STG-d4c697b7', 'STG-8a377eb4']::text[], 1258),
  (6, 26, array['STG-c6d111cc', 'STG-ee9efd5b', 'STG-d50fa544']::text[], 1334),
  (6, 27, array['STG-d14a7bfa', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1280),
  (6, 28, array['STG-e48d77b6', 'STG-6168b936', 'STG-2857ff8d']::text[], 1331),
  (7, 1, array['STG-01bd306d', 'STG-c551c232', 'STG-8a377eb4']::text[], 1262),
  (7, 2, array['STG-05388253', 'STG-ee9efd5b', 'STG-587cd483']::text[], 1279),
  (7, 3, array['STG-0a930c10', 'STG-697800f8', 'STG-3f8c1d3f']::text[], 1335),
  (7, 4, array['STG-0b14368d', 'STG-c8be2e53', 'STG-b90b2bf2']::text[], 1303),
  (7, 5, array['STG-0ee6ca8d', 'STG-b5dc2753', 'STG-397ca53d']::text[], 1258),
  (7, 6, array['STG-0f378577', 'STG-bda38a0d', 'STG-224ae596']::text[], 1339),
  (7, 7, array['STG-11b0d0ab', 'STG-77f0d4b9', 'STG-07455e25']::text[], 1355),
  (7, 8, array['STG-158d53a5', 'STG-edb742a5', 'STG-d50fa544']::text[], 1338),
  (7, 9, array['STG-1bf62619', 'STG-70140499', 'STG-7dfeb90a']::text[], 1339),
  (7, 10, array['STG-1e3f1e3c', 'STG-a75c43f5', 'STG-a6de5d4e']::text[], 1278),
  (7, 11, array['STG-20357d3a', 'STG-13fc715e', 'STG-2857ff8d']::text[], 1338),
  (7, 12, array['STG-20431284', 'STG-94ef9261', 'STG-23a5d49f']::text[], 1334),
  (7, 13, array['STG-20ebf5b8', 'STG-79279693', 'STG-2580944b']::text[], 1259),
  (7, 14, array['STG-210399ce', 'STG-21d3b7b3', 'STG-0385e52f']::text[], 1342),
  (7, 15, array['STG-246317db', 'STG-27c59f21', 'STG-39ba6d43']::text[], 1354),
  (7, 16, array['STG-423cb2b0', 'STG-293dd948', 'STG-5e04e56a']::text[], 1258),
  (7, 17, array['STG-6319808f', 'STG-34ba9d68', 'STG-f523e201']::text[], 1273),
  (7, 18, array['STG-6c245710', 'STG-75e7cc16', 'STG-283aea60']::text[], 1335),
  (7, 19, array['STG-82b47f4f', 'STG-736d5a60', 'STG-5aed412d']::text[], 1289),
  (7, 20, array['STG-8c4df48e', 'STG-0b2e4fff', 'STG-3bb4740f']::text[], 1295),
  (7, 21, array['STG-8e3e7a46', 'STG-d6eb37e7', 'STG-4c7c450d']::text[], 1335),
  (7, 22, array['STG-a27903af', 'STG-a6649fc6', 'STG-f8f2d8e6']::text[], 1354),
  (7, 23, array['STG-a53237c1', 'STG-bb3d9d29', 'STG-14696f34']::text[], 1258),
  (7, 24, array['STG-b0ff7699', 'STG-6168b936', 'STG-30cd98cb']::text[], 1355),
  (7, 25, array['STG-ba446d6d', 'STG-fad5b9d3', 'STG-43d3c2c1']::text[], 1334),
  (7, 26, array['STG-c6d111cc', 'STG-aaee755b', 'STG-0e1026c7']::text[], 1271),
  (7, 27, array['STG-d14a7bfa', 'STG-d4c697b7', 'STG-e035bb47']::text[], 1324),
  (7, 28, array['STG-e48d77b6', 'STG-1dc27319', 'STG-38da58ee']::text[], 1347),
  (8, 1, array['STG-01bd306d', 'STG-c8be2e53', 'STG-3bb4740f']::text[], 1318),
  (8, 2, array['STG-05388253', 'STG-ee9efd5b', 'STG-7dfeb90a']::text[], 1339),
  (8, 3, array['STG-0a930c10', 'STG-34ba9d68', 'STG-5e04e56a']::text[], 1262),
  (8, 4, array['STG-0b14368d', 'STG-b5dc2753', 'STG-8a377eb4']::text[], 1269),
  (8, 5, array['STG-0ee6ca8d', 'STG-293dd948', 'STG-397ca53d']::text[], 1258),
  (8, 6, array['STG-0f378577', 'STG-697800f8', 'STG-e035bb47']::text[], 1328),
  (8, 7, array['STG-11b0d0ab', 'STG-bb3d9d29', 'STG-14696f34']::text[], 1262),
  (8, 8, array['STG-158d53a5', 'STG-6168b936', 'STG-2857ff8d']::text[], 1339),
  (8, 9, array['STG-1bf62619', 'STG-d6eb37e7', 'STG-5aed412d']::text[], 1286),
  (8, 10, array['STG-1e3f1e3c', 'STG-bda38a0d', 'STG-f8f2d8e6']::text[], 1339),
  (8, 11, array['STG-20357d3a', 'STG-a6649fc6', 'STG-39ba6d43']::text[], 1354),
  (8, 12, array['STG-20431284', 'STG-21d3b7b3', 'STG-a6de5d4e']::text[], 1289),
  (8, 13, array['STG-20ebf5b8', 'STG-d4c697b7', 'STG-2580944b']::text[], 1259),
  (8, 14, array['STG-210399ce', 'STG-79279693', 'STG-f523e201']::text[], 1266),
  (8, 15, array['STG-246317db', 'STG-edb742a5', 'STG-d50fa544']::text[], 1330),
  (8, 16, array['STG-423cb2b0', 'STG-fad5b9d3', 'STG-07455e25']::text[], 1351),
  (8, 17, array['STG-6319808f', 'STG-27c59f21', 'STG-587cd483']::text[], 1275),
  (8, 18, array['STG-6c245710', 'STG-c551c232', 'STG-224ae596']::text[], 1335),
  (8, 19, array['STG-82b47f4f', 'STG-70140499', 'STG-0e1026c7']::text[], 1271),
  (8, 20, array['STG-8c4df48e', 'STG-94ef9261', 'STG-0385e52f']::text[], 1342),
  (8, 21, array['STG-8e3e7a46', 'STG-736d5a60', 'STG-23a5d49f']::text[], 1342),
  (8, 22, array['STG-a27903af', 'STG-a75c43f5', 'STG-38da58ee']::text[], 1354),
  (8, 23, array['STG-a53237c1', 'STG-aaee755b', 'STG-283aea60']::text[], 1335),
  (8, 24, array['STG-b0ff7699', 'STG-75e7cc16', 'STG-30cd98cb']::text[], 1355),
  (8, 25, array['STG-ba446d6d', 'STG-0b2e4fff', 'STG-b90b2bf2']::text[], 1280),
  (8, 26, array['STG-c6d111cc', 'STG-77f0d4b9', 'STG-3f8c1d3f']::text[], 1331),
  (8, 27, array['STG-d14a7bfa', 'STG-13fc715e', 'STG-43d3c2c1']::text[], 1341),
  (8, 28, array['STG-e48d77b6', 'STG-1dc27319', 'STG-4c7c450d']::text[], 1331)
on conflict (deck_id, slot_id) do update
set
  stage_ids = excluded.stage_ids,
  difficulty_score = excluded.difficulty_score;

do $$
begin
  if (select count(*) from private.tomatoku_stage_catalog_v1) <> 84 then
    raise exception 'competition stage catalog must contain 84 stages';
  end if;
  if exists (
    select 1
    from private.tomatoku_stage_catalog_v1
    group by difficulty
    having count(*) <> 28
  ) then
    raise exception 'each competition difficulty must contain 28 stages';
  end if;
  if (select count(*) from private.tomatoku_draw_sets_v1) <> 224 then
    raise exception 'competition draw must contain 224 sets';
  end if;
  if exists (
    select 1
    from private.tomatoku_stage_catalog_v1 stage
    where (
      select count(*)
      from private.tomatoku_draw_sets_v1 draw
      where stage.stage_id = any(draw.stage_ids)
    ) <> 8
  ) then
    raise exception 'each stage must appear exactly 8 times';
  end if;
  if exists (
    select 1
    from private.tomatoku_draw_sets_v1 draw
    cross join lateral unnest(draw.stage_ids) with ordinality selected(stage_id, position)
    join private.tomatoku_stage_catalog_v1 stage using (stage_id)
    where stage.difficulty <> selected.position
  ) then
    raise exception 'competition draw difficulty order is invalid';
  end if;
  if (
    select max(difficulty_score)::numeric / min(difficulty_score)
    from private.tomatoku_draw_sets_v1
  ) > 1.08 then
    raise exception 'competition draw difficulty ratio exceeds 1.08';
  end if;
end;
$$;

create or replace function private.guard_verified_score_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_slug text;
  v_run_token_text text;
  v_run_token uuid;
  v_run private.tomatoku_runs_v1%rowtype;
begin
  v_game_slug := case when tg_op = 'DELETE' then old.game_slug else new.game_slug end;

  if exists (
    select 1
    from public.games g
    where g.game_slug = v_game_slug
      and g.submission_mode = 'verified'
  ) then
    if current_setting('app.tomatoku_verified_admin', true) = 'review' then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    v_run_token_text := nullif(
      current_setting('app.tomatoku_verified_run', true),
      ''
    );
    begin
      v_run_token := v_run_token_text::uuid;
    exception when others then
      raise exception 'verified score write requires a valid run';
    end;

    select *
    into v_run
    from private.tomatoku_runs_v1 r
    where r.run_token = v_run_token
      and r.game_slug = v_game_slug
      and r.status = 'active';
    if not found then
      raise exception 'verified score write requires an active run';
    end if;
    if new.normalized_name is distinct from v_run.normalized_name then
      raise exception 'verified score write does not match the active run';
    end if;
    if tg_table_name = 'score_runs'
      and (
        new.score is distinct from v_run.score
        or new.client_version is distinct from v_run.client_version
      )
    then
      raise exception 'verified score write values do not match the active run';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_verified_score_runs
  on public.score_runs;
create trigger guard_verified_score_runs
before insert or update on public.score_runs
for each row execute function private.guard_verified_score_write();

drop trigger if exists guard_verified_game_scores
  on public.game_scores;
create trigger guard_verified_game_scores
before insert or update on public.game_scores
for each row execute function private.guard_verified_score_write();

create or replace function public.tomatoku_prepare_run_internal(
  p_display_name text,
  p_client_version text,
  p_request_key text
)
returns table (
  accepted boolean,
  run_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.tomatoku_competition_config%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_set private.tomatoku_draw_sets_v1%rowtype;
  v_run_token uuid := gen_random_uuid();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tomatoku-prepare-v1', 0)
  );

  select *
  into v_config
  from private.tomatoku_competition_config
  where singleton = true;

  if v_config.accepting_runs is not true
    or not exists (
      select 1
      from public.games g
      where g.game_slug = 'tomatoku_competition_v1'
        and g.is_active = true
        and g.submission_mode = 'verified'
    )
  then
    raise exception 'competition is paused';
  end if;
  if p_client_version is distinct from v_config.client_version then
    raise exception 'client version is not current';
  end if;
  if p_request_key is null or p_request_key !~ '^[0-9a-f]{64}$' then
    raise exception 'request key is invalid';
  end if;

  v_display_name := pg_catalog.regexp_replace(
    normalize(pg_catalog.btrim(coalesce(p_display_name, '')), NFKC),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if v_display_name ~ '[[:cntrl:]]'
    or v_display_name ~ U&'[\061C\200B-\200F\202A-\202E\2060-\206F\FEFF]'
  then
    raise exception 'name contains hidden characters';
  end if;
  v_normalized_name := public.normalize_player_name(v_display_name);
  if char_length(v_normalized_name) = 0 then
    raise exception 'name is empty';
  end if;
  if char_length(v_normalized_name) > 20 then
    raise exception 'name is too long';
  end if;

  update private.tomatoku_runs_v1
  set status = 'expired'
  where status in ('prepared', 'active')
    and expires_at < clock_timestamp();

  delete from private.tomatoku_runs_v1
  where (
      status in ('expired', 'rejected')
      and prepared_at < clock_timestamp() - interval '7 days'
    )
    or (
      status = 'completed'
      and requires_review is false
      and completed_at < clock_timestamp() - interval '90 days'
    );

  if (
    select count(*)
    from private.tomatoku_runs_v1 r
    where r.normalized_name = v_normalized_name
      and r.prepared_at > clock_timestamp() - interval '1 hour'
  ) >= 30 then
    raise exception 'too many competition starts';
  end if;
  if (
    select count(*)
    from private.tomatoku_runs_v1 r
    where r.request_key = p_request_key
      and r.prepared_at > clock_timestamp() - interval '1 hour'
  ) >= 60 then
    raise exception 'too many starts from this connection';
  end if;
  if (
    select count(*)
    from private.tomatoku_runs_v1 r
    where r.prepared_at > clock_timestamp() - interval '1 hour'
  ) >= 5000 then
    raise exception 'competition start capacity reached';
  end if;
  if (
    select count(*)
    from private.tomatoku_runs_v1 r
    where r.status in ('prepared', 'active')
      and r.expires_at > clock_timestamp()
  ) >= 500 then
    raise exception 'too many concurrent competition runs';
  end if;

  select *
  into v_set
  from private.tomatoku_draw_sets_v1
  order by random()
  limit 1;

  if v_set.stage_ids is null then
    raise exception 'competition draw is unavailable';
  end if;

  insert into private.tomatoku_runs_v1 (
    run_token,
    generation,
    client_version,
    display_name,
    normalized_name,
    request_key,
    deck_id,
    slot_id,
    stage_ids,
    expires_at
  )
  values (
    v_run_token,
    v_config.generation,
    v_config.client_version,
    v_display_name,
    v_normalized_name,
    p_request_key,
    v_set.deck_id,
    v_set.slot_id,
    v_set.stage_ids,
    clock_timestamp() + interval '10 minutes'
  );

  return query
  select true, v_run_token;
end;
$$;

create or replace function public.tomatoku_begin_run_internal(
  p_run_token uuid,
  p_client_version text
)
returns table (accepted boolean, stage_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.tomatoku_runs_v1%rowtype;
  v_config private.tomatoku_competition_config%rowtype;
begin
  select *
  into v_config
  from private.tomatoku_competition_config
  where singleton = true;

  select *
  into v_run
  from private.tomatoku_runs_v1
  where run_token = p_run_token
  for update;

  if v_config.accepting_runs is not true
    or not exists (
      select 1 from public.games g
      where g.game_slug = 'tomatoku_competition_v1'
        and g.is_active = true
        and g.submission_mode = 'verified'
    )
    or p_client_version is distinct from v_config.client_version
    or v_run.status is distinct from 'prepared'
    or v_run.expires_at <= clock_timestamp()
  then
    raise exception 'run cannot begin';
  end if;

  update private.tomatoku_runs_v1
  set
    status = 'active',
    started_at = clock_timestamp(),
    expires_at = clock_timestamp() + interval '30 minutes'
  where run_token = p_run_token;

  return query select true, v_run.stage_ids;
end;
$$;

create or replace function public.tomatoku_get_run_internal(
  p_run_token uuid,
  p_client_version text,
  p_transcript_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.tomatoku_runs_v1%rowtype;
  v_stages jsonb;
begin
  select *
  into v_run
  from private.tomatoku_runs_v1
  where run_token = p_run_token;

  if v_run.client_version is distinct from p_client_version
    or v_run.expires_at <= clock_timestamp()
  then
    raise exception 'run is not active';
  end if;
  if v_run.status = 'completed' then
    if v_run.transcript_hash is distinct from p_transcript_hash
      or v_run.result_payload is null
    then
      raise exception 'completed run does not match this result';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'completed', true,
      'result', v_run.result_payload
    );
  end if;
  if v_run.status is distinct from 'active' then
    raise exception 'run is not active';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', s.stage_id,
      'difficulty', s.difficulty,
      'regions', to_jsonb(s.regions),
      'solution', to_jsonb(s.solution)
    )
    order by selected.ordinality
  )
  into v_stages
  from unnest(v_run.stage_ids) with ordinality as selected(stage_id, ordinality)
  join private.tomatoku_stage_catalog_v1 s
    on s.stage_id = selected.stage_id;

  if jsonb_array_length(coalesce(v_stages, '[]'::jsonb)) <> 3 then
    raise exception 'run stages are unavailable';
  end if;

  return jsonb_build_object(
    'accepted', true,
    'completed', false,
    'generation', v_run.generation,
    'stages', v_stages
  );
end;
$$;

create or replace function public.tomatoku_finalize_run_internal(
  p_run_token uuid,
  p_client_version text,
  p_elapsed_ms integer,
  p_action_count integer,
  p_mistake_count integer,
  p_hint_count integer,
  p_score integer,
  p_transcript_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.tomatoku_runs_v1%rowtype;
  v_config private.tomatoku_competition_config%rowtype;
  v_server_elapsed_ms bigint;
  v_time_gap_ms bigint;
  v_expected_score integer;
  v_existing_first integer;
  v_existing_best integer;
  v_existing_play_count integer;
  v_existing_ranking_status text;
  v_ranked_player_count integer;
  v_top_ten_cutoff integer;
  v_first_ranked_player_count integer;
  v_first_top_ten_cutoff integer;
  v_play_ranked_player_count integer;
  v_play_top_ten_cutoff integer;
  v_now timestamptz := clock_timestamp();
  v_old_first integer;
  v_old_best integer;
  v_old_play_count integer;
  v_first integer;
  v_best integer;
  v_play_count integer;
  v_is_first boolean := false;
  v_is_new_best boolean := false;
  v_review boolean := false;
  v_result jsonb;
  v_score_run_id bigint;
begin
  select *
  into v_config
  from private.tomatoku_competition_config
  where singleton = true;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tomatoku-ranking-v1', 0)
  );

  select *
  into v_run
  from private.tomatoku_runs_v1
  where run_token = p_run_token
  for update;

  if v_run.status = 'completed' then
    if v_run.transcript_hash is not distinct from p_transcript_hash
      and v_run.result_payload is not null
    then
      return v_run.result_payload;
    end if;
    raise exception 'completed run does not match this result';
  end if;

  if v_config.accepting_runs is not true
    or not exists (
      select 1 from public.games g
      where g.game_slug = 'tomatoku_competition_v1'
        and g.is_active = true
        and g.submission_mode = 'verified'
    )
    or p_client_version is distinct from v_config.client_version
    or v_run.client_version is distinct from v_config.client_version
    or v_run.generation is distinct from v_config.generation
    or v_run.status is distinct from 'active'
    or v_run.started_at is null
    or v_run.expires_at <= v_now
  then
    raise exception 'run cannot be finalized';
  end if;

  if p_elapsed_ms is null
    or p_elapsed_ms < 5000
    or p_elapsed_ms > 1800000
    or p_action_count is null
    or p_action_count < 1
    or p_action_count > 300
    or p_mistake_count is null
    or p_mistake_count < 0
    or p_hint_count is null
    or p_hint_count < 0
    or p_transcript_hash is null
    or p_transcript_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'verified result values are invalid';
  end if;

  v_expected_score :=
    floor(p_elapsed_ms::numeric / 10)::integer
    + p_mistake_count * 300
    + p_hint_count * 3000;
  if p_score is distinct from v_expected_score then
    raise exception 'verified score does not match the transcript result';
  end if;

  v_server_elapsed_ms :=
    floor(extract(epoch from (v_now - v_run.started_at)) * 1000);
  v_time_gap_ms := v_server_elapsed_ms - p_elapsed_ms;
  if v_time_gap_ms < 0 or v_time_gap_ms > 15000 then
    raise exception 'client and server elapsed time do not agree';
  end if;
  select
    gs.first_score,
    gs.best_score,
    gs.play_count,
    coalesce(gs.ranking_status, 'normal')
  into
    v_existing_first,
    v_existing_best,
    v_existing_play_count,
    v_existing_ranking_status
  from public.game_scores gs
  where gs.normalized_name = v_run.normalized_name
    and gs.game_slug = v_run.game_slug;

  select count(*)::integer, max(ranked.best_score)
  into v_ranked_player_count, v_top_ten_cutoff
  from (
    select gs.best_score
    from public.game_scores gs
    where gs.game_slug = v_run.game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal'
    order by gs.best_score, gs.best_score_at, gs.normalized_name
    limit 10
  ) ranked;

  select count(*)::integer, max(ranked.first_score)
  into v_first_ranked_player_count, v_first_top_ten_cutoff
  from (
    select gs.first_score
    from public.game_scores gs
    where gs.game_slug = v_run.game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal'
    order by gs.first_score, gs.first_score_at, gs.normalized_name
    limit 10
  ) ranked;

  select count(*)::integer, min(ranked.play_count)
  into v_play_ranked_player_count, v_play_top_ten_cutoff
  from (
    select gs.play_count
    from public.game_scores gs
    where gs.game_slug = v_run.game_slug
      and coalesce(gs.ranking_status, 'normal') = 'normal'
    order by gs.play_count desc, gs.updated_at, gs.normalized_name
    limit 10
  ) ranked;

  v_review :=
    p_elapsed_ms < 60000
    or v_time_gap_ms > 1000
    or coalesce(v_existing_ranking_status, 'normal') <> 'normal'
    or (
      p_score < coalesce(v_existing_best, 2147483647)
      and (
        v_ranked_player_count < 10
        or p_score <= v_top_ten_cutoff
      )
    )
    or (
      v_existing_first is null
      and (
        v_first_ranked_player_count < 10
        or p_score <= v_first_top_ten_cutoff
      )
    )
    or (
      v_play_ranked_player_count < 10
      or coalesce(v_existing_play_count, 0) + 1 >= v_play_top_ten_cutoff
    );

  update private.tomatoku_runs_v1
  set
    client_elapsed_ms = p_elapsed_ms,
    action_count = p_action_count,
    mistake_count = p_mistake_count,
    hint_count = p_hint_count,
    score = p_score,
    transcript_hash = p_transcript_hash,
    requires_review = v_review
  where run_token = p_run_token;

  perform set_config(
    'app.tomatoku_verified_run',
    p_run_token::text,
    true
  );

  insert into public.players (
    normalized_name,
    display_name,
    created_at,
    last_played_at
  )
  values (
    v_run.normalized_name,
    v_run.display_name,
    v_now,
    v_now
  )
  on conflict (normalized_name) do update
  set
    display_name = case
      when v_review then public.players.display_name
      else excluded.display_name
    end,
    last_played_at = excluded.last_played_at;

  insert into public.score_runs (
    normalized_name,
    game_slug,
    score,
    client_version,
    created_at,
    metadata
  )
  values (
    v_run.normalized_name,
    v_run.game_slug,
    p_score,
    v_config.client_version,
    v_now,
    jsonb_build_object(
      'verification', 'edge-transcript-v1',
      'generation', v_config.generation,
      'deckId', v_run.deck_id,
      'slotId', v_run.slot_id,
      'actionCount', p_action_count,
      'mistakeCount', p_mistake_count,
      'hintCount', p_hint_count,
      'displayName', v_run.display_name,
      'transcriptHash', p_transcript_hash,
      'requiresReview', v_review,
      'reviewStatus', case when v_review then 'pending' else 'approved' end,
      'serverClientGapMs', v_time_gap_ms
    )
  )
  returning id into v_score_run_id;

  if not v_review then
    select first_score, best_score, play_count
    into v_old_first, v_old_best, v_old_play_count
    from public.game_scores
    where normalized_name = v_run.normalized_name
      and game_slug = v_run.game_slug
      and coalesce(ranking_status, 'normal') = 'normal'
    for update;

    if not found then
      v_is_first := true;
      v_is_new_best := true;
      v_first := p_score;
      v_best := p_score;
      v_play_count := 1;

      insert into public.game_scores (
        normalized_name,
        game_slug,
        display_name,
        first_score,
        best_score,
        play_count,
        first_score_at,
        best_score_at,
        updated_at,
        ranking_status
      )
      values (
        v_run.normalized_name,
        v_run.game_slug,
        v_run.display_name,
        p_score,
        p_score,
        1,
        v_now,
        v_now,
        v_now,
        'normal'
      );
    else
      v_first := v_old_first;
      v_best := least(v_old_best, p_score);
      v_play_count := v_old_play_count + 1;
      v_is_new_best := p_score < v_old_best;

      update public.game_scores
      set
        display_name = v_run.display_name,
        best_score = v_best,
        play_count = v_play_count,
        best_score_at = case when v_is_new_best then v_now else best_score_at end,
        updated_at = v_now,
        ranking_status = 'normal',
        ranking_note = null,
        ranking_status_updated_at = null
      where normalized_name = v_run.normalized_name
        and game_slug = v_run.game_slug;
    end if;
  end if;

  v_result := jsonb_build_object(
    'accepted', true,
    'score', p_score,
    'under_review', v_review,
    'result_first_score', v_first,
    'result_best_score', v_best,
    'result_play_count', v_play_count,
    'is_first_play', v_is_first,
    'is_new_best', v_is_new_best
  );
  update private.tomatoku_runs_v1
  set
    status = 'completed',
    completed_at = v_now,
    score_run_id = v_score_run_id,
    result_payload = v_result
  where run_token = p_run_token;

  return v_result;
end;
$$;

create or replace function public.tomatoku_review_run_internal(
  p_run_token uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.tomatoku_runs_v1%rowtype;
  v_first integer;
  v_best integer;
  v_play_count integer;
  v_first_at timestamptz;
  v_best_at timestamptz;
  v_approved_display_name text;
  v_result jsonb;
  v_updated_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tomatoku-ranking-v1', 0)
  );

  if p_decision not in ('approved', 'disqualified') then
    raise exception 'review decision is invalid';
  end if;

  select *
  into v_run
  from private.tomatoku_runs_v1
  where run_token = p_run_token
  for update;
  if v_run.status is distinct from 'completed'
    or v_run.score is null
    or v_run.transcript_hash is null
  then
    raise exception 'completed run was not found';
  end if;
  if p_decision = 'approved' and v_run.requires_review is not true then
    raise exception 'run is not awaiting approval';
  end if;

  perform set_config('app.tomatoku_verified_admin', 'review', true);
  update public.score_runs
  set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{reviewStatus}',
    to_jsonb(p_decision),
    true
  )
  where id = v_run.score_run_id
    and game_slug = v_run.game_slug
    and normalized_name = v_run.normalized_name
    and score = v_run.score
    and client_version = v_run.client_version
    and metadata->>'transcriptHash' = v_run.transcript_hash;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'score run for review was not found';
  end if;

  select count(*), min(score)
  into v_play_count, v_best
  from public.score_runs
  where game_slug = v_run.game_slug
    and normalized_name = v_run.normalized_name
    and metadata->>'reviewStatus' = 'approved';

  if v_play_count = 0 then
    delete from public.game_scores
    where game_slug = v_run.game_slug
      and normalized_name = v_run.normalized_name;
    v_first := null;
    v_first_at := null;
    v_best_at := null;
  else
    select score, created_at
    into v_first, v_first_at
    from public.score_runs
    where game_slug = v_run.game_slug
      and normalized_name = v_run.normalized_name
      and metadata->>'reviewStatus' = 'approved'
    order by created_at, id
    limit 1;

    select created_at
    into v_best_at
    from public.score_runs
    where game_slug = v_run.game_slug
      and normalized_name = v_run.normalized_name
      and metadata->>'reviewStatus' = 'approved'
      and score = v_best
    order by created_at, id
    limit 1;

    select nullif(sr.metadata->>'displayName', '')
    into v_approved_display_name
    from public.score_runs sr
    where sr.game_slug = v_run.game_slug
      and sr.normalized_name = v_run.normalized_name
      and sr.metadata->>'reviewStatus' = 'approved'
    order by sr.created_at desc, sr.id desc
    limit 1;

    if v_approved_display_name is null then
      select gs.display_name
      into v_approved_display_name
      from public.game_scores gs
      where gs.game_slug = v_run.game_slug
        and gs.normalized_name = v_run.normalized_name;
    end if;
    v_approved_display_name := coalesce(
      v_approved_display_name,
      v_run.normalized_name
    );

    insert into public.game_scores (
      normalized_name,
      game_slug,
      display_name,
      first_score,
      best_score,
      play_count,
      first_score_at,
      best_score_at,
      updated_at,
      ranking_status,
      ranking_note,
      ranking_status_updated_at
    ) values (
      v_run.normalized_name,
      v_run.game_slug,
      v_approved_display_name,
      v_first,
      v_best,
      v_play_count,
      v_first_at,
      v_best_at,
      clock_timestamp(),
      'normal',
      null,
      null
    )
    on conflict (normalized_name, game_slug) do update
    set
      display_name = excluded.display_name,
      first_score = excluded.first_score,
      best_score = excluded.best_score,
      play_count = excluded.play_count,
      first_score_at = excluded.first_score_at,
      best_score_at = excluded.best_score_at,
      updated_at = excluded.updated_at,
      ranking_status = 'normal',
      ranking_note = null,
      ranking_status_updated_at = null;

    update public.players
    set display_name = v_approved_display_name
    where normalized_name = v_run.normalized_name;
  end if;

  v_result := jsonb_build_object(
    'accepted', p_decision = 'approved',
    'score', v_run.score,
    'under_review', false,
    'review_decision', p_decision,
    'result_first_score', v_first,
    'result_best_score', v_best,
    'result_play_count', v_play_count,
    'is_first_play', false,
    'is_new_best', false
  );
  update private.tomatoku_runs_v1
  set
    requires_review = false,
    rejection_reason = case
      when p_decision = 'disqualified' then 'manual_review'
      else null
    end,
    result_payload = v_result
  where run_token = p_run_token;

  return v_result;
end;
$$;

revoke all on function public.tomatoku_prepare_run_internal(text, text, text)
  from public, anon, authenticated;
revoke all on function public.tomatoku_begin_run_internal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.tomatoku_get_run_internal(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.tomatoku_finalize_run_internal(
  uuid, text, integer, integer, integer, integer, integer, text
) from public, anon, authenticated;
revoke all on function public.tomatoku_review_run_internal(uuid, text)
  from public, anon, authenticated;

grant execute on function public.tomatoku_prepare_run_internal(text, text, text)
  to service_role;
grant execute on function public.tomatoku_begin_run_internal(uuid, text)
  to service_role;
grant execute on function public.tomatoku_get_run_internal(uuid, text, text)
  to service_role;
grant execute on function public.tomatoku_finalize_run_internal(
  uuid, text, integer, integer, integer, integer, integer, text
) to service_role;
grant execute on function public.tomatoku_review_run_internal(uuid, text)
  to service_role;

revoke all on function private.guard_verified_score_write()
  from public, anon, authenticated;

alter default privileges in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;
