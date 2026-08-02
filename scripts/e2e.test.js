/**
 * トマトオク ブラウザE2E（Playwright）
 * iPhone SE相当で公式ランダム3問、補正タイム、ランキング送信、
 * モーダルフォーカス、ルール理由表示、練習モードを確認する。
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchBrowser } from "./launch.js";
import { validateTranscript } from "../supabase/functions/tomatoku-competition/validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 8099;
const N = 5;
const finalBank = JSON.parse(
  fs.readFileSync(path.join(ROOT, "generated/variable-stage-bank-v2.json"), "utf8")
);
const competitionDraw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "generated/balanced-official-draw-v1.json"), "utf8")
);
const officialStageIds = competitionDraw.decks[0].slots[0].slice(0, 3);
const officialStages = officialStageIds.map((stageId) =>
  finalBank.stages.find((stage) => stage.id === stageId)
);

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
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__lastShareData = data;
      },
    });
  });
  let rpcRequests = 0;
  let competitionRequests = 0;
  let submitRequests = 0;

  await page.route("**/rest/v1/rpc/**", async (route) => {
    rpcRequests++;
    const url = route.request().url();
    const body = route.request().postDataJSON();
    ok(
      body.p_game_slug === "tomatoku_competition_v1",
      "ランキング取得は新世代slugだけを使う"
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route("**/functions/v1/tomatoku-competition", async (route) => {
    competitionRequests++;
    const body = route.request().postDataJSON();
    let responseBody;
    if (body.action === "prepare") {
      responseBody = {
        accepted: true,
        runToken: "e2e-server-run",
      };
    } else if (body.action === "begin") {
      responseBody = { accepted: true, stageIds: officialStageIds };
    } else if (body.action === "finish") {
      submitRequests++;
      const verified = validateTranscript({
        stages: officialStages,
        transcript: body.transcript,
        elapsedMs: body.elapsedMs,
      });
      ok(verified.accepted === true, "操作記録をサーバー規則で再現");
      responseBody = {
        accepted: true,
        score: verified.score,
        result_first_score: verified.score,
        result_best_score: verified.score,
        result_play_count: 1,
        is_first_play: true,
        is_new_best: true,
      };
    } else {
      await route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });

  ok(await page.isVisible("#screen-home"), "ホーム表示");
  ok(await page.isVisible("#start-official-btn"), "公式開始ボタン");
  ok(await page.isVisible("#start-practice-btn"), "練習開始ボタン");
  ok(
    await page.evaluate(() => !document.body.innerText.includes("84")),
    "利用者向け画面に問題群の総数を表示しない"
  );
  ok(
    (await page.textContent("#name-privacy")).includes("本名"),
    "個人情報を入力しない注意"
  );
  ok(
    (await page.textContent("#name-privacy")).includes("操作記録"),
    "公式で送る操作記録を開始前に説明"
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
  ok(
    (await page.getAttribute("#sound-toggle", "aria-checked")) === "false" &&
      (await page.textContent("#sound-toggle-label")).trim() === "なし",
    "効果音は初回なし"
  );
  await page.click("#sound-toggle");
  ok(
    (await page.getAttribute("#sound-toggle", "aria-checked")) === "true" &&
      (await page.textContent("#sound-toggle-label")).trim() === "あり",
    "効果音を任意でありに変更"
  );
  ok(
    (await page.evaluate(() => localStorage.getItem("tomatoku.soundEnabled"))) ===
      "true",
    "効果音の選択を端末へ保存"
  );
  await page.click("#sound-toggle");
  ok(
    (await page.getAttribute("#sound-toggle", "aria-checked")) === "false",
    "効果音をなしへ戻せる"
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
  await page.waitForFunction(() =>
    document
      .querySelector("#howto-modal")
      .contains(document.activeElement)
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

  await page.click("#tutorial-btn");
  await page.waitForSelector("#tutorial-modal.open");
  const tutorialAreas = await page.$$eval("#tutorial-board .tcell", (cells) => {
    const labels = ["A", "B", "C", "D"];
    return {
      cellCount: cells.length,
      areaCounts: Object.fromEntries(
        labels.map((label) => [
          label,
          cells.filter((cell) => cell.classList.contains(`area-${label}`)).length,
        ])
      ),
      areaColors: labels.map((label) => {
        const cell = cells.find((candidate) =>
          candidate.classList.contains(`area-${label}`)
        );
        return getComputedStyle(cell).backgroundColor;
      }),
    };
  });
  ok(tutorialAreas.cellCount === 16, "チュートリアルは16マス");
  ok(
    Object.values(tutorialAreas.areaCounts).every((count) => count === 4),
    `チュートリアルはA〜D各4マス (${JSON.stringify(tutorialAreas.areaCounts)})`
  );
  ok(
    new Set(tutorialAreas.areaColors).size === 4,
    `チュートリアルの4エリアを別の色で表示 (${tutorialAreas.areaColors.join(", ")})`
  );
  const tutorialMarkerLayout = await page.$eval(
    "#tutorial-board .tcell",
    (cell) => {
      cell.classList.add("filled", "mark-ok");
      const tomato = cell.querySelector(".tomato");
      const marker = cell.querySelector(".tmark");
      const tomatoRect = tomato.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const result = {
        markerFontSize: Number.parseFloat(getComputedStyle(marker).fontSize),
        tomatoFontSize: Number.parseFloat(getComputedStyle(cell).fontSize),
        centerDifferenceX: Math.abs(
          markerRect.left + markerRect.width / 2 -
            (tomatoRect.left + tomatoRect.width / 2)
        ),
        centerDifferenceY: Math.abs(
          markerRect.top + markerRect.height / 2 -
            (tomatoRect.top + tomatoRect.height / 2)
        ),
        okContent: getComputedStyle(marker, "::after").content,
      };
      cell.classList.remove("mark-ok");
      cell.classList.add("mark-bad");
      result.badContent = getComputedStyle(marker, "::after").content;
      cell.classList.remove("filled", "mark-bad");
      return result;
    }
  );
  ok(
    tutorialMarkerLayout.markerFontSize >= tutorialMarkerLayout.tomatoFontSize,
    "チュートリアルの✓／✗はトマト以上の大きさ"
  );
  ok(
    tutorialMarkerLayout.centerDifferenceX <= 2 &&
      tutorialMarkerLayout.centerDifferenceY <= 2,
    "チュートリアルの✓／✗をトマト中央に重ねる"
  );
  ok(tutorialMarkerLayout.okContent.includes("✓"), "正解は✓で表示");
  ok(tutorialMarkerLayout.badContent.includes("✗"), "不正解は✗で表示");
  await page.waitForTimeout(3000);
  ok(
    (await page.textContent("#tutorial-caption")).includes("4×4"),
    "0.5倍速では3秒後も導入説明を表示"
  );
  ok(
    (await page.locator("#tutorial-board .tcell.filled").count()) === 0,
    "0.5倍速では3秒後も最初のトマトを置かない"
  );
  ok(
    (await page.$eval("#tutorial-bar", (element) => element.style.width)) === "0%",
    "0.5倍速では3秒後の進捗は0%"
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("#tutorial-modal").classList.contains("open")
  );

  await page.click("#start-official-btn");
  ok((await page.textContent("#name-error")).length > 0, "名前必須");

  await page.fill("#player-name", "\u200B");
  await page.click("#start-official-btn");
  ok(
    (await page.textContent("#name-error")).includes("入力"),
    "不可視文字だけの名前を拒否"
  );

  await page.fill("#player-name", "テスター");

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

  await page.click("#start-official-btn");
  await page.waitForSelector("#screen-countdown.active");
  ok((await page.textContent("#countdown-value")).trim() === "3", "3から開始");
  const countdownNumberFontSize = await page.$eval(
    "#countdown-value",
    (element) => Number.parseFloat(getComputedStyle(element).fontSize)
  );
  ok((await page.textContent("#countdown-mode")).includes("公式"), "公式表示");
  ok(!(await page.isVisible("#screen-game")), "カウントダウン中は盤面非表示");

  await page.waitForFunction(
    () => document.querySelector("#countdown-value")?.textContent.trim() === "スタート"
  );
  const countdownStartLayout = await page.$eval("#countdown-value", (element) => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    fits: element.scrollWidth <= element.clientWidth,
    hasLabelClass: element.classList.contains("is-start-label"),
  }));
  ok(countdownStartLayout.hasLabelClass, "スタート専用の文字サイズを適用");
  ok(countdownStartLayout.fontSize < countdownNumberFontSize, "スタートを円内に合う大きさへ調整");
  ok(countdownStartLayout.fits, "スタートの4文字が円からはみ出さない");

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
  const difficulties = [];
  for (let stageIndex = 0; stageIndex < 3; stageIndex++) {
    ids.push(await page.getAttribute("#board", "data-stage-id"));
    difficulties.push(
      Number(await page.getAttribute("#board", "data-difficulty"))
    );
    ok(
      (await page.getAttribute("#board", "data-mode")) === "official",
      `ステージ${stageIndex + 1}は公式モード`
    );
    await solveCurrentStage(page);
    if (stageIndex < 2) {
      await page.waitForFunction(
        (nextStageNumber) => {
          const board = document.querySelector("#board");
          const firstCell = board?.querySelector(".cell");
          return (
            document.querySelector("#hud-stage")?.textContent ===
              `${nextStageNumber}/3` &&
            document.querySelector("#screen-game")?.classList.contains("active") &&
            firstCell &&
            !firstCell.disabled
          );
        },
        stageIndex + 2,
        { timeout: 6000 }
      );
    }
  }
  ok(ids.every((id) => /^STG-[0-9a-f]{8}$/.test(id)), "公式は完成バンクから出題");
  ok(new Set(ids).size === 3, "公式3問のIDは重複なし");
  ok(
    JSON.stringify(difficulties) === JSON.stringify([1, 2, 3]),
    "公式は難易度1→2→3"
  );
  ok(
    (await page.getAttribute("#board", "data-stage-bank-fallback")) === "false",
    "公式は別問題へのfallbackなし"
  );

  await page.waitForSelector("#screen-result.active", { timeout: 5000 });
  ok((await page.textContent("#result-mode")).includes("公式"), "公式結果表示");
  ok(
    /^\d+\.\d{2}$/.test((await page.textContent("#result-score")).trim()),
    "補正タイム小数2桁"
  );
  ok(
    /^\d+:\d{2}\.\d$/.test((await page.textContent("#result-time")).trim()),
    "結果画面には実時間を残す"
  );
  ok(
    (await page.locator("#result-stage-times li").count()) === 3,
    "ステージ別時間3件"
  );
  await page.waitForFunction(() =>
    document.querySelector("#submit-state")?.textContent.includes("ランキングへ登録しました")
  );
  ok(
    (await page.textContent("#submit-state")).includes("ベスト "),
    "公式結果のランキング登録表示"
  );
  ok(await page.isVisible("#result-detail-ranking-link"), "詳細ランキングを表示");
  ok(submitRequests === 1, "公式1プレイの送信リクエスト1件");
  ok(competitionRequests === 3, "公式prepare・begin・finishの3件");
  ok(rpcRequests === 2, "ホーム取得・結果取得の2件");

  await page.click("#result-share-btn");
  await page.waitForFunction(() => Boolean(window.__lastShareData?.text));
  const resultShareText = await page.evaluate(
    () => window.__lastShareData.text
  );
  const resultShareLines = resultShareText.split("\n");
  ok(resultShareLines.length === 3, "公式結果のシェア文は3行");
  ok(
    /^トマトオク 公式モードで補正タイム\d+\.\d{2}秒！$/.test(
      resultShareLines[0]
    ),
    "公式結果の補正タイム末尾は全角！"
  );
  ok(
    /^誤タップ\d+ \/ ヒント\d+$/.test(resultShareLines[1]),
    "公式結果のシェア文は誤タップとヒントを表示"
  );
  ok(!resultShareText.includes("実時間"), "公式結果のシェア文に実時間を含めない");
  ok(
    resultShareLines[2] === `http://localhost:${PORT}/`,
    "公式結果のシェア文末尾にゲームURL"
  );

  await page.click("#home-btn");
  await page.waitForSelector("#screen-home.active");

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
