/**
 * トマトオク チュートリアル（4×4の自動アニメ）
 *
 * 本番は5×5だが、4×4の小さな盤面でルールと操作を順番に見せて覚えてもらう。
 * 依存ライブラリなし。CSSトランジションとJSのステップエンジンで動かす。
 *
 * ルール（本番と同じ）:
 * 各行・各列・各エリアに🍅は1個、上下左右斜めで隣接禁止。
 */

import { playCorrectSound, playIncorrectSound } from "./sound.js";

const T = 4;
const REGIONS = ["AABB", "AABB", "CCDD", "CCDD"];
export const TUTORIAL_PLAYBACK_RATE = 0.5;
const SOLUTION = [
  [0, 1],
  [1, 3],
  [2, 0],
  [3, 2],
];

let cells = [];
let runId = 0;
let built = false;

function el(selector) {
  return document.querySelector(selector);
}

function buildBoard() {
  const board = el("#tutorial-board");
  board.innerHTML = "";
  cells = [];

  for (let r = 0; r < T; r++) {
    cells[r] = [];
    for (let c = 0; c < T; c++) {
      const cell = document.createElement("div");
      cell.className = `tcell area-${REGIONS[r][c]}`;

      const tomato = document.createElement("span");
      tomato.className = "tomato";
      tomato.textContent = "🍅";
      cell.appendChild(tomato);

      const mark = document.createElement("span");
      mark.className = "tmark";
      cell.appendChild(mark);

      board.appendChild(cell);
      cells[r][c] = cell;
    }
  }

  built = true;
}

function resetBoard() {
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      cells[r][c].classList.remove(
        "filled",
        "ghost-bad",
        "hl",
        "hl-soft",
        "adj",
        "mark-ok",
        "mark-bad"
      );
    }
  }
  el("#tutorial-board").classList.remove("tcleared");
}

function setCaption(html) {
  el("#tutorial-caption").innerHTML = html;
}

function setProgress(progress) {
  el("#tutorial-bar").style.width = `${Math.round(progress * 100)}%`;
}

export function tutorialDelayMs(baseMs) {
  return baseMs / TUTORIAL_PLAYBACK_RATE;
}

function delay(ms, myRun) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (myRun !== runId) reject(new Error("cancelled"));
      else resolve();
    }, tutorialDelayMs(ms));
  });
}

function place(r, c, mark) {
  cells[r][c].classList.add("filled");
  if (mark === "ok") {
    cells[r][c].classList.add("mark-ok");
    playCorrectSound();
  }
}

function ghostBad(r, c) {
  cells[r][c].classList.add("ghost-bad", "mark-bad");
  playIncorrectSound();
}

function clearGhost(r, c) {
  cells[r][c].classList.remove("ghost-bad", "mark-bad");
}

function highlightRow(r) {
  for (let c = 0; c < T; c++) cells[r][c].classList.add("hl-soft");
}

function highlightCol(c) {
  for (let r = 0; r < T; r++) cells[r][c].classList.add("hl-soft");
}

function highlightRegion(letter) {
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      if (REGIONS[r][c] === letter) cells[r][c].classList.add("hl-soft");
    }
  }
}

function markAdjacency(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= T || nc < 0 || nc >= T) continue;
      cells[nr][nc].classList.add("adj");
    }
  }
}

function clearHighlights() {
  for (let r = 0; r < T; r++) {
    for (let c = 0; c < T; c++) {
      cells[r][c].classList.remove("hl-soft", "adj");
    }
  }
}

async function sequence(myRun) {
  const total = 8;
  let step = 0;
  const tick = () => setProgress(++step / total);

  resetBoard();
  setProgress(0);

  setCaption("4×4で<b>あそびかた</b>を覚えよう。🍅をルール通りにならべるよ");
  await delay(2200, myRun);
  tick();

  setCaption("マスをタップすると🍅を<b>置ける</b>よ");
  place(0, 1);
  await delay(2000, myRun);
  tick();

  setCaption("ルール① <b>同じ行（よこ）</b>に🍅は1個だけ");
  highlightRow(0);
  await delay(1100, myRun);
  ghostBad(0, 3);
  await delay(1600, myRun);
  clearGhost(0, 3);
  clearHighlights();
  tick();

  setCaption("ルール② <b>同じ列（たて）</b>にも1個だけ");
  highlightCol(1);
  await delay(1100, myRun);
  ghostBad(3, 1);
  await delay(1600, myRun);
  clearGhost(3, 1);
  clearHighlights();
  tick();

  setCaption("ルール③ <b>同じ色のエリア</b>にも1個だけ");
  highlightRegion("A");
  await delay(1100, myRun);
  ghostBad(1, 0);
  await delay(1600, myRun);
  clearGhost(1, 0);
  clearHighlights();
  tick();

  setCaption("ルール④ <b>ななめ・となり</b>は隣り合えない");
  markAdjacency(0, 1);
  await delay(1100, myRun);
  ghostBad(1, 0);
  ghostBad(1, 2);
  await delay(1700, myRun);
  clearGhost(1, 0);
  clearGhost(1, 2);
  clearHighlights();
  tick();

  setCaption("ルールを守って残りを置いていくよ…");
  await delay(900, myRun);
  place(1, 3, "ok");
  await delay(900, myRun);
  place(2, 0, "ok");
  await delay(900, myRun);
  place(3, 2, "ok");
  await delay(700, myRun);
  tick();

  setCaption("🎉 <b>クリア!</b> 全部のルールを満たせたよ");
  el("#tutorial-board").classList.add("tcleared");
  await delay(2200, myRun);
  tick();

  setCaption(
    "本番は<b>5×5・3ステージ</b>。誤タップとヒントを抑えて、補正タイムを短くしよう!"
  );
  setProgress(1);
}

export function playTutorial() {
  if (!built) buildBoard();
  const myRun = ++runId;
  sequence(myRun).catch(() => {
    // モーダル終了・再生し直しによるキャンセル。
  });
}

export function stopTutorial() {
  runId++;
}
