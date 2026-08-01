-- Keep the competition usable on slow mobile networks while all suspicious gaps remain review-only.
create index if not exists tomatoku_runs_v1_draw_idx
  on private.tomatoku_runs_v1 (deck_id, slot_id);

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

