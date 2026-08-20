-- Internal-only verified competition tables.
-- RLS is enabled as defense in depth.
-- No anon/authenticated policies are intentional: the browser reaches these
-- tables only through the authenticated Edge Function and internal RPCs.

revoke all on schema private from public, anon, authenticated;

revoke all on table
  private.tomatoku_competition_config,
  private.tomatoku_stage_catalog_v1,
  private.tomatoku_draw_sets_v1,
  private.tomatoku_runs_v1
from public, anon, authenticated;

grant all on table
  private.tomatoku_competition_config,
  private.tomatoku_stage_catalog_v1,
  private.tomatoku_draw_sets_v1,
  private.tomatoku_runs_v1
to service_role;

alter table private.tomatoku_competition_config
  enable row level security;

alter table private.tomatoku_stage_catalog_v1
  enable row level security;

alter table private.tomatoku_draw_sets_v1
  enable row level security;

alter table private.tomatoku_runs_v1
  enable row level security;
