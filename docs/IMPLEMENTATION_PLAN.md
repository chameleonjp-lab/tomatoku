# トマトオク 実装計画書 (IMPLEMENTATION_PLAN)

> **v1の履歴文書です。現在の実装計画やランキング接続手順として使用しないでください。**
> 現行の計画は`docs/IMPLEMENTATION_PLAN_v2.md`、現行仕様は`docs/SPEC_v2.md`を参照してください。

## 1. 実装フェーズ

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| F0 | リポジトリ状態確認 / 既存ランキング実装調査 | 完了(空リポジトリ。既存実装はスコープ外で参照不可) |
| F1 | 要件書・実装計画書の作成 | 完了 |
| F2 | ステージ生成器・ソルバ・検証スクリプト | 完了(`scripts/generate_stages.js`, `verify_stages.js`) |
| F3 | 30ステージ生成・一意解検証 | 完了(`src/stages.js`) |
| F4 | ゲームロジック(DOM 非依存)実装 | 完了(`src/game.js`) |
| F5 | ランキング連携モジュール | 完了(`src/ranking.js`) |
| F6 | UI(ホーム/ゲーム/結果)実装 | 完了(`index.html`, `src/main.js`, `src/styles.css`) |
| F7 | ロジックテスト / ブラウザ E2E テスト | 完了(`scripts/game.test.js`, `scripts/e2e.test.js`) |
| F8 | ドキュメント整備(SPEC/SUPABASE/TEST_REPORT) | 完了 |

## 2. ファイル構成

```
index.html              … 静的エントリ。viewport / ランキング設定 / 3画面 + モーダル
src/
  main.js               … 画面制御・盤面描画・タイマー・送信・シェア・モーダル(UI)
  game.js               … ゲームロジック(StageState / GameSession / スコア)
  stages.js             … 30ステージのデータ(自動生成)
  ranking.js            … Supabase 連携(fetch ベース・二重送信防止)
  tutorial.js           … 遊び方チュートリアル(4×4の自動アニメ)
  styles.css            … モバイル最優先のスタイル
scripts/
  generate_stages.js    … ステージ生成 + ソルバ + 難易度分類
  verify_stages.js      … 出力ステージの独立検証(一意解など)
  game.test.js          … ゲームロジックの単体テスト(Node)
  e2e.test.js           … Playwright によるブラウザ E2E
  launch.js             … Chromium 起動ヘルパー(固定パス無ければ既定へフォールバック)
  screenshots.js / shot-tutorial.js / check-tut-end.js … 目視・検証用キャプチャ
docs/
  REQUIREMENTS.md / IMPLEMENTATION_PLAN.md / SPEC.md
  SUPABASE_SETUP.md / TEST_REPORT.md
README.md
package.json            … npm スクリプト(test / verify / serve)
```

技術方針: **ビルドツールなしの素の ES Modules**。TypeScript / バンドラは規模に対し
過剰なため不採用。Canvas / SVG / 重いライブラリも不要で、HTML/CSS/JS のみ。
Three.js・Matter.js 等は使用しない(本ゲームに不要なため)。

## 3. ステージ検証方法

パズルは 5×5 の Queens/Star Battle 変種。一意解の保証が肝。

1. **解の列挙**: 各行・各列 1 個 = 列の順列。斜め隣接禁止は連続行で `|Δcol| ≥ 2`。
   5×5 では有効解は 14 通り。
2. **エリア生成**: 各解の 5 セルを種に、連結を保ちながらランダムに領域を成長させ、
   各エリア 5 マスに分割。
3. **一意性判定**: エリア + 行/列/隣接制約でソルバを回し、解の個数を数える。
   **解がちょうど 1 個**のもののみ採用。
4. **難易度分類**: ソルバの探索量(`nodes`)昇順に並べ、三分位で 1/2/3 に。
5. **二重検証**: `verify_stages.js` が出力済みステージを独立フル探索で再検証
   (一意解・エリア数/サイズ・solution 一致・盤面重複なし)。

実行:
```
npm run verify   # 出力済み30ステージを検証
```

## 4. ランキング連携方法

- ライブラリ非依存。Supabase REST(`POST /rest/v1/rpc/<name>`)へ `fetch`。
- ヘッダに公開 anon key(`apikey` と `Authorization: Bearer`)。
- 送信 RPC: `submit_score(p_game_slug, p_player_name, p_score)`。
- 取得 RPC: `get_ranking(p_game_slug, p_limit)`。
- **二重送信防止**: `ranking.js` がモジュール内フラグ + キャッシュ Promise を保持し、
  1プレイにつき 1 回のみ実送信。再呼び出しは同一結果を返す。`resetSubmission()` を
  新規プレイ開始時に呼ぶ。
- タイムアウト(8s)・例外を握りつぶし、結果画面は必ず表示。
- 設定は `window.TOMATOKU_CONFIG`(`supabaseUrl` / `supabaseAnonKey` / `gameSlug`)。
  未設定時は「ランキング未設定(ローカル表示のみ)」で動作継続。
- Supabase 側 SQL は `docs/SUPABASE_SETUP.md`。

## 5. テスト方法

| テスト | コマンド | 内容 |
| --- | --- | --- |
| ステージ検証 | `npm run verify` | 30ステージの一意解・形式 |
| ロジック単体 | `npm test` | 選出/誤タップ/ヒント/クリア/スコア/セッション |
| ブラウザ E2E | `node scripts/e2e.test.js` | iPhone SE 幅で実プレイ・白画面/横スクロール/送信状態 |
| 目視 | `npm run serve` → ブラウザ | スマホ表示確認 |

## 6. リスクと対策

| リスク | 対策 |
| --- | --- |
| 既存ランキング実装を参照できない(スコープ制限) | 依頼書記載の RPC 仕様に沿って実装し、`CONFIG` で差し替え可能に。SQL を SUPABASE_SETUP.md に明文化 |
| 複数解の雑なステージ | 生成・出力の二段階で一意解のみ採用。`verify_stages.js` で再検証 |
| ヒントによる進行不能 | ヒント時に誤配置を除去し盤面を solution 部分集合へ正規化。テストでヒント連打クリアを保証 |
| 誤タップの理不尽さ | 隠し答えを使わず「見えているルール」のみで判定 |
| 二重送信 | モジュール内フラグ + キャッシュ Promise |
| 通信失敗で白画面 | 送信は例外を投げず状態オブジェクトを返す。`boot()` も try/catch |
| ズーム/長押し誤操作 | viewport 固定 + touch-action + ダブルタップ抑制 + contextmenu 抑制 |
| 横スクロール | `overflow-x:hidden` / `max-width` / `min()` ベースの盤面サイズ / `box-sizing:border-box` |
| 容量超過 | 画像/音声/ライブラリ不使用。総容量は数十 KB |

## 7. 仮決め事項

- ランキング RPC 名・引数名は依頼書のインターフェースから推定(`submit_score` 等)。
  既存ゲームと差異があれば `src/ranking.js` の `CONFIG` のみ調整で対応可能。
- 難易度は解の探索量に基づく相対指標(5×5 のため絶対差は小さいが順序は保たれる)。
- シェアは `navigator.share` →(無ければ)クリップボード →(失敗時)X 投稿インテント。
