# トマトオク 仕様書 (SPEC) — 実装の正本

本書は実装後の **正本仕様**。コードと一致しない記述は残さない。
(更新基準: `src/` 実装と `scripts/` テスト)

## 1. 全体構成

- 静的サイト。素の ES Modules。サーバー常駐処理なし。
- エントリ: `index.html`(`<script type="module" src="./src/main.js">`)。
- モジュール依存: `main.js` → `game.js` → `stages.js` / `main.js` → `ranking.js`
  (`ranking.js` も `game.js` の `SCORE` を参照)/ `main.js` → `tutorial.js`。

## 2. データ: `src/stages.js`

`STAGES` は 30 要素の配列。各要素:

```js
{ id: "T001", difficulty: 1,
  regions: ["AABBC", ...5行...],   // 'A'..'E' = 5エリア(各5マス)
  solution: [[r,c] x5] }            // 正解配置(row昇順)
```

- difficulty: 1=やさしい / 2=ふつう / 3=むずかしい(各 10 問)。
- 全ステージ一意解。`scripts/verify_stages.js` で検証済み(盤面 30 種すべて相異なる)。
- 再生成: `node scripts/generate_stages.js`(乱数シード固定で再現可能)。
- **正解パターンの重複について**: 5×5 で本ルールを満たす正解配置は理論上 14 通りしか
  なく、一意解になる盤面が希少なため、30 問は **10 種類の正解パターン**を共有する
  (盤面=エリア形は全て異なる)。盤面の見た目は別でも、上位勢が正解位置を暗記する
  懸念があるため、`pickStages` が**同一プレイ内で正解パターンが重ならない**よう選出する
  (検証: 2000 プレイすべてで 3 パターン相異なり)。将来版でエリア生成を増やし、
  正解パターンの種類自体を増やすのが望ましい。

## 3. ロジック: `src/game.js`

### 定数
- `N = 5`
- `SCORE = { BASE: 180000, MISTAKE_PENALTY: 3000, HINT_PENALTY: 30000 }`

### `pickStages(rand=Math.random) → [stage,stage,stage]`
難易度 1/2/3 から 1 問ずつランダム選出。同一プレイ内で **ステージ ID** も
**正解パターン(`solutionSignature`)** も重複しないよう選ぶ(暗記ゲー化の抑止)。
被らない候補が無い場合のみ通常選出にフォールバック。グループが空のときは全ステージから補完。

### `solutionSignature(stage) → string`
正解の行ごとの列番号を結合した署名。プレイ内の正解パターン重複検出に使う。

### `class StageState(stage)`
1ステージ分の盤面。`placed[r][c]: bool`, `count`, `cleared`。

- `canPlace(r,c) → {ok, reason}`: 行/列/エリア/隣接(8方向)/5個上限を検査。
  `reason ∈ {occupied, full, row, col, region, adjacent, null}`。
- `tap(r,c) → {type, reason?}`:
  - 置いてあるマス → `remove`(常に許可)
  - 置けるマス → `place`(置いた後クリア判定)
  - 置けない空マス → `mistake`(置かない)
- `checkCleared()`: 5個 / 各行・列・エリア 1 個 / 隣接なし を明示確認。
- `applyHint() → [r,c]|null`: 正解でない配置を除去 → 未配置の正解セルを 1 つ確定配置。
  進行不能を防ぐため盤面を solution の部分集合へ正規化する。
- `canHint()`: クリア済みでなく、残り正解があれば true。

### `class GameSession(playerName, rand=Math.random)`
- `stages`(3) / `states`(3) / `index` / `mistakeCount` / `hintCount` /
  `accumulatedMs` / `stageStartTime` / `startTime` / `endTime`。
- `start(now)`, `current`, `stageNumber`(1始まり), `totalStages`,
  `isLastStage()`, `clearCurrentStage(now)`,
  `advance(now) → finished:bool`(最終で endTime 確定), `elapsedMs(now)`, `score(now)`。
- **計測モデル(重要)**: タイマーは「プレイヤーが操作できる時間」だけを積み上げる。
  - `clearCurrentStage(now)`: クリアした**瞬間**に呼び、その時点までの実時間を
    `accumulatedMs` へ確定し計測を止める。
  - `advance(now)`: 次ステージの**盤面表示時**に呼び、計測を再開(`stageStartTime`)。
  - これにより**クリア演出(850ms)やステージ間の待ち時間はスコアに含まれない**。
    `elapsedMs = accumulatedMs + (計測中なら now - stageStartTime)`。

### `computeScore({elapsedMs, mistakeCount, hintCount}) → int`
`max(0, 180000 - floor(elapsedMs) - mistakeCount*3000 - hintCount*30000)`。
`elapsedMs` は 3ステージ通しの**実プレイ時間の合計**(演出時間を除く)。
正規プレイでは `elapsedMs ≥ 0` のため値は常に 0〜180000。

### `formatTime(ms) → "m:ss.S"`

## 4. UI: `src/main.js`

- 画面: `#screen-home` / `#screen-game` / `#screen-result`(`.active` で表示切替)。
- localStorage は **`tomatoku.playerName` のみ**読み書き(他は一切保存しない)。
- ホーム: 名前必須(空ならエラー表示・開始しない)。Enter でも開始。
  ボタンは スタート / **遊び方**(`#howto-btn`)/ **チュートリアル**(`#tutorial-btn`)/
  シェア。ランキング表示。
- モーダル(`#howto-modal` / `#tutorial-modal`):`.modal.open` で表示。
  背景(`.modal-backdrop`)・×・`data-close` ボタン・Esc で閉じる。
  - 遊び方: ルール/操作/スコアの静的説明。「チュートリアルで動きを見る」導線あり。
  - チュートリアル: `src/tutorial.js` の 4×4 自動アニメを再生(下記§7)。
    開くたびに最初から再生。閉じると `stopTutorial()` で停止。
- ゲーム:
  - 盤面は 25 個の `<button.cell.area-X>`。タップで `StageState.tap`。
    エリア境界には太枠(`.edge-top/bottom/left/right`)を付け、**色覚に依存せず**
    エリアを見分けられるようにする。
  - 誤タップ: `mistakeCount++`、対象セルに揺れ+赤(`.mistake` 0.36s)、バイブ。
  - 配置/除去: 再描画 + HUD 更新。クリアなら `onStageClear`
    (先頭で `clearCurrentStage()` を呼び計測を確定)。
  - HUD: ステージ `n/3` / タイム / スコア目安 / 誤タップ・ヒント。
    タイムとスコア目安は `requestAnimationFrame` で更新。
  - ヒント: `applyHint` → `hintCount++`、対象セルを黄枠表示。`canHint()` で無効化。
  - ホームへ戻る: 確認後セッション破棄(記録しない)。
- クリア演出: 盤面 `pop` アニメ + トースト。850ms 後に次ステージ or 結果へ。
  `advancing` フラグで二重進行を防止。
- 結果:
  - 最終スコア / クリアタイム / ステージ(3/3)/ 誤タップ / ヒントを表示。
  - 送信状態を `#submit-state`(pending/ok/error/skipped)に表示。
  - **送信は `submitScore` を 1 回呼ぶのみ**(ranking.js でも二重送信防止)。
  - シェア文に必ずゲーム URL(`location.origin + pathname`)を含む。
  - もう一度遊ぶ / ホーム。

### ズーム・選択抑制
- `viewport`: `maximum-scale=1, user-scalable=no`。
- `body`: `user-select:none`, `touch-action:manipulation`, `-webkit-touch-callout:none`。
- ダブルタップ(300ms 以内の touchend)を `preventDefault`。
- 盤面上の contextmenu を抑制。

### エラー耐性
- `boot()` は try/catch。失敗時はエラーバナーを出し白画面を回避。

## 5. ランキング: `src/ranking.js`

- `CONFIG`: `DEFAULTS` を `window.TOMATOKU_CONFIG` で上書き。
  `supabaseUrl` / `supabaseAnonKey` / `gameSlug="tomatoku"` /
  `submitRpc="submit_score"` / `rankingRpc="get_ranking"` / `timeoutMs=8000`。
- `isConfigured()`: URL と anon key が揃っていれば true。
- `submitScore({playerName, score}) → Promise<{status, firstScore, bestScore, rank, message}>`
  - `status ∈ {ok, skipped, error}`。
  - **二重送信防止**: 初回呼び出しで送信し Promise をキャッシュ。再呼び出しは同一 Promise。
  - 未設定なら `skipped`。失敗なら `error`(例外を投げない)。
  - 送信 body: `{ p_game_slug, p_player_name(24字まで), p_score }`。
    `p_score` は **0〜MAX_SCORE(=SCORE.BASE=180000)に clamp**(改ざん・桁あふれ対策)。
    サーバー側 RPC でも同範囲に clamp する(`docs/SUPABASE_SETUP.md`)。
- `fetchRanking(limit=10) → Promise<[{playerName,bestScore,firstScore,rank}]>`
  失敗・未設定時は空配列。ランキング表示は最高スコアを主表示し、`firstScore` が
  あれば「初回 X」を副表示する。
- `resetSubmission()`: 新規プレイ開始時に送信状態を初期化。

## 6. チュートリアル: `src/tutorial.js`

- **目的**: 本番は 5×5 だが、4×4 の小盤面でルールと操作を自動アニメで解説。
- 盤面: 4×4・4分割(クォーター)の `REGIONS=["AABB","AABB","CCDD","CCDD"]`。
  各エリアは本番盤面と同じ淡い色で常時見分けられる。
  解 `SOLUTION=[[0,1],[1,3],[2,0],[3,2]]`(各行/列/エリア1個・斜め隣接なし)。
- ステップエンジン: `async` シーケンス + キャンセル可能な `delay(ms, runId)`。
  `runId` 世代で再生をキャンセル(再生し直し・モーダルを閉じる時)。
  `TUTORIAL_PLAYBACK_RATE=0.5`で各説明の待ち時間を2倍にし、演出時間は維持する。
- 流れ: 導入 → タップで置く → ルール①行 → ②列 → ③エリア → ④隣接(各ルールで
  ハイライト + 誤り例 `ghost-bad` を ✗ 表示)→ 残りを ✓ 付きで配置 → クリア演出
  → 「本番は5×5・3ステージ」。進捗バー(`#tutorial-bar`)を更新。
- 公開 API: `playTutorial()`(最初から再生)/ `stopTutorial()`(停止)。
- DOM 構築は初回のみ。タイマー以外の副作用なし・例外は `catch` で無視。

## 7. スタイル: `src/styles.css`

- `.app` は `max-width:480px` 中央寄せ。`overflow-x:hidden`。
- 盤面 `.board` は `width:min(92vw,380px)`, `aspect-ratio:1`, 5×5 grid。
- エリア色: `--area-a..e`(淡色 5 種)。本番`.cell`とチュートリアル`.tcell`
  で同じ色を使う。`.cell.filled .tomato` で 🍅 表示。
- エリア境界: `.cell.edge-*` の太枠で区画線を描画(色覚非依存の補強)。
- `.mistake`(揺れ+赤)/ `.cleared`(pop)/ `.toast` / 結果・ランキング表
  (`.rank-row .name .first` で初回スコアを副表示)。
- モーダル: `.modal`/`.modal-card`(`modal-in` アニメ)/`.modal-close`。
- チュートリアル盤面: `.tboard`/`.tcell`、`hl-soft`(黄ハイライト)/
  `adj`(隣接赤枠)/`ghost-bad`(誤り例)/`mark-ok`(✓)/`mark-bad`(✗)/
  `tcleared`(クリア演出)。
- `@media (max-width:340px)` で iPhone SE 微調整(`.tboard` も縮小)。

## 8. 保存・通信の制約(遵守事項)

- localStorage: `tomatoku.playerName` のみ。スコア/履歴/進行は保存しない。
- ランキング送信はゲーム終了時 1 回のみ。
- secret key は使わない(anon key のみ)。
- 配信容量は数十 KB(画像/音声/ライブラリなし)。
