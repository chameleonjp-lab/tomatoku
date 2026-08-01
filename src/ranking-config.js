/**
 * ブラウザ公開可能なランキング設定。
 * Publishable key は公開クライアント用。secret / service_role key は置かない。
 */
export const RANKING_CONFIG = Object.freeze({
  supabaseUrl: "https://mlpnjgezrnhdxsxolyzj.supabase.co",
  supabasePublishableKey: "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM",
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-web-2.4.0-ranking-restored-v1",
  timeoutMs: 8000,
  submitRpc: "submit_score",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  // 公式3問だけを共通ランキングへ送信する。練習モードは常に対象外。
  rankingsEnabled: true,
  submissionsEnabled: true,
});
