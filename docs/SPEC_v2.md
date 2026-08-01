# トマトオク v2 技術仕様

- 文書種別: 現行実装仕様
- 対象: `chameleonjp-lab/tomatooku`
- `game_slug`: `tomatoku`
- 公開名・リポジトリ名: `tomatooku`
- 標準公開先: `https://chameleonjp-lab.github.io/tomatooku/`
- 基準ブランチ: `main`
- 更新日: 2026-08-02
- 現在状態: 公式・練習の共通ランダム問題バンク接続済み／Supabaseランキング取得・公式送信再開／GitHub Pages公開元設定・公開後実機確認待ち

## 1. ゲーム概要

5×5の盤面へ🍅を5個置くパズル。次をすべて満たすとクリアする。

- 各行に1個
- 各列に1個
- 各エリアに1個
- 上下左右斜めで隣接しない

1プレイは難易度1・2・3の3ステージで構成する。

## 2. モード

### 公式

```text
mode = "official"
```

承認済み完成バンクから難易度1・2・3を1問ずつランダムに選ぶ。ステージIDと正解配置署名が重複しない有効な3問組だけを使う。ランキング対象となる唯一のモードで、完了時に結果を1回送信する。

起動時またはテストで次を検証する。

- 問題バンクの取得と検証に成功
- IDが重複しない
- 難易度が1→2→3
- 正解配置署名が重複しない
- 読込失敗時に別の問題へfallbackしない

### ランダム練習

```text
mode = "practice"
```

通常時は承認済み84問完成バンク `candidate-v2-variable-4-6-final`から、難易度1・2・3を1問ずつ選ぶ。ステージIDと正解配置署名が重複しない有効な3問組だけを利用する。

完成バンクは公式または練習の開始時に遅延取得し、取得とJSON読込を8秒で打ち切る。その後Stage Schema v2で検証する。公式は取得の時間切れまたは検証失敗時に開始を止める。練習は既存30問の`legacy-v1`へ自動fallbackし、一時的なfallback結果は固定せず次の開始時に再取得する。完成バンクの取得成功とfeature gate無効時のfallbackだけは同じページ内で再利用する。

ランダム練習の結果は常にランキングへ送信しない。

## 3. モジュール責務

```text
index.html
  画面構造、モード選択、結果内訳、公開導線

src/main.js
  状態遷移、DOM、入力、共有、ランキング連携、共通ランダムバンク起動

src/game.js
  盤面ルール、モード別問題選出、セッション、タイマー、補正タイム

src/stages.js
  練習fallbackが利用する検証済み30ステージ

src/stage-bank-config.js
  公式・練習共通active bank、feature gate、bank catalog

src/practice-stage-bank.js
  共通完成バンクの遅延取得、検証、時間切れ、練習fallback、再試行

src/variable-stage-contract.js
  4〜6マス可変エリアのStage Schema v2独立validator

generated/variable-stage-bank-v2.json
  人間承認済み84問完成バンク

src/ranking-config.js
  ブラウザ公開可能な接続設定、取得ゲート、送信ゲート

src/ranking.js
  共有Supabase RPC、通信状態、play ID単位の二重送信防止

src/tutorial.js
  本番と同じ色別エリアを表示し、0.5倍速で進む4×4チュートリアル

src/styles.css / src/accessibility.css / src/accessibility.js
  モバイル優先UIとアクセシビリティ補助
```

## 4. 状態遷移

```text
home
preparing
countdown
playing
stageTransition
result
retired
```

主な遷移:

```text
home -> preparing
preparing -> countdown
preparing -> home
countdown -> playing
countdown -> home
playing -> stageTransition
playing -> retired
stageTransition -> playing
stageTransition -> result
stageTransition -> retired
result -> countdown
result -> home
```

非同期コールバックは、保持したplay IDと現在のplay IDが一致するときだけ反映する。

## 5. セッション

```js
GameSession {
  playId: string;
  mode: "official" | "practice";
  playerName: string;
  stages: Stage[];
  stageBankId: string;
  stageBankFallback: boolean;
  index: number;
  states: StageState[];
  mistakeCount: number;
  hintCount: number;
  stageMistakeCounts: number[];
  stageHintCounts: number[];
  stageTimesMs: number[];
  accumulatedMs: number;
  stageStartedAt: number | null;
  status: SessionStatus;
}
```

play IDは開始ごとに新しくする。画面遷移だけを理由にランキング送信キャッシュを解除しない。

## 6. タイマー

時計は`performance.now()`を優先する。

- カウントダウン中は未計測
- 盤面DOM構築・描画後の次フレームで開始
- 5個目の配置でクリア確定した瞬間に停止
- クリア演出中は未計測
- 次盤面の描画待ち中は未計測
- `finishStage()`を二重に呼んでも重複加算しない
- バックグラウンド滞在は経過時間として扱う

各ステージの実時間を`stageTimesMs`へ保存する。

## 7. 補正タイム

ランキング値は100分の1秒単位の非負整数とする。

```js
const MISTAKE_CENTISECONDS = 300;
const HINT_CENTISECONDS = 3000;

score =
  floor(max(0, elapsedMs) / 10)
  + max(0, mistakeCount) * MISTAKE_CENTISECONDS
  + max(0, hintCount) * HINT_CENTISECONDS;
```

表示:

```text
score / 100 秒
小数2桁固定
```

DBメタデータ:

```text
score_order = asc
score_unit = 秒
score_scale = 100
score_decimals = 2
score_label = 補正タイム
first_score_label = 初回タイム
best_score_label = ベストタイム
```

## 8. 結果内訳

結果画面に次を表示する。

- モード
- 補正タイム
- 実時間
- 誤タップ数
- 誤タップ加算秒
- ヒント数
- ヒント加算秒
- 各ステージの実時間
- 各ステージの誤タップ数
- 各ステージのヒント数

## 9. ランキング契約

送信:

```text
POST /rest/v1/rpc/submit_score
```

```json
{
  "p_display_name": "表示名",
  "p_game_slug": "tomatoku",
  "p_score": 4835,
  "p_client_version": "tomatooku-web-2.6.0-random-official-v1"
}
```

取得:

```text
get_best_score_ranking(p_game_slug, p_limit)
get_first_try_ranking(p_game_slug, p_limit)
```

返却列:

```text
rank_no
display_name
first_score
best_score
play_count
updated_at
```

送信条件:

- `mode === "official"`
- play IDが空でない
- ランキング設定が有効
- `rankingsEnabled === true`
- `submissionsEnabled === true`
- 同一play IDでは1回だけ

練習、リタイア、設定不備、送信ゲートOFFでは送信しない。

## 10. 送信ゲート

2026年8月1日に`public.games`へ`tomatoku`を再登録し、Publishable keyで取得、2回送信、初回、ベスト、集計を確認した。確認用データを削除した後の現行設定は次のとおり。

```js
rankingsEnabled: true
submissionsEnabled: true
```

ホームと結果画面でベストランキングを取得し、詳細ランキング導線を表示する。公式モードの完了時だけ送信し、練習は送信しない。

固定出題版とランダム出題版は同じ`game_slug`を使い、現行の取得RPCは`client_version`で分離しない。
2026年8月2日の読み取り専用確認で旧版の実プレイ1件を確認したため、公開前に記録リセット、別slug、
またはサーバー側の世代分離のいずれかを決定する。決定前は公開しない。

障害時は`submissionsEnabled`を先に無効化して新規送信を止める。原因が取得側にもある場合は`rankingsEnabled`も無効化する。

## 11. 通信状態

```text
ok
empty
error
not_configured
disabled
skipped
```

- `ok`: 正常
- `empty`: 取得成功・0件
- `error`: HTTP、タイムアウト、JSON、返却形式不正
- `not_configured`: URLまたはPublishable key不足
- `disabled`: 設定によりランキング取得を明示停止
- `skipped`: 練習または送信ゲートOFF

タイムアウトは`AbortController`で実通信を中止する。

## 12. 名前

送信前に次を適用する。

1. NFKC正規化
2. 制御文字・方向制御文字の除去
3. 連続空白を1つへ集約
4. 前後空白を除去
5. 20文字以内
6. 空文字を拒否

## 13. ヒント

ヒントは次を返す。

```js
{
  placed: [row, col] | null,
  removed: Array<[row, col]>
}
```

正解でない配置を除去し、未配置の正解セルを1つ置く。使用1回につき補正タイムへ30秒加算する。

## 14. 誤タップ

配置不可理由:

```text
row
col
region
adjacent
full
```

誤タップ1回につき補正タイムへ3秒加算する。

## 15. 共有

- Web Share API対応時は明示的に使用
- `AbortError`はユーザーキャンセルとして終了
- キャンセル後にクリップボードへフォールバックしない
- コピー本文には正式URLを含める
- 結果共有にはモード、補正タイム、実時間、誤タップ、ヒントを含める

## 16. 非同期競合防止

管理対象:

```text
countdown timeout
countdown requestAnimationFrame
stage transition timeout
timer requestAnimationFrame
toast timeout
ranking Promise
```

ホーム移動、リタイア、再開始時に待機処理を解除する。古いランキングPromiseは新しいプレイのUIを更新しない。

## 17. セキュリティ

- Publishable keyのみ使用
- `apikey`ヘッダーだけを送る
- secret key禁止
- service role key禁止
- `Authorization: Bearer`禁止
- テーブルへ直接INSERTしない
- 共有RPCや共有テーブルをリポジトリ内SQLで置換しない

## 18. 対応端末

- 主保証: iPhone 17 Pro Safari
- 検証: iPhone 11 Pro、iPad Pro 2018
- 補助: iPhone SE相当幅、Chromium、WebKit
- 横スクロールなし
- タップ反応100ms以内を目標
- 盤面操作中30fps以上を目標

## 19. テスト

単体:

- 共通問題バンクの有効3問組
- 公式・練習500回の重複なし
- 公式で複数の組み合わせが選ばれること
- 補正タイム式
- 小数2桁表示
- ステージ別時間と加算回数
- 演出除外
- 二重終了防止
- 練習送信停止
- 公式送信ゲート
- 共通RPC本文
- 同一play ID二重送信防止
- 公式と練習のactive bank一致
- 84問完成バンクpayload検証
- feature gate有効・無効
- HTTP・不正bank・通信例外・8秒時間切れfallback
- 一時fallback後の再試行と成功bankの再利用

E2E:

- Chromium・WebKitで同じ主要フローを実行
- モードボタン
- カウントダウン
- 公式のランダム3問と難易度順
- 公式3問クリア
- 補正タイム結果
- ステージ別内訳
- 練習84問の難易度1→2→3
- 公式開始時の完成バンク取得
- 公式読込失敗時の開始停止
- 練習結果のランキング送信禁止
- fallbackとfeature gate
- 送信ゲート表示
- 320px横スクロールなし

## 20. 公開・検証状態

自動確認・接続確認済み:

- `public.games`登録
- 本番RPC疎通
- 公式送信ゲート有効化
- 実験場カード・詳細ランキング導線
- Chromium・WebKitによるiPhone SE相当E2E
- 公式・練習の共通バンク、公式開始停止、練習fallback、feature gate E2E
- WebKit自動検証は実機Safari確認の代用にしない

公開後に人間が確認する残作業:

- GitHub Pagesへ最新`main`が反映されていること
- iPhone 17 Pro Safariで公式送信と練習84問
- iPhone 11 Pro
- iPad Pro 2018の縦・横
- 低速回線、一時オフライン、復帰後の再試行
- 共有キャンセル
