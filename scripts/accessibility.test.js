import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const css = fs.readFileSync(path.join(root, "src/accessibility.css"), "utf8");
const js = fs.readFileSync(path.join(root, "src/accessibility.js"), "utf8");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const tutorial = fs.readFileSync(path.join(root, "src/tutorial.js"), "utf8");

assert.match(html, /id="name-privacy"/);
assert.match(html, /本名・メールアドレス・電話番号は入力しない/);
assert.match(html, /aria-describedby="name-privacy"/);
assert.match(html, /id="game-status"[\s\S]*role="status"/);
assert.match(html, /id="board"[\s\S]*role="grid"/);
assert.match(html, /src="\.\/src\/accessibility\.js"/);
assert.match(html, /href="\.\/src\/accessibility\.css"/);
assert.match(html, /aria-labelledby="howto-title"/);
assert.match(html, /aria-labelledby="tutorial-title"/);
assert.match(html, /role="progressbar"/);
assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 4);

assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /max-width:\s*380px/);
assert.match(css, /grid-template-columns:\s*repeat\(2/);
assert.match(css, /forced-colors:\s*active/);
assert.match(styles, /\.card \.btn\.ghost/);
const modalCloseSize = styles.match(
  /\.modal-close\s*\{[\s\S]*?width:\s*(\d+)px;[\s\S]*?height:\s*(\d+)px;/
);
assert.ok(modalCloseSize);
assert.ok(Number(modalCloseSize[1]) >= 44);
assert.ok(Number(modalCloseSize[2]) >= 44);
assert.match(styles, /\.cell\.edge-top\s*\{\s*border-top:\s*4px/);

assert.match(js, /MutationObserver/);
assert.match(js, /event\.key !== "Tab"/);
assert.match(js, /previousFocusByModal/);
assert.match(js, /ArrowRight/);
assert.match(js, /同じ行には/);
assert.match(js, /新しいタブで開きます/);

assert.doesNotMatch(tutorial, /高スコア/);
assert.match(tutorial, /補正タイムを短く/);
assert.match(tutorial, /const total = 8/);
assert.doesNotMatch(main, /addEventListener\(\s*"touchend"/);

console.log("==== ACCESSIBILITY TEST RESULT: PASS ====");
