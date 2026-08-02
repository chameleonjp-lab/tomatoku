/**
 * ブラウザ公開可能なランキング設定。
 * Publishable key は公開クライアント用。secret / service_role key は置かない。
 */
export const RANKING_CONFIG = Object.freeze({
  supabaseUrl: "https://mlpnjgezrnhdxsxolyzj.supabase.co",
  supabasePublishableKey: "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM",
  gameSlug: "tomatoku_competition_v1",
  clientVersion: "tomatooku-web-3.0.0-verified-competition-v1",
  timeoutMs: 8000,
  competitionFunction: "tomatoku-competition",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  // 公式モードだけを共通ランキングへ送信する。練習モードは常に対象外。
  rankingsEnabled: true,
  submissionsEnabled: true,
});
