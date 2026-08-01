# ランダム練習先行接続・ロールバック契約（履歴）

> この文書は、完成バンクを練習だけへ先行接続した当時の履歴であり、現在の実装契約ではない。現行仕様は`docs/VARIABLE_STAGE_FINAL_BANK.md`、`docs/SPEC_v2.md`、`docs/REQUIREMENTS_v2.md`を参照する。

- 対象: `chameleonjp-lab/tomatooku`
- 対象モード: ランダム練習のみ
- 練習バンク: `candidate-v2-variable-4-6-final`
- fallbackバンク: `legacy-v1`
- 状態: superseded / historical record
- 更新日: 2026-07-21

## 1. 目的

承認済み84問完成バンクをランダム練習へ接続し、公式3問・公式ランキングを変更せずに問題バリエーションを拡張する。

接続障害やデータ不整合が発生してもプレイヤーを進行不能にせず、旧30問バンクへ自動復帰できる構造を必須とする。

## 2. バンク分離

```text
公式モード
  ACTIVE_STAGE_BANK_ID = legacy-v1
  T001 / T011 / T021
  ランキング対象

ランダム練習
  ACTIVE_PRACTICE_STAGE_BANK_ID
  = candidate-v2-variable-4-6-final
  84問から難易度1→2→3を選出
  ランキング対象外

練習fallback
  legacy-v1
  旧30問から難易度1→2→3を選出
  ランキング対象外
```

公式モードと練習モードは、active bank ID、取得処理、ランキング契約を分離する。

## 3. Feature gate

```js
export const PRACTICE_STAGE_BANK_FEATURE = Object.freeze({
  enabled: true,
  primaryBankId: "candidate-v2-variable-4-6-final",
  fallbackBankId: "legacy-v1",
});
```

通常運用では`enabled: true`とする。

緊急停止は次の1行だけを変更する。

```diff
- enabled: true,
+ enabled: false,
```

無効化時は完成バンクJSONを取得せず、旧30問を使用する。

## 4. Loader契約

実装:

```text
src/practice-stage-bank.js
```

取得先:

```text
generated/variable-stage-bank-v2.json
```

取得オプション:

```js
fetch(url, { cache: "no-store", signal })
```

完成バンクpayloadに対して次を検証する。

- object形式
- IDが`candidate-v2-variable-4-6-final`
- statusが`active-practice-only`
- `runtimeEnabled === true`
- `rankingEligible === false`
- `stageCount === 84`
- `stages.length === 84`
- Stage Schema v2全件合格
- ID重複なし
- D4 canonical重複なし
- 一意解

## 5. 自動fallback

次の場合は例外を画面へ伝播させず、`legacy-v1`へ戻す。

```text
feature-disabled
fetch-unavailable
http-error
invalid-bank
network-error
timeout
```

fallback結果:

```js
{
  bankId: "legacy-v1",
  stages: STAGES,
  fallback: true,
  fallbackReason: "..."
}
```

プレイヤーには「従来の練習問題で開始します」と通知する。

fallbackでもランダム練習のランキング対象外契約を維持する。

読み込みは8秒で時間切れとし、開始ボタンが無期限に停止しないようにする。一時的なHTTP・通信・検証・時間切れfallbackはページ内へ固定せず、次の練習開始時に完成バンクを再取得する。完成バンクの取得成功と`feature-disabled`だけはページ内で再利用する。

## 6. 読み込みタイミング

完成バンクJSONはランダム練習開始時だけ遅延取得する。

公式モード開始時:

- 完成バンクJSONを取得しない
- `T001`から開始
- `stageBankId = legacy-v1`

ランダム練習開始時:

1. 開始ボタンを一時無効化
2. 「練習問題を準備中…」を表示
3. 完成バンクを取得・検証
4. 成功時は84問bankを注入
5. 失敗時は旧30問を注入
6. カウントダウン開始

## 7. GameSession注入契約

`GameSession`は練習モードに限って次を受け取る。

```text
practiceStageBank
practiceStageBankId
practiceStageBankFallback
```

公式モードでは、これらが渡されても無視して固定3問を選ぶ。

盤面DOMへ次を記録する。

```text
data-stage-bank-id
data-stage-bank-fallback
```

用途:

- E2E検証
- 実機調査
- fallback発生確認
- バンク経路の監査

## 8. 練習問題の選出

完成バンク84問の内訳:

```text
難易度1    28問
難易度2    28問
難易度3    28問
```

1プレイでは次の順に3問を出す。

```text
1問目    難易度1
2問目    難易度2
3問目    難易度3
```

同一プレイ内で次を禁止する。

- Stage ID重複
- 正解配置重複

旧30問fallbackでも同じ選出契約を維持する。

## 9. ランキング隔離

ランダム練習は、完成バンク利用時もfallback時もランキング対象外とする。

結果画面:

```text
ランダム練習はランキング対象外です
```

禁止事項:

- `submit_score` RPC送信
- 公式ランキングへの練習結果混入
- 完成バンクdescriptorの`rankingEligible=true`
- 練習モードを公式モードとして偽装

## 10. 再プレイ

結果画面の「もう一度」では、直前と同じモードで開始する。

- 公式再プレイ: 固定3問
- 練習再プレイ: 練習loader経由

ページ内では有効な練習bank取得結果を再利用する。ただし、一時fallbackは再利用せず、次の練習開始時に再試行する。ページ再読み込み後は、成功済みの完成bankも再取得・再検証する。

## 11. 自動テスト

### 静的契約

```bash
npm run test:practice-stage-bank
```

確認内容:

- 公式active IDと練習active IDの分離
- feature gate有効・無効のactive ID解決
- 1行のgate無効化後も契約テストが成立
- 完成bank payload検証
- 完成84問の取得成功
- feature gate無効時にfetchしない
- HTTP失敗・不正bank・通信例外・時間切れのfallback
- 一時fallback後の再試行と成功bankの再利用
- 注入した練習セッションが難易度1→2→3
- 公式セッションが注入bankを無視
- 練習bankがruntime有効・ranking無効

### iPhone SE相当E2E

```bash
npm run e2e:practice-bank
```

`320×568`で次を確認する。

1. 公式開始
   - `T001`
   - `legacy-v1`
   - 完成bank JSONリクエスト0件

2. 練習成功
   - `STG-xxxxxxxx`を3問
   - 完成bank ID
   - fallbackなし
   - 難易度1→2→3
   - 3問クリア
   - ランキング対象外表示
   - `submit_score`リクエスト0件

3. 練習取得失敗
   - 503を強制
   - `Txxx`へfallback
   - `legacy-v1`
   - fallback属性true

## 12. ロールバック手順

### 即時論理ロールバック

`PRACTICE_STAGE_BANK_FEATURE.enabled`を`false`にする。

影響:

- 公式: 変更なし
- 練習: 旧30問へ戻る
- ランキング: 変更なし
- 完成manifest: リポジトリには保持

この1行変更だけで静的テストとE2Eの期待値もfallback側へ切り替わる。緊急停止のためにテストファイルを同時編集しない。

### コードロールバック

本接続PRをrevertする。

削除・復元対象:

```text
src/practice-stage-bank.js
src/game.jsの練習bank注入
src/main.jsの遅延loader
src/stage-bank-config.jsの練習routing
scripts/practice-stage-bank.test.js
scripts/practice-stage-bank.e2e.js
```

完成バンクmanifest、レビューJSON、生成器は削除しなくてよい。

## 13. 実機確認

マージ・公開後に次を確認する。

- iPhone SE相当幅で練習開始
- iPhone 17 Proで3問クリア
- 可変4〜6マス境界の視認性
- 難易度1→2→3
- 再プレイ
- オフライン・低速回線時fallback
- 公式3問がT001/T011/T021のまま
- 公式ランキング送信が正常
- 練習結果がランキングへ送られない

## 14. 完了条件

- CI全成功
- 公式E2E成功
- 練習完成bank E2E成功
- fallback E2E成功
- ランキング隔離E2E成功
- feature gate停止手順が文書化済み
- GitHub Pages反映後の実機確認完了
