/**
 * トマトオク ブラウザE2E（Playwright）
 * iPhone SE相当で公式3問、補正タイム、ランキング送信、
 * モーダルフォーカス、ルール理由表示、練習モードを確認する。
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser } from "./launch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 8099;
const N = 5;
const OFFICIAL_IDS = ["T001", "T011", "T021"];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let requested = decodeURIComponent(req.url.split("?")[0]);
      if (requested === "/") requested = "/index.html";
      const file = path.join(ROOT, requested);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "text/plain",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function solveBoard(regionStrings) {
  const region = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      region[r * N + c] = regionStrings[r].charCodeAt(c) - 65;
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

    for (let c = 0; c < N; c++) {
      if (colUsed[c]) continue;
      const area = region[row * N + c];
      if (regionUsed[area]) continue;
      if (row > 0 && Math.abs(placed[row - 1] - c) < 2) continue;

      colUsed[c] = true;
      regionUsed[area] = true;
      placed[row] = c;
      visit(row + 1);
      colUsed[c] = false;
      regionUsed[area] = false;
    }
  }

  visit(0);
  return solutions;
}

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.log("  ✗ FAIL:", message);
  }
}

async function getRegions(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll("#board .cell")];
    const rows = [];
    for (let r = 0; r < 5; r++) {
      let value = "";
      for (let c = 0; c < 5; c++) {
        const match = cells[r * 5 + c].className.match(/area-([A-E])/);
        value += match ? match[1] : "?";
      }
      rows.push(value);
    }
    return rows;
  });
}

async function clickCell(page, r, c) {
  await page.evaluate(
    ([row, col]) => {
      document.querySelectorAll("#board .cell")[row * 5 + col].click();
    },
    [r, c]
  );
}

async function solveCurrentStage(page) {
  const solutions = solveBoard(await getRegions(page));
  ok(solutions.length === 1, `表示中盤面が一意解 (got ${solutions.length})`);
  for (let r = 0; r < N; r++) {
    await clickCell(page, r, solutions[0][r]);
  }
}

async function waitForPlaying(page) {
  await page.waitForSelector("#screen-game.active #board .cell", {
    timeout: 6000,
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#screen-game").classList.contains("active") &&
      !document.querySelector("#board .cell").disabled
  );
}

function assertOfficialIds(ids) {
  ok(
    JSON.stringify(ids) === JSON.stringify(OFFICIAL_IDS),
    `公式ID順序 ${JSON.stringify(ids)}`
  );
}

async function main() {
  const server = await startServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let rpcRequests = 0;
  let submitRequests = 0;

  await page.route("**/rest/v1/rpc/**", async (route) => {
    rpcRequests++;
    const url = route.request().url();
    if (url.endsWith("/submit_score")) {
      submitRequests++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            accepted: true,
            result_first_score: 4834,
            result_best_score: 4500,
            result_play_count: 2,
            is_first_play: false,
            is_new_best: true,
          },
        ]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

  ok(await page.isVisible("#screen-home"), "ホーム表示");
  ok(await page.isVisible("#start-official-btn"), "公式開始ボタン");
  ok(await page.isVisible("#start-practice-btn"), "練習開始ボタン");
  ok(
    (await page.textContent("#name-privacy")).includes("本名"),
    "個人情報を入力しない注意"
  );
  ok(
    (await page.getAttribute("#player-name", "aria-describedby")) === "name-privacy",
    "名前欄と保存説明を関連付け"
  );
  ok(
    (await page.getAttribute("#lab-link", "rel")).includes("noopener"),
    "外部リンクnoopener"
  );
  ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    "320pxで横スクロールなし"
  );

  await page.click("#howto-btn");
  await page.waitForSelector("#howto-modal.open");
  ok(
    await page.$eval(
      "#howto-modal .modal-close",
      (element) =>
        element.getBoundingClientRect().width >= 44 &&
        element.getBoundingClientRect().height >= 44
    ),
    "モーダル閉じる操作は44px以上"
  );
  ok(
    await page.evaluate(() =>
      document.querySelector("#howto-modal").contains(document.activeElement)
    ),
    "モーダル内へフォーカス移動"
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("#howto-modal").classList.contains("open")
  );
  await page.waitForFunction(() => document.activeElement?.id === "howto-btn");
  ok(true, "閉じた後に起点へフォーカス復帰");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click("#howto-btn");
  const animationDuration = await page.$eval(
    "#howto-modal .modal-card",
    (element) => getComputedStyle(element).animationDuration
  );
  ok(
    Number.parseFloat(animationDuration) <= 0.001,
    `動きを減らす設定 (${animationDuration})`
  );
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.click("#start-official-btn");
  ok((await page.textContent("#name-error")).length > 0, "名前必須");

  await page.fill("#player-name", "\u200B");
  await page.click("#start-official-btn");
  ok(
    (await page.textContent("#name-error")).includes("入力"),
    "不可視文字だけの名前を拒否"
  );

  await page.fill("#player-name", "テスター");
  await page.click("#start-official-btn");
  await page.waitForSelector("#screen-countdown.active");
  ok((await page.textContent("#countdown-value")).trim() === "3", "3から開始");
  ok((await page.textContent("#countdown-mode")).includes("公式"), "公式表示");
  ok(!(await page.isVisible("#screen-game")), "カウントダウン中は盤面非表示");

  await waitForPlaying(page);
  ok(
    await page.evaluate(
      () =>
        document.querySelector("#quit-btn").getBoundingClientRect().bottom <=
        window.innerHeight + 1
    ),
    "320×568の初期表示にホーム操作まで収まる"
  );

  const firstSolution = solveBoard(await getRegions(page))[0];
  const fastFirst = page.locator("#board .cell").nth(firstSolution[0]);
  const fastSecond = page
    .locator("#board .cell")
    .nth(N + firstSolution[1]);
  await fastFirst.tap();
  await page.waitForTimeout(80);
  await fastSecond.tap();
  ok(
    await page.evaluate(
      ([firstCol, secondCol]) => {
        const boardCells = document.querySelectorAll("#board .cell");
        return (
          boardCells[firstCol].classList.contains("filled") &&
          boardCells[5 + secondCol].classList.contains("filled")
        );
      },
      [firstSolution[0], firstSolution[1]]
    ),
    "100ms未満の連続タップを両方受け付ける"
  );
  await clickCell(page, 0, firstSolution[0]);
  await clickCell(page, 1, firstSolution[1]);

  await clickCell(page, 0, firstSolution[0]);
  const otherCol = firstSolution[0] === 0 ? 2 : 0;
  await clickCell(page, 0, otherCol);
  ok(
    (await page.textContent("#game-status")).includes("同じ行"),
    "誤タップ理由を表示"
  );
  await clickCell(page, 0, firstSolution[0]);

  const ids = [];
  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    ids.push(await page.getAttribute("#board", "data-stage-id"));
    ok(
      (await page.getAttribute("#board", "data-mode")) === "official",
      `ステージ${stageIndex + 1}は公式モード`
    );
    await solveCurrentStage(page);
    await page.waitForTimeout(1000);
  }
  assertOfficialIds(ids);

  await page.waitForSelector("#screen-result.active", { timeout: 5000 });
  ok((await page.textContent("#result-mode")).includes("公式"), "公式結果表示");
  ok(
    /^\d+\.\d{2}$/.test((await page.textContent("#result-score")).trim()),
    "補正タイム小数2桁"
  );
  ok(
    (await page.locator("#result-stage-times li").count()) === 3,
    "ステージ別時間3件"
  );
  ok(
    (await page.textContent("#submit-state")).includes("記録は保存されません"),
    "テスト中は記録を保存しない表示"
  );
  ok(!(await page.isVisible("#result-detail-ranking-link")), "停止中の詳細ランキングを隠す");
  ok(submitRequests === 0, "ランキング送信リクエストなし");
  ok(rpcRequests === 0, "ランキング取得リクエストなし");

  await page.click("#home-btn");
  await page.waitForSelector("#screen-home.active");

  let releasePracticeBank;
  await page.route("**/generated/variable-stage-bank-v2.json", async (route) => {
    await new Promise((resolve) => {
      releasePracticeBank = resolve;
    });
    await route.continue();
  });
  await page.click("#start-practice-btn");
  await page.waitForSelector("#start-preparing:not([hidden])");
  ok(
    await page.$eval("#howto-btn", (element) => element.disabled),
    "練習準備中は別操作を無効化"
  );
  for (let attempt = 0; attempt < 100 && !releasePracticeBank; attempt++) {
    await page.waitForTimeout(10);
  }
  ok(typeof releasePracticeBank === "function", "練習bank取得を遅延できる");
  await page.click("#cancel-start-btn");
  releasePracticeBank();
  await page.waitForFunction(() => document.querySelector("#start-preparing")?.hidden);
  await page.waitForTimeout(150);
  ok(await page.isVisible("#screen-home"), "練習準備を中止してホームを維持");
  ok(!(await page.isVisible("#screen-countdown")), "中止した古い要求は開始しない");
  await page.unroute("**/generated/variable-stage-bank-v2.json");

  await page.click("#start-practice-btn");
  await page.waitForSelector("#screen-countdown.active");
  ok((await page.textContent("#countdown-mode")).includes("ランダム"), "練習表示");
  await waitForPlaying(page);
  ok(
    (await page.getAttribute("#board", "data-mode")) === "practice",
    "練習データ属性"
  );

  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.click("#quit-btn");
  await page.waitForSelector("#screen-home.active");
  ok(await page.isVisible("#screen-home"), "練習からホームへ戻れる");
  ok(pageErrors.length === 0, `未捕捉エラーなし (${pageErrors.join("; ")})`);

  await browser.close();
  server.close();

  console.log(`\n==== E2E RESULT: PASS=${pass} FAIL=${fail} ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
