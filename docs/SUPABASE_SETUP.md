# トマトオク Supabase連携

- 文書種別: 現行接続・停止手順
- 最終更新日: 2026-08-02
- Supabaseプロジェクト: `chameleonJP-Lab`
- プロジェクト参照ID: `mlpnjgezrnhdxsxolyzj`

## 現在の状態

旧ランキング`tomatoku`は`is_active=false`で一時停止している。固定出題版の実プレイ1件は履歴として保持し、削除しない。

修正版は別世代`tomatoku_competition_v1`を使う。DB移行直後は次の二重ゲートを閉じ、明示的な公開承認まで受け付けない。

実験場での表示順は旧版を継承し`display_order: 34`とする。

```text
public.games.is_active = false
private.tomatoku_competition_config.accepting_runs = false
```

設定:

```js
export const RANKING_CONFIG = {
  supabaseUrl: "公開Supabase URL",
  supabasePublishableKey: "ブラウザ公開用Publishable key",
  gameSlug: "tomatoku_competition_v1",
  clientVersion: "tomatooku-web-3.0.0-verified-competition-v1",
  competitionFunction: "tomatoku-competition",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  rankingsEnabled: true,
  submissionsEnabled: true,
};
```

## 公式プレイの送信契約

ブラウザから共通`submit_score`へスコアを直接送らない。公式プレイはEdge Functionを経由する。

```text
POST /functions/v1/tomatoku-competition
action = prepare | begin | finish
```

1. `prepare`: 表示名を正規化し、サーバーが一度限りのrun tokenと公平抽選済み3問を内部で確保する。ブラウザへ問題IDはまだ返さない。
2. `begin`: 盤面を操作可能にする直前にサーバー開始時刻を固定し、この時点で3問のIDを返す。
3. `finish`: run token、操作記録、クライアント計測時間を送る。自己申告のスコアは送らない。
4. Edge Functionがサーバー保管の問題を使い、操作記録から再計算して誤タップ数、ヒント数、補正タイムを確定する。
5. 一度完了したtoken、世代不一致、問題不一致、時間矛盾、未クリアの操作記録は拒否する。

サーバー観測時間との差が負または15秒超なら拒否する。低速回線による往復遅延は最大15秒まで受け付けるが、差が1秒を超える記録、60秒未満の記録、またはベスト・初回・回数のいずれかで公開上位10位へ入る可能性がある記録は自動で通常ランキングへ載せず確認待ちにする。確認待ちはservice role専用の`tomatoku_review_run_internal`で承認または失格とし、承認済みrunだけから初回・ベスト・回数を再集計する。

ブラウザはPublishable keyを`apikey`ヘッダーだけに設定する。secret/service role keyと`Authorization: Bearer {Publishable key}`はブラウザへ置かない。Edge Functionはサーバー側secretを使い、一般利用者が実行できない内部RPCだけを呼ぶ。

## DB保護

- `public.games.submission_mode='verified'`のゲームは、検証済みrunを示すトランザクション内フラグがない限り`score_runs`と`game_scores`への書き込みをtriggerで拒否する。
- そのため、既存`submit_score`、`submit_score_with_metadata`、テーブル直接書き込みから新世代のランキングへ登録できない。
- 内部run関数と`private`スキーマは`PUBLIC`、`anon`、`authenticated`から剥奪し、`service_role`だけに許可する。
- 公式runは一度だけ完了でき、期限切れrunはランキングへ反映しない。
- 同じtokenと同じ操作記録の完了再送は保存済み結果を返し、二重登録しない。
- 接続元はサーバー内のsecretをsaltにした不可逆hashだけを短期rate limitへ使い、生の接続元を保存しない。表示名、接続元hash、全体、同時runの各上限を設ける。

練習はEdge FunctionもランキングRPCも呼ばない。

## ランキング取得

取得は既存の読み取りRPCを新しいslugで使う。

```text
get_best_score_ranking('tomatoku_competition_v1', limit)
get_first_try_ranking('tomatoku_competition_v1', limit)
```

旧`tomatoku`の記録と新世代はslugで分離される。

## 公平抽選

- 問題バンク: `candidate-v2-variable-4-6-final`
- 抽選表: `balanced-official-draw-v1`
- 8 deck × 28組 = 224組
- 各deckで各難易度の全28問を1回ずつ使用
- 全体で各問題の出現回数は8回、周辺確率は厳密に`1/28`
- 各難易度の全問題は同じ確率で出現する
- 組の難しさ指標は1258〜1355、最大/最小は約1.0772で上限1.08以内

問題総数と内部抽選表は利用者画面に表示しない。

## 適用と再開

DB変更は`supabase/migrations/20260802000000_tomatoku_verified_competition.sql`、Edge Functionは`supabase/functions/tomatoku-competition/`を正本とする。

適用後も停止を維持し、次がすべて合格してから別の明示承認で再開する。

- 旧2経路から新slugへの登録が拒否される
- Edge Functionのprepare/begin/finish実疎通
- 一度限りtokenと操作再生の拒否試験
- 確認待ちの承認・失格・再集計と権限外拒否
- 正常runの初回・ベスト反映
- 練習の送信0件
- ChromiumとWebKitの全画面検査
- テストデータ削除後に新世代0件
- 独立レビュー

再開は`accepting_runs=true`と新slugの`is_active=true`を同じ承認作業で行う。旧slugは非表示のまま保持する。

## 禁止事項

- key実値を文書、PR本文、ログへ複製する
- 共有`submit_score`をゲーム専用定義へ置き換える
- ブラウザへsecret/service role keyを置く
- 未検証の自己申告スコアを新世代へ登録する
- 旧実プレイを無断削除する
- Draft PRのマージ前に再開する
