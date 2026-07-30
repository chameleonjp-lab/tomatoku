# トマトオク v2 実装計画

- 文書種別: 現行実装・残工程計画
- 対象: `chameleonjp-lab/tomatooku`
- 基準ブランチ: `main`
- 更新日: 2026-07-28
- 現在状態: 84問完成バンク・練習接続済み／描写・高速入力・取得競合の補修実装済み／Supabase関連情報削除済み／ランキング取得・送信停止中／GitHub Pages自動公開はリポジトリ設定待ち／公開後実機確認待ち

## 1. 運用ルール

- `main`へ直接変更しない
- 1 work package = 1 Pull Request
- 実装、テスト、文書更新を同じPRで完結させる
- CI失敗中に別PRへ逃げない
- 公式3問、ランキング、Supabaseを生成器作業へ混在させない
- Draft解除、マージ、候補バンク有効化は明示的な人間判断を必要とする
- 現行30問とロールバック可能性を維持する
- 成立性確認と仕様採用を分離する

## 2. 現行の正式仕様

### ゲーム

- 5×5盤面
- 5エリア
- 公式3問と練習fallbackの`legacy-v1`は各エリア5マス
- 練習primaryの84問完成バンクは各エリア4〜6マス
- 各行・各列・各エリアに🍅1個
- 🍅同士は上下左右・斜めで隣接禁止
- 1プレイ3ステージ

### モード

- 公式3問: `legacy-v1`の`T001 / T011 / T021`
- ランダム練習primary: `candidate-v2-variable-4-6-final`の84問から難易度1→2→3
- ランダム練習fallback: `legacy-v1`の既存30問
- 練習結果はランキング未送信

### 補正タイム

```text
補正タイム
= 実時間
+ 誤タップ数 × 3秒
+ ヒント数 × 30秒
```

### ランキング

- `game_slug`: `tomatoku`
- 短い補正タイムが上位
- `score_scale=100`
- `score_decimals=2`
- 再開後は公式1プレイにつき送信1回
- 現在は`rankingsEnabled=false`、`submissionsEnabled=false`
- テスト中は取得・送信・詳細ランキング導線を停止

## 3. 完了済みwork package

### 3-1. v2文書・契約

状態: **completed**

- `docs/REQUIREMENTS_v2.md`
- `docs/SPEC_v2.md`
- 本計画書

### 3-2. 共通ランキング連携

状態: **completed**

- 共有RPC契約
- タイムアウト
- エラー分類
- play ID単位の二重送信防止
- 初回・ベストランキング取得

### 3-3. タイマー・非同期競合

状態: **completed**

- `performance.now()`
- countdownとステージ間演出を計測から除外
- 古い非同期処理の無効化
- ステージ別時間

### 3-4. 公式3問・練習・補正タイム

状態: **completed**

- 公式と練習の分離
- 公式問題固定
- 練習問題の重複防止
- 補正タイムと内訳
- 公式のみランキング送信

### 3-5. UI・アクセシビリティ

状態: **completed**

- iPhone SE相当320px対応
- モーダルフォーカス管理
- キーボード操作
- 誤タップ理由
- `prefers-reduced-motion`
- 強制カラーモード
- 保存内容・個人情報注意

### 3-6. 公式ランキング公開（過去完了・現在停止）

状態: **completed historically / disabled for test**

- `public.games`へ登録
- `anon` SELECT権限とRLS確認
- 送信、初回、ベスト、プレイ回数の実疎通
- テストデータ削除
- 2026年7月27日にSupabaseの`tomatoku`関連情報を削除
- 現在は`rankingsEnabled=false`、`submissionsEnabled=false`

### 3-7. CI

状態: **completed**

GitHub Actionsで次を自動実行する。

- `npm ci`
- 全静的・契約テスト
- 固定5マス成立性監査
- 可変4〜6マス成立性監査
- manifest再生成差分0
- Chromium・WebKit導入
- iPhone SE相当Playwright E2E（Chromium・WebKit）

### 3-8. 現行文書の整合

状態: **completed**

- `docs/REQUIREMENTS_v2.md`を現行製品要件へ更新
- `docs/SPEC_v2.md`をランキング公開・練習84問接続後の現行仕様へ更新
- 本計画書の正式仕様と完了状態を更新
- 文書とコードの主要契約をCIで照合

## 4. 生成器v2

### 4-1. Slice 1：正解配置基盤

状態: **completed**

- 正解配置14種類の完全列挙
- D4の8変換
- 3対称クラスへの正規化
- seed付き乱数
- 安定`patternId`
- 安定`symmetryClassId`

固定成果物:

```text
generated/solution-patterns-v2.json
```

### 4-2. Slice 2：固定5マス連結エリア候補

状態: **completed**

- 正解セルを種とした領域成長
- 各エリア5マス
- 4近傍連結検証
- 一意解ソルバ
- D4・エリア名canonical化
- 安定`stageId`
- 上限付き探索

固定成果物:

```text
generated/stage-candidates-v2.json
```

### 4-3. Slice 3：固定5マス84問成立性監査

状態: **completed / BLOCKED BY CONSTRAINTS**

全探索結果:

```text
正解配置                         14
連結5マス×5領域の完全分割        21,452
一意解付きラベル盤面              36
D4・エリア名正規化後               5
要求数                            84
成立                              false
```

結論:

- 固定5マス契約での理論上限は5canonical問
- 現行30問も同じ正規化では5型
- `candidate-v2`の有効化は禁止

固定成果物:

```text
generated/stage-bank-feasibility-v2.json
docs/GENERATOR_V2_BANK_FEASIBILITY.md
```

### 4-4. Slice 4：可変4〜6マス成立性監査

状態: **completed / FEASIBLE**

監査契約:

```text
盤面                         5×5
エリア数                     5
エリアサイズ                 4〜6マス
合計                         25マス
各エリア                     4近傍連結
各行・各列・各エリア         🍅1個
隣接禁止                     上下左右・斜め
一意解                       必須
重複除外                     D4＋エリア名正規化
必要canonical盤面            84
```

threshold-witness監査結果:

```text
確認canonical盤面                    84
目標成立                              true
処理した正解配置                      1 / 14
訪問した連結完全分割                  9,524
一意解として確認した分割              84
```

サイズ分布:

```text
4-4-5-6-6    65問
4-5-5-5-6    19問
```

結論:

- `3〜7マス`まで広げる必要はない
- 最小緩和`4〜6マス`だけで84問が成立する
- 本監査は最大数ではなく84問の存在証明
- 仕様採用とゲーム接続はまだ行わない

固定成果物:

```text
generated/stage-bank-variable-feasibility-v2.json
docs/GENERATOR_V2_VARIABLE_REGION_FEASIBILITY.md
```

### 4-5. Slice 5：可変エリア Stage Schema v2

状態: **completed / CONTRACT APPROVED**

実装:

- schema version 2
- 5×5、A〜E、各4〜6マス
- 4近傍連結
- 行順solution・列重複禁止
- 各エリア1個・隣接禁止
- 独立ソルバによる一意解確認
- D4・エリア名canonical化
- content-derived安定ID
- 84問以上のcandidate bank validator
- runtime・ranking有効化拒否

固定成果物:

```text
src/variable-stage-contract.js
scripts/variable-stage-contract.test.js
docs/VARIABLE_REGION_STAGE_CONTRACT.md
```

84問成立性manifestの全ステージは独立validatorへ合格する。生成器コードはvalidatorからimportしない。

### 4-6. Slice 6：可変エリア候補プール

状態: **completed / CANDIDATE POOL READY FOR REVIEW**

実装:

- 3つのD4正解配置クラスを対象化
- クラスごとのraw候補生成
- 独立Stage Schema v2 validator
- エリアサイズプロファイルquota
- farthest-first構造距離選出
- 伝播・分岐による自動難易度
- 難易度1〜3の均等割当
- 決定論的再生成

実測結果:

```text
raw候補                      185
選出候補                     108
対称クラス分布               46 / 45 / 17
サイズ分布                   73 / 35
難易度分布                   36 / 36 / 36
最短構造距離                 1
```

希少クラス`SC-3a178cba`はraw候補17問をすべて保持した。最短距離1が59問あるため、候補プールは完成バンクとして利用しない。

固定成果物:

```text
generated/variable-stage-candidate-pool-v2.json
scripts/generator-v2/variable-pool.js
scripts/generator-v2/variable-pool.test.js
docs/VARIABLE_STAGE_CANDIDATE_POOL.md
```

### 4-7. Slice 7：人間レビュー基盤

状態: **completed / REVIEW EXECUTION COMPLETED**

実装:

- 候補と最近傍のD4整列比較
- 差分セル強調
- 正解表示切替
- 108問最近傍距離の独立再計算
- 判断・距離・難易度・クラス・サイズ・IDフィルター
- 採用・除外・保留・理由・メモ
- localStorageによる中断・再開
- JSON書き出し・読み込み
- URLによるStage ID直接指定
- iPhone SE相当320px対応
- Supabase・ランキング通信なし

固定成果物:

```text
review/variable-stage-review.html
review/variable-stage-review.css
review/variable-stage-review.js
scripts/variable-stage-review.test.js
scripts/variable-stage-review.e2e.js
docs/VARIABLE_STAGE_REVIEW_TOOL.md
```

レビュー基盤の実装と108問の採否レビューは分離して実施した。採否レビューの完了結果はSlice 8に記録する。

### 4-8. Slice 8：レビュー第1巡

状態: **completed / HUMAN APPROVED**

実測結果:

```text
採用                         84
除外                         24
保留                          0
未判断                        0
対称クラス分布               34 / 33 / 17
難易度分布                   28 / 28 / 28
サイズ分布                   61 / 23
```

固定成果物:

```text
review/decisions/variable-stage-review-round1.json
docs/VARIABLE_STAGE_REVIEW_ROUND1.md
scripts/variable-stage-review-round1.test.js
```

### 4-9. Slice 9：84問完成バンク

状態: **completed / ACTIVE FOR PRACTICE ONLY**

実装:

- レビュー`keep`84問だけを抽出
- 候補プールとレビューJSONのSHA-256を記録
- Stage Schema v2独立validator全件合格
- 分布fixture固定
- 距離1例外9組を固定
- 決定論的再生成
- runtimeは練習専用で有効
- rankingは無効

固定成果物:

```text
generated/variable-stage-bank-v2.json
scripts/generator-v2/variable-final-bank.js
scripts/generate_variable_stage_bank_v2.js
scripts/variable-stage-final-bank.test.js
docs/VARIABLE_STAGE_FINAL_BANK.md
```

### 4-10. Slice 10：ランダム練習先行接続

状態: **implemented / RELEASE DEVICE CHECK PENDING**

実装:

- 公式active bankと練習active bankを分離
- 練習開始時だけ84問JSONを遅延取得
- Stage Schema v2 runtime検証
- 読込失敗時は旧30問へ自動fallback
- feature gateによる即時ロールバック
- 公式開始時の完成bank取得を禁止
- 練習結果のランキング送信を禁止
- 盤面へbank IDとfallback状態を記録
- feature gate無効化後もCIが成立する可変期待値
- 8秒の取得時間切れと旧30問fallback
- 一時fallbackを固定せず次回練習で再試行
- 成功bankだけをページ内で再利用

固定成果物:

```text
src/practice-stage-bank.js
scripts/practice-stage-bank.test.js
scripts/practice-stage-bank.e2e.js
docs/PRACTICE_STAGE_BANK_ROLLOUT.md
```

## 5. 現在のバンク契約

```text
ACTIVE_STAGE_BANK_ID = legacy-v1

legacy-v1.status = active
legacy-v1.runtimeEnabled = true
legacy-v1.rankingEligible = true

candidate-v2.status = blocked-by-constraints
candidate-v2.runtimeEnabled = false
candidate-v2.rankingEligible = false

candidate-v2-variable-4-6.status = contract-proposed-pending-approval
candidate-v2-variable-4-6.runtimeEnabled = false
candidate-v2-variable-4-6.rankingEligible = false

candidate-v2-variable-4-6-pool.status = candidate-pool-ready-for-review
candidate-v2-variable-4-6-pool.runtimeEnabled = false
candidate-v2-variable-4-6-pool.rankingEligible = false

candidate-v2-variable-4-6-final.status = active-practice-only
candidate-v2-variable-4-6-final.runtimeEnabled = true
candidate-v2-variable-4-6-final.rankingEligible = false

ACTIVE_PRACTICE_STAGE_BANK_ID = candidate-v2-variable-4-6-final
PRACTICE_STAGE_BANK_FEATURE.fallbackBankId = legacy-v1
```

生成器作業によって次を変更してはいけない。

- `src/stages.js`
- 公式`T001 / T011 / T021`
- ランダム練習の選出元
- 本番ランキング
- Supabaseデータ

## 6. 現在の人間判断ゲート

ランダム練習接続は実装済み。マージ・公開後の実機確認が完了するまで、feature gateと旧30問fallbackを維持する。

### 決定1：可変サイズ契約の採用（resolved）

推奨:

```text
エリア数: 5
各エリア: 4〜6マス
合計: 25マス
各エリア: 4近傍連結
```

理由:

- 84問成立を実証済み
- 3マス以下の小領域を避けられる
- 7マス以上の大領域を避けられる
- 5×5、5エリア、隣接禁止を維持できる

### 決定2：適用範囲

推奨:

- ランダム練習のみ先行採用
- 公式3問は変更しない
- ランキング契約は変更しない

### 決定3：108問候補プールの完成バンク選別（resolved）

PR #18で採用84問・除外24問を承認済み。

### 決定4：ランダム練習への接続（resolved）

採用内容:

- 公式3問は現行のまま
- ランダム練習だけ84問完成バンクへ切替
- 完成バンクはランキング対象外
- 読込失敗時は旧`legacy-v1`へ安全に戻す
- 即時ロールバック可能なfeature gateを使用

## 7. 契約承認後の次work package

### 7-1. 可変サイズstage schema（completed）

- `regionSizeRange: [4, 6]`
- A〜E
- 合計25マス
- 4近傍連結
- 一意解
- 安定ID
- D4重複なし
- schema versionとgenerator version

固定成果物:

```text
src/variable-stage-contract.js
docs/VARIABLE_REGION_STAGE_CONTRACT.md
```

### 7-2. 候補プール生成（completed）

- 108問を選出
- 3対称クラスを`46 / 45 / 17`で利用
- 決定論的再現
- raw容量と探索結果を記録
- 独立validator全件合格
- runtime・ranking無効

### 7-3. 難易度・近似選別（completed）

- 候補削除
- 強制配置
- 隣接禁止による確定
- 仮定回数
- 先読み深さ
- 盤面境界距離
- サイズプロファイル分布

### 7-4. 人間レビュー（completed）

レビュー画面:

```text
review/variable-stage-review.html
```

レビュー順:

- 距離1の59問
- 距離2の33問
- 距離3以上の16問

確認端末・観点:

- iPhone SE
- iPhone 17 Pro
- 難易度分布
- エリア識別性
- 似た盤面の体感
- レビューJSONの保存
- 採用84問以上の確保

### 7-5. 完成バンク固定（completed）

- レビューJSONを入力として採用Stage IDを固定
- 未判断を自動採用しない
- 採用84問未満なら生成・選別条件を再検討
- 完成バンクを独立validatorへ再投入
- 完成バンクのruntimeはランダム練習だけで有効
- rankingは引き続き無効
- `generated/variable-stage-bank-v2.json`へ固定済み

### 7-6. 練習モード先行切替（implemented / device check pending）

実装済み:

- 可変サイズvalidatorを練習loaderへ接続
- 練習用バンクを84問へ切替
- 公式3問は維持
- ランキングは維持
- feature gateで即時ロールバック可能
- 読込失敗時は旧30問へ自動fallback
- 専用iPhone SE相当E2Eを追加
- feature gateの1行停止を静的・E2E契約へ反映
- 読込停止を8秒で打ち切り旧30問へ復帰
- 一時fallback後は次回練習開始時に再取得

### 7-7. 現行文書の整合（completed）

- ランキング未公開・旧30問primaryなどの古い記述を現行化
- 完了済み事項と実機確認待ちを分離
- 主要なコード契約と文書の一致を静的テストへ追加
- ゲームロジック、UI、ランキング、Supabaseは変更しない

### 7-8. 公開・実機確認台帳（implemented / human execution pending）

- 同一公開候補版を特定するGitHub `main` SHAとGitHub Pages反映情報を記録
- iPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018縦横の確認欄を固定
- 公式送信、練習84問、fallback、復帰、共有キャンセルを分離して記録
- 30分継続、10回反復、バックグラウンド復帰10回、3回連続合格を明記
- 公開停止条件、証跡、未適用項目の理由を同じ台帳へ残す
- このPRではブラウザ操作・実機試験・GitHub Pages公開操作を行わない

固定成果物:

```text
docs/RELEASE_DEVICE_CHECK_v2.md
scripts/release-device-check.test.js
```

### 7-9. WebKit自動回帰検証（implemented / automated verification enabled）

- `scripts/launch.js`の既定Chromium契約を維持
- `PW_BROWSER=webkit`指定時だけPlaywright WebKitを起動
- 公開ゲームの公式3問・ランキングmock・基本UIをChromiumとWebKitで検証
- 練習84問、公式隔離、fallbackをChromiumとWebKitで検証
- 未対応ブラウザ名を暗黙fallbackせず明示的に拒否
- WebKit自動検証はSafari系差異の早期検出であり、iPhone・iPad実機確認の代用にはしない

固定成果物:

```text
scripts/launch.js
scripts/browser-launch.test.js
.github/workflows/ci.yml
```

### 7-10. 描写品質・入力・開始安全性（implemented / automated tests included）

- 白いカード上で見えなかった補助ボタンの配色を修正
- カード、モード選択、盤面、セル、クリア、結果の描写をCSSだけで改善
- エリア境界を通常枠より明確にし、色だけへ依存しない
- iPhone SE相当320×568で盤面とホーム操作を初期表示内へ収める
- モーダルの閉じる操作を48×48pxへ拡大（44px以上を保証）
- 300ms以内の2回目を捨てる全画面`touchend`処理を削除
- ヒントとステージ切替時の案内文を実際の状態へ同期
- 不可視文字だけのプレイヤー名を開始前に拒否
- 練習bankのdifficulty必須・28/28/28分布・有効3問組を起動前検証
- 練習取得中の準備表示、中止、古い要求の無効化を追加
- テスト段階に合わせてランキング取得・送信を両方停止

固定成果物:

```text
src/styles.css
src/accessibility.css
src/main.js
src/practice-stage-bank.js
src/ranking-config.js
scripts/e2e.test.js
```

### 7-11. GitHub Pages自動公開（implemented / repository setting pending）

- GitHub `main`へのpushと手動実行だけで起動
- Pull Requestでは公開ワークフローを起動しない
- 公開対象を`index.html`、`src/`、練習84問JSONへ限定
- 公開物から文書、テスト、レビュー画面、設定資料を除外
- HTML、CSS、JavaScriptのローカル参照切れを送信前に拒否
- GitHub Pagesのリポジトリパスを外れる`/`始まりの参照を拒否
- 84問バンクがruntime有効・ranking無効であることを検査
- `actions/upload-pages-artifact`で検査済み公開物だけを登録
- `actions/deploy-pages`で`github-pages`環境へ公開
- 外部アクセストークン、Repository Secrets、公開専用ブランチを使わない

リポジトリ設定の残条件:

- `Settings → Pages → Source`を`GitHub Actions`にする

固定成果物:

```text
.github/workflows/deploy-github-pages.yml
scripts/prepare-github-pages.js
scripts/github-pages.test.js
docs/GITHUB_PAGES_DEPLOY.md
```

### 7-12. チュートリアルのエリア表示・再生速度（implemented / automated tests included）

- 4×4盤面のA〜Dを本番盤面と同じ4色で常時表示
- 灰色の既定値がエリア色を上書きしない詳細度へCSSを修正
- 説明の待ち時間を共通設定`TUTORIAL_PLAYBACK_RATE=0.5`で2倍化
- 🍅の出現、誤り時の揺れ、進捗バーなど短いCSS演出の時間は維持
- 専用静的テストとChromium・WebKit共通E2Eで色と3秒時点の進行を固定
- 手動確認スクリプトの完了待ちを約41.4秒の新しい進行へ同期

固定成果物:

```text
src/tutorial.js
src/styles.css
scripts/tutorial.test.js
scripts/e2e.test.js
scripts/check-tut-end.js
scripts/shot-tutorial.js
```

## 8. 公開・実機の継続確認

実施記録の正本:

```text
docs/RELEASE_DEVICE_CHECK_v2.md
```

台帳とGitHub Pages自動公開処理は作成済みだが、Pagesの公開元設定、ブラウザ操作、実機確認、GitHub Pages反映確認は未実施である。

過去に接続確認済み（現在はSupabase登録削除・ゲート停止）:

- 実験場カード
- 詳細ランキング表示
- 本番RPCの初回・ベスト・プレイ回数

現在も自動確認する項目:

- Chromium・WebKitによるiPhone SE相当E2E
- 高速連続タップ、ランキング通信0件、練習準備中止、fallback

公開後の人間確認待ち:

- GitHub Pagesへの最新`main`反映
- iPhone 17 Proの表示・高速入力・練習84問
- iPhone 11 Pro
- iPad Pro縦横
- 低速回線
- 一時オフラインと次回練習の再試行
- 共有キャンセル
- ランキング再開時のSupabase再登録と実送信

## 9. 完成条件

- 現行ゲームと文書が一致
- 公式と練習が分離
- 補正タイムの小さい順
- テスト中はランキング通信0件
- 再開時は公式1プレイ1送信
- CI成功
- 主保証端末で操作不能なし
- 実験場へ接続し、停止中の詳細ランキング導線を隠す
- 可変サイズ契約が人間承認済み
- 候補バンクが独立検証済み
- 練習モード切替が人間承認済み

現時点では、84問完成バンク、ランダム練習先行接続、公式隔離、fallback、描写・高速入力・準備競合の補修、GitHub Pages自動公開処理まで実装済みです。残工程はPagesの公開元設定、GitHub Actionsの継続成功、GitHub Pages反映後の実機確認、Supabaseを再登録する時点でのランキング再開監査です。
