import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const checklist = read("docs/RELEASE_DEVICE_CHECK_v2.md");
const plan = read("docs/IMPLEMENTATION_PLAN_v2.md");

assert.match(
  checklist,
  /prepared \/ ranking restored \/ repository setting and human execution pending/
);
assert.match(checklist, /同じ公開候補版で3回連続/);
assert.match(checklist, /iPhone 17 Pro \/ Safari/);
assert.match(checklist, /iPhone 11 Pro \/ Safari/);
assert.match(checklist, /iPad Pro 2018 \/ Safari/);
assert.match(checklist, /30分連続プレイ/);
assert.match(checklist, /10回以上繰り返せる/);
assert.match(checklist, /バックグラウンド移動と復帰を10回/);
assert.match(checklist, /低速、切断、再接続、送信失敗/);
assert.ok(checklist.includes("candidate-v2-variable-4-6-final"));
assert.ok(checklist.includes("legacy-v1"));
assert.ok(checklist.includes("submissionsEnabled=true"));
assert.ok(checklist.includes("rankingsEnabled=true"));
assert.match(checklist, /公式1プレイでの二重送信/);
assert.ok(checklist.includes("PRACTICE_STAGE_BANK_FEATURE.enabled=false"));
assert.match(checklist, /WebGL \/ WebGPU描画機能消失試験: `対象外`/);
assert.match(
  checklist,
  /ブラウザ操作、実機試験、GitHub Pages公開操作を実施しない/
);
assert.match(checklist, /公開確認完了 \| \*\*未承認\*\*/);
assert.doesNotMatch(checklist, /- \[x\]/i);

assert.match(
  plan,
  /### 3-8\. 現行文書の整合[\s\S]*?状態: \*\*completed\*\*/
);
assert.match(plan, /### 7-7\. 現行文書の整合（completed）/);
assert.match(
  plan,
  /### 7-8\. 公開・実機確認台帳（implemented \/ human execution pending）/
);
assert.ok(plan.includes("docs/RELEASE_DEVICE_CHECK_v2.md"));
assert.doesNotMatch(plan, /現行文書の整合（implemented \/ PR review pending）/);

console.log("✓ 公開・実機確認台帳は端末・復帰・通信・連続合格契約を保持");
