/**
 * ブラウザ公開可能なランキング設定。
 * Publishable key は公開クライアント用。secret / service_role key は置かない。
 */
export const RANKING_CONFIG = Object.freeze({
  supabaseUrl: "https://mlpnjgezrnhdxsxolyzj.supabase.co",
  supabasePublishableKey: "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM",
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-web-2.3.0-test-ranking-off",
  timeoutMs: 8000,
  submitRpc: "submit_score",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  // テスト段階へ戻したため、public.gamesを含むtomatoku関連情報は削除済み。
  // 再登録と実疎通が完了するまで、取得と送信の両方を有効にしない。
  rankingsEnabled: false,
  submissionsEnabled: false,
});
