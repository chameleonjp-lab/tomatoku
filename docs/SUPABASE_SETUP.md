# トマトオク Supabase連携

この文書は、カメレオンJPの実験場で使用している**共有Supabase基盤への接続契約**を記録する。

> 旧版に記載していた独自`games` / `scores`テーブルやゲーム専用RPCの作成SQLは使用しない。共有Supabaseの`submit_score`を`create or replace`で置き換えてはいけない。

## 1. 現在の状態

最終確認日: 2026-08-01

- Supabaseプロジェクト: `chameleonJP-Lab`
- プロジェクト参照ID: `mlpnjgezrnhdxsxolyzj`
- `game_slug`: `tomatoku`
- `tomatoku`の`public.games`登録: **登録済み・is_active=true**
- 実スコア送信: **Publishable keyで確認済み**
- 共有RPC定義の読み取り確認: **完了**
- クライアント単体テスト: **完了**

確認用に2件送信し、初回、ベスト、プレイ回数、参加人数を確認した。確認用データは削除し、`tomatoku`の記録0件へ戻している。

## 2. クライアント設定

ブラウザ公開可能な値は`src/ranking-config.js`へ集約する。

```js
export const RANKING_CONFIG = {
  supabaseUrl: "公開Supabase URL",
  supabasePublishableKey: "ブラウザ公開用Publishable key",
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-web-2.4.0-ranking-restored-v1",
  timeoutMs: 8000,
  submitRpc: "submit_score",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
  rankingsEnabled: true,
  submissionsEnabled: true,
};
```

禁止事項:

- secret key
- service role key
- `Authorization: Bearer {Publishable key}`
- テーブルへの直接INSERT
- ゲーム専用RPCの新設
- 共有RPCの置き換え
- キー実値をREADME、仕様書、PR本文、完了報告へ複製すること

Publishable keyは`apikey`ヘッダーだけに設定する。

## 3. スコア送信RPC

実DBで確認した定義:

```text
submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default ''
)
```

返却列:

```text
accepted boolean
result_normalized_name text
result_display_name text
result_first_score integer
result_best_score integer
result_play_count integer
is_first_play boolean
is_new_best boolean
```

REST呼び出し:

```text
POST {SUPABASE_URL}/rest/v1/rpc/submit_score
Content-Type: application/json
apikey: {SUPABASE_PUBLISHABLE_KEY}
```

本文:

```json
{
  "p_display_name": "表示名",
  "p_game_slug": "tomatoku",
  "p_score": 4835,
  "p_client_version": "tomatooku-web-2.4.0-ranking-restored-v1"
}
```

送信条件:

- `mode === "official"`
- 空でないplay ID
- 正規化後の表示名が空でない
- `p_score`がPostgreSQL integer範囲内の有限な非負整数
- 同一play IDは1回だけ

公式3問だけを送信する。ランダム練習は設定に関係なく送信しない。

## 4. ランキング取得RPC

### 最高記録

```text
get_best_score_ranking(
  p_game_slug text,
  p_limit integer default 100
)
```

### 初回記録

```text
get_first_try_ranking(
  p_game_slug text,
  p_limit integer default 100
)
```

両関数の返却列:

```text
rank_no bigint
display_name text
first_score integer
best_score integer
play_count integer
updated_at timestamptz
```

本文:

```json
{
  "p_game_slug": "tomatoku",
  "p_limit": 10
}
```

クライアントは次を区別する。

```text
ok              1件以上
empty           正常応答・0件
error           HTTP、タイムアウト、JSON・形式不正
not_configured  URLまたはPublishable key不足
```

通信タイムアウトは`AbortController`で実際のfetchを中止する。

## 5. `public.games`登録

2026年8月1日に`tomatoku`を次の値で再登録した。

```text
game_slug: tomatoku
title: トマトオク
game_url: https://chameleonjp-lab.github.io/tomatooku/
top_ranking_type: best
score_order: asc
score_unit: 秒
score_scale: 100
score_decimals: 2
score_label: 補正タイム
first_score_label: 初回タイム
best_score_label: ベストタイム
release_date: 2026-07-19
display_order: 34
is_active: true
```

descriptionとshare textもGitHub Pagesの公開先に合わせて登録済みである。

## 6. 検証方針

確認済み:

- 共通RPC名と引数
- 返却列のマッピング
- `apikey`のみを使用
- 送信本文4項目
- 公式モード以外は送信しない
- play ID単位の二重送信防止
- 初回・ベスト取得
- 0件、HTTPエラー、形式不正、未設定、タイムアウト
- Publishable keyによるゲーム設定取得
- 4834、4500の順に2回送信
- 初回4834、ベスト4500、プレイ回数2
- 初回・ベストランキング取得
- 合計プレイ2、参加人数1
- 確認用データ削除後の記録0件

未確認:

- 実験場トップ・詳細ランキングへの反映
- iPhone実機通信

GitHub Pages反映後にiPhone Safariで公式3問を完了し、実験場トップ、詳細ランキング、送信結果を確認する。
