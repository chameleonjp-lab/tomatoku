# トマトオク v2 ランキング契約確認

確認日: 2026-07-18

- 文書種別: 2026年7月18日時点の履歴
- 現在状態: 2026年8月1日に公開登録と実疎通を完了し、公式ランキングを再開

この文書は、v2実装計画「第2回：共通ランキング連携」の確認結果を記録する。

## 1. 判定

**2026年7月18日時点では、共通RPCクライアントの実装とモック検証は完了し、実スコア送信と公開登録は未実施だった。**

現行v1はプレイヤーごとに異なるランダム3問を出すため、公平な公式ランキングへ送信しない。公式3問と補正タイムが実装されるまで送信ゲートを閉じる。

## 2. 共有Supabase確認

### プロジェクト

```text
name: chameleonJP-Lab
project ref: mlpnjgezrnhdxsxolyzj
status: ACTIVE_HEALTHY
```

### 確認済み関数

```text
submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default ''
)
```

返却:

```text
accepted
result_normalized_name
result_display_name
result_first_score
result_best_score
result_play_count
is_first_play
is_new_best
```

```text
get_best_score_ranking(p_game_slug text, p_limit integer default 100)
get_first_try_ranking(p_game_slug text, p_limit integer default 100)
```

返却:

```text
rank_no
display_name
first_score
best_score
play_count
updated_at
```

### ゲーム登録（2026年7月18日時点）

```text
tomatoku in public.games: 未登録
```

Supabaseの関数、テーブル、権限は変更していない。

## 3. コード確認

### 設定

- [済] 公開設定を`src/ranking-config.js`へ集約
- [済] `gameSlug`は`tomatoku`
- [済] `CLIENT_VERSION`を定数化
- [済] URLとPublishable keyを設定
- [済] secret / service role keyなし
- [済] Publishable key実値を文書へ複製していない

### 通信

- [済] URL末尾は`/rest/v1/rpc/<function>`
- [済] `Content-Type: application/json`
- [済] `apikey`ヘッダー
- [済] `Authorization: Bearer`なし
- [済] `AbortController`でタイムアウト時に中止
- [済] HTTP失敗を画面向け状態へ変換
- [済] JSON・返却形式不正をエラー扱い

### 送信

- [済] 本文は`p_display_name`、`p_game_slug`、`p_score`、`p_client_version`
- [済] 表示名をNFKC正規化
- [済] 制御文字・方向制御文字を除去
- [済] 前後・連続空白を正規化
- [済] 20文字へ制限
- [済] スコアを有限なPostgreSQL integerへ制限
- [済] `mode === "official"`だけ送信可能
- [済] play ID必須
- [済] 同一play IDは同一Promiseを返す
- [済] 現行v1と練習モードはfetchを呼ばない

### 取得

- [済] 最高記録RPC
- [済] 初回記録RPC
- [済] `rank_no`、`display_name`、`first_score`、`best_score`を内部形式へ変換
- [済] `ok`、`empty`、`error`、`not_configured`を区別
- [済] 現行v1 UI向け`fetchRanking()`互換APIを維持

## 4. 単体テスト

実行結果:

```text
==== RANKING TEST RESULT: PASS=10 FAIL=0 ====
```

確認項目:

1. 設定済み・未設定判定
2. 表示名正規化
3. 現行v1・練習の送信停止
4. 共通送信bodyとヘッダー
5. 同一play IDの二重送信防止
6. 別play IDの送信許可
7. ベストランキングの引数・返却変換
8. 初回ランキングRPC
9. 0件、HTTPエラー、形式不正、未設定
10. AbortControllerタイムアウト

## 5. 2026年7月18日時点の未確認

- [未確認] 実ブラウザから共有RPCへ接続できる
- [未確認] `submit_score`が`accepted=true`を返す
- [未確認] 初回記録・ベスト記録・play countが本番DBで更新される
- [未確認] client versionが保存される
- [未確認] `tomatoku`が`public.games`へ登録される
- [未確認] 実験場トップへ表示される
- [未確認] 詳細ランキングへ表示される
- [未確認] iPhone 17 ProのSafariで通信できる
- [未確認] iPhone 11 Pro、iPad Pro 2018で通信できる

## 6. 2026年7月18日時点の次工程条件

次は実装計画の「第3回：タイマーと非同期競合の修正」。

ただし、本番ランキング送信を有効にするには、さらに次が必要。

1. 公式3問のステージID確定
2. 公式・練習モード分離
3. 補正タイム計算
4. play IDをゲームセッションへ導入
5. `public.games`へ`tomatoku`を`score_order=asc`、`score_scale=100`で登録
6. テスト記録の作成・確認・削除手順
7. 実機確認

## 7. ロールバック

この段階の変更はゲームロジックへ影響しない。

問題がある場合:

- `src/ranking.js`をPR前へ戻す
- `src/ranking-config.js`と`scripts/ranking.test.js`を削除
- `package.json`のtestスクリプトを戻す
- Supabase側には変更がないためDBロールバックは不要

## 8. 2026年8月1日の再確認

- `public.games`へ`tomatoku`を表示順34、`is_active=true`で再登録
- Publishable keyだけでゲーム設定を取得
- 4834、4500の順に2回送信し、初回4834、ベスト4500、play count 2を確認
- 初回・ベストランキングとプレイ集計を確認
- 確認用データを削除し、`tomatoku`の記録0件へ復元
- `rankingsEnabled=true`、`submissionsEnabled=true`へ更新
- ランダム練習は引き続き送信対象外

残る確認は、GitHub Pages反映後の実験場・詳細ランキングとiPhone Safariの実機通信である。
