import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TUTORIAL_PLAYBACK_RATE,
  tutorialDelayMs,
} from "../src/tutorial.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8");

assert.equal(TUTORIAL_PLAYBACK_RATE, 0.5);
assert.equal(tutorialDelayMs(2200), 4400);
assert.equal(tutorialDelayMs(900), 1800);

for (const label of ["A", "B", "C", "D"]) {
  const variable = label.toLowerCase();
  const selector = new RegExp(
    `\\.cell\\.area-${label},\\s*\\.tcell\\.area-${label}\\s*\\{\\s*--cell-fill:\\s*var\\(--area-${variable}\\);\\s*\\}`
  );
  assert.match(styles, selector);
}

assert.match(styles, /\.tcell \.tmark\s*\{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%/);
assert.match(styles, /font-size:\s*clamp\(2\.1rem,\s*12vw,\s*2\.85rem\)/);
assert.match(styles, /translate\(-50%,\s*-50%\)\s*scale\(1\)/);

console.log("✓ チュートリアルは4エリアを色分けし、説明を0.5倍速で進める");
