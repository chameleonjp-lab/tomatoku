# トマトオク v2 ランキング運用記録

- 初回実施日: 2026-07-19
- 再開実施日: 2026-08-01
- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- `game_slug`: `tomatoku`
- Supabaseプロジェクト: `chameleonJP-Lab`

> 1〜12節は2026年8月1日の旧`tomatoku`再開履歴であり、現行の送信契約ではない。2026年8月2日の監査後は§13を正本とする。

## 1. 目的

公式モードのランダム3問による補正タイムを、カメレオンJPの実験場で使用している共通ランキングへ安全に接続する。

ランダム練習は引き続きランキング対象外とする。

## 2. public.games登録

次の内容で`public.games`へ登録した。

| 項目 | 値 |
| --- | --- |
| game_slug | `tomatoku` |
| title | トマトオク |
| game_url | `https://chameleonjp-lab.github.io/tomatooku/` |
| display_order | `34` |
| release_date | `2026-07-19` |
| is_active | `true` |
| top_ranking_type | `best` |
| score_order | `asc` |
| score_unit | `秒` |
| score_scale | `100` |
| score_decimals | `2` |
| score_label | `補正タイム` |
| first_score_label | `初回タイム` |
| best_score_label | `ベストタイム` |

説明:

```text
5×5の畑に🍅を置き、公式モードの補正タイムを競うパズル
```

### Data API読取権限

`public.games`はRLS有効で、次の既存ポリシーを確認した。

```text
policy: games_select_public
role: anon
command: SELECT
condition: is_active = true
```

ポリシーは存在していたが、`anon`にテーブルの`SELECT`権限が無かったため、次だけを追加した。

```sql
grant select on table public.games to anon;
```

`INSERT`、`UPDATE`、`DELETE`権限は追加していない。実験場のData APIからは、RLSポリシーにより`is_active=true`のゲームだけを取得できる。

## 3. 共通RPC契約

利用する関数:

```text
submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text
)

get_best_score_ranking(
  p_game_slug text,
  p_limit integer
)

get_first_try_ranking(
  p_game_slug text,
  p_limit integer
)
```

`anon`ロールから3関数を実行できることを確認した。

ブラウザ側はPublishable keyを`apikey`ヘッダーだけへ設定する。secret key、service role key、`Authorization: Bearer`は使用しない。

## 4. 疎通確認

確認用プレイヤーを一時作成し、同一プレイヤーで2回送信した。

```text
1回目: 4834 = 48.34秒
2回目: 4500 = 45.00秒
```

確認結果:

- `accepted = true`
- `first_score = 4834`
- `best_score = 4500`
- `play_count = 2`
- 2回目は`is_new_best = true`
- `score_order = asc`として短い値がベストへ更新された
- ベストランキングで1位・45.00秒として取得できた
- 初回ランキングで1位・48.34秒として取得できた

## 5. テストデータ削除

疎通確認後、確認用プレイヤーに関係する次の行を削除した。

```text
public.score_runs
public.game_scores
public.players
```

削除後の確認:

```text
score_runs_left = 0
game_scores_left = 0
players_left = 0
```

`public.games`の`tomatoku`登録だけを残した。ゲーム統計は`total_play_count=0`、`player_count=0`へ戻っている。

2026年8月2日の読み取り専用再確認では、固定出題版の実プレイが1件記録されていた。
現行RPCは`game_slug`だけで集計し、`client_version`では世代分離しない。ランダム出題版の公開前に、
この旧記録をリセットするか、別slugまたはサーバー側の世代分離を採用するかを明示的に決める。
判断が完了するまでは公開停止条件とし、無断削除しない。

## 6. クライアント設定

`src/ranking-config.js`:

```text
clientVersion = tomatooku-web-2.6.0-random-official-v1
rankingsEnabled = true
submissionsEnabled = true
```

送信条件:

1. モードが`official`
2. play IDが空ではない
3. ランキング設定が有効
4. `submissionsEnabled = true`
5. 同一play IDで未送信

`practice`は設定に関係なく常に送信しない。

## 7. 公開導線

ホームと結果画面に次を追加した。

- 実験場
  - `https://chameleonjp.codeberg.page/chameleonjp_lab/`
- 詳細ランキング
  - `https://chameleonjp.codeberg.page/chameleonjp_lab/ranking.html?game=tomatoku`

実験場は`public.games where is_active = true`を読み込むため、台帳登録後は固定配列の更新なしでもゲームカードを解決できる。

## 8. 自動確認

`scripts/launch-config.test.js`で次を固定する。

- `gameSlug = tomatoku`
- `rankingsEnabled = true`
- `submissionsEnabled = true`
- 本番用clientVersion
- 共通RPC名
- Supabase URLとPublishable keyの形式
- ホームの実験場・詳細ランキングリンク
- 結果画面の実験場・詳細ランキングリンク

確認結果:

```text
LAUNCH CONFIG TEST RESULT: PASS
```

## 9. 残る確認

- GitHub Pagesへ最新`main`が反映されたこと
- iPhone Safariから公式モードを通しプレイできること
- iPhone Safariからの`submit_score`成功
- 実験場トップへトマトオクが表示されること
- 詳細ランキングで初回・ベストが小数2桁の秒表示になること
- WebKit / 320px幅のE2E

## 10. 問題発生時の停止手順

DB登録を残したまま送信だけ止める場合:

```text
src/ranking-config.js
submissionsEnabled: false
```

実験場から一時的に隠す場合:

```sql
update public.games
set is_active = false
where game_slug = 'tomatoku';
```

保存済み本番記録は、原因が確定するまで削除しない。

## 11. 次工程

- 画面とアクセシビリティの最終調整
- WebKit / iPhone実機確認
- GitHub Pages公開反映確認
- 公開前の総合監査

## 12. 2026年8月1日の再開記録

- `public.games`へ`tomatoku`を表示順34で再登録
- `games_select_public`、`anon`の`SELECT`、4つの共通RPC実行権限を再確認
- Publishable keyだけでゲーム設定を取得
- 確認用プレイヤーで4834、4500の順に2回送信
- 初回4834、ベスト4500、プレイ回数2、参加者1を確認
- 初回・ベストランキングの両方から同じ値を取得
- 確認用の`score_runs`、`game_scores`、`players`を削除
- 削除後に`tomatoku`の記録0件と`is_active=true`を確認

## 13. 2026年8月2日の一時停止と修正版

- 旧`tomatoku`は`is_active=false`で一時停止済み
- 固定出題版の実プレイ1件は削除せず履歴として保持
- 修正版は`tomatoku_competition_v1`へ世代分離
- client versionは`tomatooku-web-3.0.0-verified-competition-v1`
- 公式は`tomatoku-competition` Edge Functionのprepare/begin/finishを使う
- ブラウザはスコアを自己申告せず、サーバーが一度限りrunと操作記録を検証して補正タイムを再計算
- 旧`submit_score`と`submit_score_with_metadata`から新slugへの登録はDB側で拒否
- 公平抽選表は各問題を厳密に同率で扱い、組の難しさ指標を最大/最小1.08以内にする
- 新slugの`is_active`とrun受付は、Draft PR、CI、独立レビュー、人間の再開承認まで無効
