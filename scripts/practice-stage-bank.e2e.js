import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch.js";
import {
  ACTIVE_PRACTICE_STAGE_BANK_ID,
  PRACTICE_STAGE_BANK_FEATURE,
} from "../src/stage-bank-config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8103;
const N = 5;
const competitionDraw = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "generated/balanced-official-draw-v1.json"),
    "utf8"
  )
);
const officialStageIds = competitionDraw.decks[0].slots[0].slice(0, 3);
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function startServer() {
  return new Promise((resolveServer) => {
    const server = http.createServer((request, response) => {
      let requested = decodeURIComponent(request.url.split("?")[0]);
      if (requested === "/") requested = "/index.html";
      const file = path.join(ROOT, requested);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "text/plain",
      });
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, () => resolveServer(server));
  });
}

function solveBoard(regionStrings) {
  const region = [];
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      region[row * N + col] = regionStrings[row].charCodeAt(col) - 65;
    }
  }
  const colUsed = Array(N).fill(false);
  const regionUsed = Array(N).fill(false);
  const placed = [];
  const solutions = [];

  function visit(row) {
    if (row === N) {
      solutions.push(placed.slice());
      return;
    }
    for (let col = 0; col < N; col++) {
      if (colUsed[col]) continue;
      const area = region[row * N + col];
      if (regionUsed[area]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - col) < 2) continue;
      colUsed[col] = true;
      regionUsed[area] = true;
      placed[row] = col;
      visit(row + 1);
      colUsed[col] = false;
      regionUsed[area] = false;
    }
  }

  visit(0);
  return solutions;
}

async function waitForPlaying(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#screen-game")?.classList.contains("active") &&
      document.querySelectorAll("#board .cell").length === 25 &&
      !document.querySelector("#board .cell")?.disabled,
    null,
    { timeout: 12000 }
  );
}

async function readRegions(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#board .cell")];
    const rows = [];
    for (let row = 0; row < 5; row++) {
      let value = "";
      for (let col = 0; col < 5; col++) {
        const match = cells[row * 5 + col].className.match(/area-([A-E])/);
        value += match ? match[1] : "?";
      }
      rows.push(value);
    }
    return rows;
  });
}

async function solveCurrentStage(page) {
  const solutions = solveBoard(await readRegions(page));
  if (solutions.length !== 1) {
    throw new Error(`displayed stage must have one solution; got ${solutions.length}`);
  }
  for (let row = 0; row < N; row++) {
    await page.evaluate(
      ([targetRow, targetCol]) => {
        document.querySelectorAll("#board .cell")[targetRow * 5 + targetCol].click();
      },
      [row, solutions[0][row]]
    );
  }
}

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${message}`);
  } else {
    fail++;
    console.log(`  ✗ ${message}`);
  }
}

async function createMobilePage(browser) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  return { context, page: await context.newPage() };
}

async function main() {
  const server = await startServer();
  const browser = await launchBrowser();

  try {
    {
      const { context, page } = await createMobilePage(browser);
      let finalBankRequests = 0;
      await page.route("**/generated/variable-stage-bank-v2.json", async (route) => {
        finalBankRequests++;
        await route.continue();
      });
      await page.route("**/functions/v1/tomatoku-competition", async (route) => {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            body.action === "prepare"
              ? {
                  accepted: true,
                  runToken: "practice-bank-e2e-run",
                }
              : { accepted: true, stageIds: officialStageIds }
          ),
        });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.fill("#player-name", "公式隔離");
      await page.click("#start-official-btn");
      await waitForPlaying(page);
      ok(
        /^STG-[0-9a-f]{8}$/.test(
          await page.getAttribute("#board", "data-stage-id")
        ),
        "公式は完成バンクから開始"
      );
      ok(
        (await page.getAttribute("#board", "data-stage-bank-id")) ===
          ACTIVE_PRACTICE_STAGE_BANK_ID,
        "公式と練習は同じ完成バンクを使う"
      );
      ok(finalBankRequests === 1, "公式開始時に完成バンクJSONを取得");
      await context.close();
    }

    {
      const { context, page } = await createMobilePage(browser);
      await page.route("**/generated/variable-stage-bank-v2.json", async (route) => {
        await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.fill("#player-name", "公式読込失敗");
      await page.click("#start-official-btn");
      await page.waitForFunction(
        () => document.querySelector("#name-error")?.textContent.includes("開始できません"),
        null,
        { timeout: 5000 }
      );
      ok(await page.isVisible("#screen-home"), "公式読込失敗時はホームを維持");
      ok(!(await page.isVisible("#screen-countdown")), "公式は別問題へ切り替えて開始しない");
      await context.close();
    }

    {
      const { context, page } = await createMobilePage(browser);
      let submitRequests = 0;
      await page.route("**/functions/v1/tomatoku-competition", async (route) => {
        submitRequests++;
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.fill("#player-name", "完成バンク");
      await page.click("#start-practice-btn");

      const seenIds = [];
      const seenDifficulties = [];
      const featureEnabled = PRACTICE_STAGE_BANK_FEATURE.enabled;
      for (let index = 0; index < 3; index++) {
        await waitForPlaying(page);
        seenIds.push(await page.getAttribute("#board", "data-stage-id"));
        seenDifficulties.push(
          Number(await page.getAttribute("#board", "data-difficulty"))
        );
        ok(
          (await page.getAttribute("#board", "data-stage-bank-id")) ===
            ACTIVE_PRACTICE_STAGE_BANK_ID,
          `練習ステージ${index + 1}はfeature gate選択bank`
        );
        ok(
          (await page.getAttribute("#board", "data-stage-bank-fallback")) ===
            String(!featureEnabled),
          `練習ステージ${index + 1}はfeature gateどおりのfallback状態`
        );
        await solveCurrentStage(page);
        if (index < 2) {
          await page.waitForFunction(
            (expected) => document.querySelector("#hud-stage")?.textContent === `${expected}/3`,
            index + 2,
            { timeout: 5000 }
          );
        }
      }

      await page.waitForFunction(
        () => document.querySelector("#screen-result")?.classList.contains("active"),
        null,
        { timeout: 5000 }
      );
      ok(
        seenIds.every((id) =>
          featureEnabled
            ? /^STG-[0-9a-f]{8}$/.test(id)
            : /^T\d{3}$/.test(id)
        ),
        featureEnabled ? "練習はSTG IDのみ" : "停止中の練習は旧T IDのみ"
      );
      ok(new Set(seenIds).size === 3, "練習3問のIDは重複なし");
      ok(JSON.stringify(seenDifficulties) === JSON.stringify([1, 2, 3]), "練習は難易度1→2→3");
      ok((await page.textContent("#result-mode")) === "ランダム練習", "結果はランダム練習表示");
      ok((await page.textContent("#submit-state")) === "ランダム練習はランキング対象外です", "練習はランキング対象外");
      ok(submitRequests === 0, "練習完了でランキング送信なし");
      await context.close();
    }

    {
      const { context, page } = await createMobilePage(browser);
      await page.route("**/generated/variable-stage-bank-v2.json", async (route) => {
        await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.fill("#player-name", "安全復帰");
      await page.click("#start-practice-btn");
      await waitForPlaying(page);
      ok(/^T\d{3}$/.test(await page.getAttribute("#board", "data-stage-id")), "読込失敗時は旧Tステージ");
      ok((await page.getAttribute("#board", "data-stage-bank-id")) === "legacy-v1", "読込失敗時はlegacy-v1");
      ok((await page.getAttribute("#board", "data-stage-bank-fallback")) === "true", "fallback状態を明示");
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  console.log(`\n==== PRACTICE FINAL BANK E2E: PASS=${pass} FAIL=${fail} ====`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
