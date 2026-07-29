# 可変エリア84問 完成バンク

- 対象リポジトリ: `chameleonjp-lab/tomatooku`
- 完成バンクID: `candidate-v2-variable-4-6-final`
- manifest: `generated/variable-stage-bank-v2.json`
- Stage Schema: v2
- Bank Schema: v1
- 状態: active for random practice only / release pending
- 更新日: 2026-07-20

## 1. 目的

可変エリア4〜6マスの候補108問と、承認済みレビュー第1巡の判断から固定した84問を、ランダム練習だけで使用する。

公式3問と公式ランキングの経路は`legacy-v1`へ固定したまま分離する。

```text
ACTIVE_STAGE_BANK_ID = legacy-v1
ACTIVE_PRACTICE_STAGE_BANK_ID = candidate-v2-variable-4-6-final
final.runtimeEnabled = true
final.rankingEligible = false
```

本バンクのruntime有効化はランダム練習だけを意味し、ランキング対象化を意味しない。

## 2. 生成元

### 候補プール

```text
generated/variable-stage-candidate-pool-v2.json
```

- raw候補: 185問
- レビュー対象: 108問
- generator version: `2.6.0-variable-pool.1`

### 承認済みレビュー

```text
review/decisions/variable-stage-review-round1.json
```

- keep: 84問
- reject: 24問
- hold: 0問
- 未判断: 0問

完成バンク生成器は`keep`だけを採用し、`reject`を含めない。

manifestには候補プールとレビューJSONのSHA-256を記録する。生成元が1 byteでも変化した場合、再生成manifestにも差分が発生する。

## 3. 完成バンク契約

```json
{
  "schemaVersion": 1,
  "id": "candidate-v2-variable-4-6-final",
  "status": "active-practice-only",
  "runtimeEnabled": true,
  "rankingEligible": false,
  "stageSchemaVersion": 2,
  "generatorVersion": "2.8.0-variable-final-bank.2",
  "stageCount": 84,
  "rejectedStageCount": 24
}
```

必須条件:

- Stage Schema v2へ全件合格
- 84問ちょうど
- レビュー`keep`のID集合と完全一致
- ID重複なし
- D4 canonical重複なし
- 各盤面が一意解
- runtimeは練習専用で有効
- rankingは無効
- 出典SHA-256を保持
- 決定論的再生成

## 4. 分布

### 対称クラス

```text
SC-95390462    34問
SC-be359992    33問
SC-3a178cba    17問
```

希少クラス`SC-3a178cba`は候補17問をすべて維持する。

### 難易度

```text
難易度1    28問
難易度2    28問
難易度3    28問
```

1プレイでは難易度1→2→3の順で3問を選出する。

### エリアサイズ構成

```text
4-4-5-6-6    61問
4-5-5-5-6    23問
```

## 5. 構造距離

完成バンクの最小構造距離は1である。

距離1関係は、希少対称クラスを全件維持するために明示承認した9組だけである。

```text
STG-0385e52f / STG-8e3e7a46
STG-07455e25 / STG-c551c232
STG-246317db / STG-8e3e7a46
STG-75e7cc16 / STG-bda38a0d
STG-75e7cc16 / STG-ee9efd5b
STG-8c4df48e / STG-ba446d6d
STG-8e3e7a46 / STG-e48d77b6
STG-a6649fc6 / STG-edb742a5
STG-bb3d9d29 / STG-ee9efd5b
```

共通2クラスには距離1の同時採用を残さない。

## 6. 生成コマンド

```bash
npm run gen:v2:variable-final-bank
```

実装:

```text
scripts/generator-v2/variable-final-bank.js
scripts/generate_variable_stage_bank_v2.js
```

生成先:

```text
generated/variable-stage-bank-v2.json
```

## 7. 検証

```bash
npm run test:variable-stage-final-bank
npm run test:practice-stage-bank
```

検証内容:

- レビューkeep 84問とのID完全一致
- 完成バンク専用status
- runtime練習専用有効・ranking無効
- 候補プールSHA-256
- レビューJSON SHA-256
- Stage Schema v2独立validator
- 分布fixture
- 距離1例外9組
- metadata完全性
- bank catalog登録
- 再生成結果のJSON完全一致
- 公式active bankとの分離
- feature gateと旧30問fallback

CIでは次も行う。

```bash
npm run gen:v2:variable-final-bank
git diff --exit-code -- generated/variable-stage-bank-v2.json
npm run e2e:practice-bank
```

## 8. Bank Catalog

```text
candidate-v2-variable-4-6-final.status
= active-practice-only

candidate-v2-variable-4-6-final.runtimeEnabled
= true

candidate-v2-variable-4-6-final.rankingEligible
= false
```

公式用`ACTIVE_STAGE_BANK_ID`は`legacy-v1`のままとする。

練習用`ACTIVE_PRACTICE_STAGE_BANK_ID`だけを完成バンクへ向ける。

## 9. Runtime loader

実装:

```text
src/practice-stage-bank.js
```

ランダム練習開始時だけmanifestを遅延取得し、ID・status・stageCount・Stage Schema v2を検証する。

公式開始時はmanifestを取得しない。

取得または検証に失敗した場合は`legacy-v1`の旧30問へ自動fallbackする。

## 10. Feature gate

```js
PRACTICE_STAGE_BANK_FEATURE.enabled = true
```

緊急停止時は`false`へ変更する。無効時は完成バンクJSONを取得せず、旧30問へ即時復帰する。

詳細:

```text
docs/PRACTICE_STAGE_BANK_ROLLOUT.md
```

## 11. 保持する不変条件

- 公式`T001 / T011 / T021`
- 公式ランキング契約
- 公式1プレイ1送信
- 練習ランキング送信なし
- `src/stages.js`の旧30問
- 補正タイム
- Supabase設定
- 旧30問へのfallback経路

## 12. 公開後確認

PRマージ・GitHub Pages反映後に次を確認する。

- iPhone 17 Proで練習3問クリア
- 可変4〜6マス境界の視認性
- 難易度1→2→3
- 練習再プレイ
- 低速回線・オフライン時fallback
- 公式3問が従来どおり
- 公式ランキング送信が正常
- 練習結果がランキングへ送信されない

接続の自動テストは完了している。残工程は公開後の実機確認である。
