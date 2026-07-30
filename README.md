# 🍅 トマトオク

5×5の畑に🍅を置く、3ステージのタイムパズルです。

## ゲームモード

### 公式3問

全員が同じ問題を同じ順番で遊びます。

```text
T001（やさしい）
T011（ふつう）
T021（むずかしい）
```

記録は、実際に操作した時間へペナルティを加えた「補正タイム」です。短いほど好成績です。

```text
補正タイム
= 実時間
+ 誤タップ数 × 3秒
+ ヒント数 × 30秒
```

公式3問はランキング再開後の共通問題です。現在はテスト段階へ戻しているため、結果を送信しません。

### ランダム練習

難易度1・2・3から有効な3問組をランダムに選びます。ステージIDと正解配置は同一プレイ内で重複しません。練習結果はランキングへ送信しません。

## ランキング状態

2026年7月27日、テスト段階へ戻すため共有Supabaseから`tomatoku`関連情報を削除しました。画面からの取得と送信も停止しています。再開時は`public.games`への再登録、権限、取得、公式1プレイ1送信を再確認してから二つのゲートを有効にします。

- 現在: `rankingsEnabled=false`、`submissionsEnabled=false`
- 公式3問: テスト中は送信しない
- ランダム練習: 常にランキング対象外
- `game_slug`: `tomatoku`
- 表示名・リポジトリ名・公開パス: `tomatooku`
- `score_order`: `asc`
- `score_unit`: `秒`
- `score_scale`: `100`
- `score_decimals`: `2`
- `score_label`: `補正タイム`

現在も利用する公開導線:

- [カメレオンJPの実験場](https://chameleonjp.codeberg.page/chameleonjp_lab/)

詳細ランキングへの導線は、ランキング停止中は画面へ表示しません。

## GitHub Pages

正式公開先は次です。

```text
https://chameleonjp-lab.github.io/tomatooku/
```

GitHubの`main`が更新されると、公開用ファイルだけを検査してGitHub Pagesへ自動反映します。

```text
index.html
src/
generated/variable-stage-bank-v2.json
```

Codebergへの送信、外部アクセストークン、公開専用ブランチは使いません。初回だけ、リポジトリのPages設定で公開元を`GitHub Actions`にします。

公開契約と設定手順:

- `docs/GITHUB_PAGES_DEPLOY.md`

## ルール

- 各行に🍅は1個
- 各列に🍅は1個
- 各エリアに🍅は1個
- 🍅同士は上下左右斜めで隣り合わない

## 生成器v2の状態

### Slice 1：正解配置基盤

5×5ルールを満たす正解配置14種類を完全列挙し、回転・反転を含むD4対称変換で3クラスへ正規化します。

- 個別配置の安定`patternId`: 14件
- 対称クラスの安定`symmetryClassId`: 3件
- seed付きMulberry32と非破壊Fisher–Yates shuffle
- generator versionとseedを持つ固定manifest

```text
generated/solution-patterns-v2.json
```

### Slice 2：固定5マス連結エリア候補

正解セルを別エリアの種として、各5マス・4近傍連結のエリアへ成長させます。全探索ソルバで一意解を確認し、エリア名、回転、反転に依存しない安定`stageId`を生成します。

```text
正解配置: 14
候補生成成功: 10
試行上限到達: 4
対称重複除外後: 5盤面
確認できた解配置対称クラス: 2 / 3
```

```text
generated/stage-candidates-v2.json
```

### Slice 3：固定5マス84問成立性監査

現在の盤面契約を固定して全探索しました。

```text
正解配置                     14
連結5マス×5領域の完全分割    21,452
一意解付きラベル盤面          36
D4・エリア名正規化後           5
要求されたcanonical盤面       84
目標成立                      false
```

固定5マス契約では、対称形を除外した84問バンクは構築できません。最大数は5問です。

```text
generated/stage-bank-feasibility-v2.json
```

```text
candidate-v2.runtimeEnabled = false
candidate-v2.rankingEligible = false
candidate-v2.status = blocked-by-constraints
```

### Slice 4：可変4〜6マス84問成立性監査

中心ルールを維持したまま、エリアサイズだけを4〜6マスへ緩和して存在証明型の監査を行いました。

```text
要求canonical盤面                    84
確認canonical盤面                    84
目標成立                              true
処理した正解配置                      1 / 14
訪問した連結完全分割                  9,524
一意解として確認した分割              84
```

サイズプロファイル:

```text
4-4-5-6-6    65問
4-5-5-5-6    19問
```

`3〜7マス`まで広げる必要はなく、最小緩和`4〜6マス`だけで84問が成立します。

```text
generated/stage-bank-variable-feasibility-v2.json
```

```text
candidate-v2-variable-4-6.runtimeEnabled = false
candidate-v2-variable-4-6.rankingEligible = false
candidate-v2-variable-4-6.status = contract-proposed-pending-approval
```

### Slice 5：可変エリア Stage Schema v2

生成器から独立したvalidator契約を追加しました。

```text
schemaVersion = 2
盤面 = 5×5
エリア = A〜E
各エリア = 4〜6マス・4近傍連結
solution = 行順の[row, col]×5
一意解 = 必須
stable id = canonical盤面由来
```

84問の成立性manifestをschema v2へ変換し、全件を独立validatorで検証します。候補bankは84問以上、ID重複なし、D4重複なし、runtime・ranking無効を必須とします。

```text
src/variable-stage-contract.js
docs/VARIABLE_REGION_STAGE_CONTRACT.md
```

### Slice 6：可変エリア候補プール

3つのD4正解配置クラスを横断してraw候補185問を生成し、構造距離・サイズプロファイル・自動難易度を使って108問を選出しました。

```text
raw候補                       185問
選出候補                      108問
対称クラス分布                46 / 45 / 17
サイズ分布                    73 / 35
難易度分布                    36 / 36 / 36
最短構造距離                  1
```

希少クラス`SC-3a178cba`はraw候補が17問しか存在しないため、当初の均等36問配分は行っていません。17問をすべて保持し、残りを他2クラスへ配分しています。

最短距離1の候補が59問あるため、これは完成バンクではなく人間レビュー用の候補プールです。

```text
generated/variable-stage-candidate-pool-v2.json
candidate-v2-variable-4-6-pool.status = candidate-pool-ready-for-review
candidate-v2-variable-4-6-pool.runtimeEnabled = false
candidate-v2-variable-4-6-pool.rankingEligible = false
```

### Slice 7：人間レビュー基盤

108問候補プールを1組ずつ最近傍と比較し、採用・除外・保留を記録できる開発専用ページを追加しました。

```text
review/variable-stage-review.html
```

主な機能:

- D4整列後の最近傍盤面比較
- 差分セル強調
- 正解表示切替
- 難易度・対称クラス・サイズ・分岐指標
- 判断・距離・難易度・クラス・サイズ・IDフィルター
- 採用・除外・保留・理由・メモ
- `localStorage["tomatooku.variableStageReview.v1"]`へ中断状態を保存
- レビューJSONの書き出し・読み込み
- iPhone SE相当320px対応

```text
http://localhost:8080/review/variable-stage-review.html
```

レビュー画面は公開ゲームの`index.html`からリンクせず、Supabase・ランキングへ送信しません。

### Slice 8：レビュー第1巡

108問を完全判断し、PR #18のマージを人間承認として採用84問・除外24問を固定しました。

```text
採用                         84問
除外                         24問
保留                          0問
未判断                        0問
対称クラス分布                34 / 33 / 17
難易度分布                    28 / 28 / 28
サイズ分布                    61 / 23
```

```text
review/decisions/variable-stage-review-round1.json
```

### Slice 9：可変エリア84問完成バンク

承認済みレビューの`keep`84問だけから、出典SHA-256を保持する完成バンクを決定論的に生成しました。

```text
generated/variable-stage-bank-v2.json
candidate-v2-variable-4-6-final.status = active-practice-only
candidate-v2-variable-4-6-final.runtimeEnabled = true
candidate-v2-variable-4-6-final.rankingEligible = false
ACTIVE_STAGE_BANK_ID = legacy-v1
ACTIVE_PRACTICE_STAGE_BANK_ID = candidate-v2-variable-4-6-final
```

### Slice 10：ランダム練習への先行接続

84問完成バンクをランダム練習だけへ接続しました。

- 公式3問は`T001 / T011 / T021`のまま
- 公式開始時は完成バンクJSONを取得しない
- 練習は84問から難易度1→2→3を出題
- 練習結果はランキング対象外
- JSON取得・schema検証失敗時は旧30問へ自動fallback
- feature gateを無効化すると即時に旧30問へ戻せる

```text
PRACTICE_STAGE_BANK_FEATURE.enabled = true
primary = candidate-v2-variable-4-6-final
fallback = legacy-v1
```

接続実装とChromium / WebKit自動テストは完了しています。残る工程はGitHub Pages反映後の実機確認です。自動E2Eは実機確認の代用にはしません。

詳細:

- `docs/GENERATOR_V2_FOUNDATION.md`
- `docs/GENERATOR_V2_REGIONS.md`
- `docs/GENERATOR_V2_BANK_FEASIBILITY.md`
- `docs/GENERATOR_V2_VARIABLE_REGION_FEASIBILITY.md`
- `docs/VARIABLE_REGION_STAGE_CONTRACT.md`
- `docs/VARIABLE_STAGE_CANDIDATE_POOL.md`
- `docs/VARIABLE_STAGE_REVIEW_TOOL.md`
- `docs/VARIABLE_STAGE_REVIEW_ROUND1.md`
- `docs/VARIABLE_STAGE_FINAL_BANK.md`
- `docs/PRACTICE_STAGE_BANK_ROLLOUT.md`
- `docs/RELEASE_DEVICE_CHECK_v2.md`

## 画面フロー

```text
home
→ countdown
→ playing
→ stageTransition
→ result
```

カウントダウンとステージ間演出は計測に含めません。盤面描画後に計測を開始し、クリア確定時に停止します。

## 結果表示

- モード
- 補正タイム
- 実時間
- 誤タップ数と加算秒
- ヒント数と加算秒
- ステージ別の実時間、誤タップ数、ヒント数
- 公式ランキング送信状態

## アクセシビリティ

- モーダルを開いたときにフォーカスを内部へ移動
- `Tab`キーをモーダル内へ閉じ込める
- 閉じたときに起点のボタンへフォーカスを戻す
- 盤面を操作グループとして説明
- 配置・取り除き・誤タップ理由をライブ領域で通知
- キーボードフォーカスを明確に表示
- `prefers-reduced-motion`に対応
- 強制カラーモード用の輪郭を追加
- 320px幅ではHUDを2列へ組み替え
- 外部リンクが新しいタブで開くことを読み上げへ追加
- チュートリアル進行度を`progressbar`として提供
- チュートリアルは4エリアを色分けし、説明を0.5倍速で進行

## プレイヤー名と保存内容

ブラウザ内の`localStorage`にはプレイヤー名だけを保存します。

```text
localStorage["tomatoku.playerName"]
```

現在は公式・練習とも結果をサーバーへ送信しません。ブラウザ内へ保存するのはプレイヤー名だけです。本名、メールアドレス、電話番号を入力しない案内を画面に表示します。

## ローカル実行

ES Modulesを使うため、HTTPで配信してください。

```bash
npm run serve
# http://localhost:8080
```

## 開発コマンド

```bash
npm run gen                              # 現行30問バンクを再生成
npm run gen:v2                           # v2配置manifestと候補probeを再生成
npm run gen:v2:patterns                  # v2正解配置manifestを再生成
npm run gen:v2:candidates                # v2固定5マス候補manifestを再生成
npm run gen:v2:variable-pool             # 可変4〜6マス108問候補プールを再生成
npm run gen:v2:variable-final-bank        # 承認済み84問完成バンクを再生成
npm run audit:v2:bank                    # 固定5マス84問成立性を全探索監査
npm run audit:v2:variable-regions        # 可変4〜6マスで84問の存在を監査
npm run verify                           # 現行ステージ形式・一意解検証
npm test                                 # 全静的・契約テスト
npm run test:game                        # ゲームロジック
npm run test:ranking                     # ランキング契約
npm run test:launch                      # 本番送信ゲートと公開導線
npm run test:browser-launch              # Chromium既定・WebKit選択・CI文書契約
npm run test:accessibility               # UIアクセシビリティ契約
npm run test:generator-v2                # v2生成器の全契約
npm run test:generator-v2:foundation     # v2列挙・対称性・seed・ID契約
npm run test:generator-v2:regions        # v2固定5マス・一意解・盤面ID契約
npm run test:generator-v2:feasibility    # 固定5マス全探索・停止契約
npm run test:generator-v2:variable-regions # 可変4〜6マス成立性契約
npm run test:generator-v2:variable-pool  # 108問候補プール・分布・距離契約
npm run test:variable-stage-contract      # 独立stage schema v2・bank契約
npm run test:variable-stage-review        # レビュー画面・108問距離再計算契約
npm run test:variable-stage-review-round1 # 採用84・除外24レビュー契約
npm run test:variable-stage-final-bank    # 84問完成バンク・出典SHA・分布契約
npm run test:practice-stage-bank          # 練習bank routing・fallback契約
npm run e2e                              # 公開ゲームChromium E2E
npm run e2e:webkit                       # 公開ゲームWebKit E2E
npm run e2e:review                       # レビュー画面iPhone SE相当E2E
npm run e2e:practice-bank                 # 公式隔離・練習84問・fallback Chromium E2E
npm run e2e:practice-bank:webkit          # 同じ練習契約のWebKit E2E
npm run serve                            # ローカルHTTPサーバー
```

## 構成

```text
generated/
  solution-patterns-v2.json
  stage-candidates-v2.json
  stage-bank-feasibility-v2.json
  stage-bank-variable-feasibility-v2.json
  variable-stage-candidate-pool-v2.json
  variable-stage-bank-v2.json
review/
  decisions/
    variable-stage-review-round1.json
  variable-stage-review.html
  variable-stage-review.css
  variable-stage-review.js
index.html
src/
  accessibility.css
  accessibility.js
  game.js
  main.js
  practice-stage-bank.js
  ranking-config.js
  ranking.js
  stage-bank-config.js
  variable-stage-contract.js
  stages.js
  styles.css
  tutorial.js
scripts/
  generator-v2/
    core.js
    core.test.js
    feasibility.js
    feasibility.test.js
    regions.js
    regions.test.js
    variable-feasibility.js
    variable-feasibility.test.js
    variable-pool.js
    variable-pool.test.js
    variable-final-bank.js
  accessibility.test.js
  audit_stage_bank_v2.js
  audit_variable_region_sizes_v2.js
  variable-stage-contract.test.js
  variable-stage-review.test.js
  variable-stage-review.e2e.js
  variable-stage-review-round1.test.js
  variable-stage-final-bank.test.js
  practice-stage-bank.test.js
  practice-stage-bank.e2e.js
  generate_stages.js
  generate_stages_v2.js
  generate_stage_candidates_v2.js
  generate_variable_stage_pool_v2.js
  generate_variable_stage_bank_v2.js
  game.test.js
  ranking.test.js
  launch.js
  launch-config.test.js
  browser-launch.test.js
  release-device-check.test.js
  e2e.test.js
docs/
  REQUIREMENTS_v2.md
  SPEC_v2.md
  IMPLEMENTATION_PLAN_v2.md
  RANKING_REVIEW_v2.md
  TIMER_REVIEW_v2.md
  MODE_SCORE_REVIEW_v2.md
  RANKING_LAUNCH_v2.md
  ACCESSIBILITY_REVIEW_v2.md
  GENERATOR_V2_FOUNDATION.md
  GENERATOR_V2_REGIONS.md
  GENERATOR_V2_BANK_FEASIBILITY.md
  GENERATOR_V2_VARIABLE_REGION_FEASIBILITY.md
  VARIABLE_REGION_STAGE_CONTRACT.md
  VARIABLE_STAGE_CANDIDATE_POOL.md
  VARIABLE_STAGE_REVIEW_TOOL.md
  VARIABLE_STAGE_REVIEW_ROUND1.md
  VARIABLE_STAGE_FINAL_BANK.md
  PRACTICE_STAGE_BANK_ROLLOUT.md
  RELEASE_DEVICE_CHECK_v2.md
```

## セキュリティ

ブラウザにはPublishable keyだけを置きます。secret key、service role key、`Authorization: Bearer`は使用しません。共有Supabaseの関数やテーブルを、このリポジトリのSQLで置き換えないでください。
