import { launchBrowser } from "./launch.js";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.OUT || ROOT;
const PORT = 8094;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

// 遊び方モーダル
await page.click("#howto-btn");
await page.waitForSelector("#howto-modal.open");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "shot-howto.png") });
console.log("howto modal open:", await page.isVisible("#howto-modal.open"));
await page.click("#howto-modal .modal-close");
await page.waitForTimeout(200);

// チュートリアル: 開いて数フレーム撮る
await page.click("#tutorial-btn");
await page.waitForSelector("#tutorial-modal.open");
const caps = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(3200);
  const cap = await page.textContent("#tutorial-caption");
  const filled = await page.evaluate(() => document.querySelectorAll("#tutorial-board .tcell.filled").length);
  const bar = await page.evaluate(() => document.querySelector("#tutorial-bar").style.width);
  caps.push(`t=${(i+1)*3.2}s filled=${filled} bar=${bar} :: ${cap.replace(/\s+/g,' ').trim()}`);
  if (i === 3) await page.screenshot({ path: path.join(OUT, "shot-tutorial-mid.png") });
}
await page.waitForSelector(".tboard.tcleared", { timeout: 15000 });
await page.waitForFunction(
  () => document.querySelector("#tutorial-caption")?.textContent.includes("本番は"),
  undefined,
  { timeout: 7000 }
);
await page.screenshot({ path: path.join(OUT, "shot-tutorial-end.png") });
console.log(caps.join("\n"));
console.log("cleared board present:", await page.evaluate(() => !!document.querySelector(".tboard.tcleared")));
console.log("pageErrors:", errs.length ? errs : "none");
await browser.close();
server.close();
