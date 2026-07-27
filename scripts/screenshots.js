import { launchBrowser } from "./launch.js";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.OUT || ROOT; // 出力先(既定: リポジトリ直下)
const PORT = 8097;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/plain" });
  fs.createReadStream(file).pipe(res);
});
const N = 5;
function solveBoard(rs){const region=[];for(let r=0;r<N;r++)for(let c=0;c<N;c++)region[r*N+c]=rs[r].charCodeAt(c)-65;const cu=Array(N).fill(false),ru=Array(N).fill(false),pl=[],sols=[];(function rec(row){if(row===N){sols.push(pl.slice());return;}for(let c=0;c<N;c++){if(cu[c])continue;const rg=region[row*N+c];if(ru[rg])continue;if(row>0&&Math.abs(pl[row-1]-c)<2)continue;cu[c]=ru[rg]=true;pl[row]=c;rec(row+1);cu[c]=ru[rg]=false;}})(0);return sols;}
await new Promise((r) => server.listen(PORT, r));
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(OUT, "shot-home.png") });
await page.fill("#player-name", "とまと太郎");
await page.click("#start-official-btn");
await page.waitForSelector("#screen-countdown.active");
await page.waitForSelector("#screen-game.active #board .cell:not([disabled])", {
  timeout: 6000,
});
// place a couple of correct tomatoes for a nicer shot
const regions = await page.evaluate(() => { const cells=[...document.querySelectorAll("#board .cell")]; const rows=[]; for(let r=0;r<5;r++){let s="";for(let c=0;c<5;c++){s+=cells[r*5+c].className.match(/area-([A-E])/)[1];}rows.push(s);}return rows; });
const sol = solveBoard(regions)[0];
for (const r of [0,2]) await page.evaluate(([r,c])=>document.querySelectorAll("#board .cell")[r*5+c].click(), [r, sol[r]]);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(OUT, "shot-game.png") });
// finish all stages
for (let s=0;s<3;s++){ const rg=await page.evaluate(()=>{const cells=[...document.querySelectorAll("#board .cell")];const rows=[];for(let r=0;r<5;r++){let x="";for(let c=0;c<5;c++)x+=cells[r*5+c].className.match(/area-([A-E])/)[1];rows.push(x);}return rows;}); const so=solveBoard(rg)[0]; for(let r=0;r<5;r++)await page.evaluate(([r,c])=>{const el=document.querySelectorAll("#board .cell")[r*5+c]; if(!el.classList.contains("filled")) el.click();},[r,so[r]]); await page.waitForTimeout(1000);}
await page.waitForSelector("#screen-result.active");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "shot-result.png") });
await browser.close();
server.close();
console.log("screenshots written to", OUT);
