# トマトオク Supabase連携

この文書は、カメレオンJPの実験場で使用している**共有Supabase基盤への接続契約**を記録する。

> 旧版に記載していた独自`games` / `scores`テーブルやゲーム専用RPCの作成SQLは使用しない。共有Supabaseの`submit_score`を`create or replace`で置き換えてはいけない。

## 1. 現在の状態

確認日: 2026-07-18

- Supabaseプロジェクト: `chameleonJP-Lab`
- プロジェクト参照ID: `mlpnjgezrnhdxsxolyzj`
- `game_slug`: `tomatoku`
- `tomatoku`の`public.games`登録: **未登録**
- 実スコア送信: **未実施**
- 共有RPC定義の読み取り確認: **完了**
- クライアント単体テスト: **完了**

本番ランキングを汚さないため、公式3問と補正タイムが実装されるまでスコアを書き込まない。

## 2. クライアント設定

ブラウザ公開可能な値は`src/ranking-config.js`へ集約する。

```js
export const RANKING_CONFIG = {
  supabaseUrl: "公開Supabase URL",
  supabasePublishableKey: "ブラウザ公開用Publishable key",
  gameSlug: "tomatoku",
  clientVersion: "tomatooku-web-2.0.0-ranking-v1",
  timeoutMs: 8000,
  submitRpc: "submit_score",
  bestRankingRpc: "get_best_score_ranking",
  firstRankingRpc: "get_first_try_ranking",
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
  "p_client_version": "tomatooku-web-2.0.0-ranking-v1"
}
```

送信条件:

- `mode === "official"`
- 空でないplay ID
- 正規化後の表示名が空でない
- `p_score`がPostgreSQL integer範囲内の有限な非負整数
- 同一play IDは1回だけ

現行v1はランダム3問であり、条件が揃わないため送信しない。

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

2026-07-18時点で`tomatoku`は未登録。

登録は、公式問題と補正タイムが実装され、次の値がコードと一致した後に行う。

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
```

公開前にrelease date、display order、description、share textも確定する。

## 6. 検証方針

この段階ではモックによる単体テストだけを行う。

確認済み:

- 共通RPC名と引数
- 返却列のマッピング
- `apikey`のみを使用
- 送信本文4項目
- 公式モード以外は送信しない
- play ID単位の二重送信防止
- 初回・ベスト取得
- 0件、HTTPエラー、形式不正、未設定、タイムアウト

未確認:

- 実ブラウザからのRPC疎通
- 本番DBへのスコア保存
- 初回・ベスト更新の実データ確認
- `tomatoku`の`public.games`登録
- 実験場トップ・詳細ランキングへの反映
- iPhone実機通信

実通信確認は、公式3問と補正タイムを実装し、テスト用表示名と削除手順を決めてから行う。
