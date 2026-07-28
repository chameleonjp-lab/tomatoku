# トマトオク v2 ランキング公開確認

- 実施日: 2026-07-19
- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- `game_slug`: `tomatoku`
- Supabaseプロジェクト: `chameleonJP-Lab`

## 1. 目的

公式3問の補正タイムを、カメレオンJPの実験場で使用している共通ランキングへ安全に接続する。

ランダム練習は引き続きランキング対象外とする。

## 2. public.games登録

次の内容で`public.games`へ登録した。

| 項目 | 値 |
| --- | --- |
| game_slug | `tomatoku` |
| title | トマトオク |
| game_url | `https://chameleonjp-lab.github.io/tomatooku/` |
| display_order | `33` |
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
5×5の畑に🍅を置き、公式3問の補正タイムを競うパズル
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

## 6. クライアント設定

`src/ranking-config.js`:

```text
clientVersion = tomatooku-web-2.2.0-ranking-live-v1
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
- iPhone Safariから公式3問を通しプレイできること
- 実ブラウザからの`submit_score`成功
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
