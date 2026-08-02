/**
 * トマトオク 画面制御
 *
 * home → countdown → playing → stageTransition → result を明示管理し、
 * 非同期処理はplayId照合で古いプレイから隔離する。
 */

import {
  GameSession,
  GAME_MODE,
  formatTime,
  formatCentiseconds,
  monotonicNow,
  N,
} from "./game.js";
import {
  submitScore,
  prepareOfficialRun,
  beginOfficialRun,
  fetchBestRanking,
  resetSubmission,
  isConfigured,
  isRankingEnabled,
  isSubmissionEnabled,
  normalizeDisplayName,
} from "./ranking.js";
import { playTutorial, stopTutorial } from "./tutorial.js";
import { createRandomStageBankLoader } from "./practice-stage-bank.js";
import {
  isSoundEnabled,
  isSoundSupported,
  playCorrectSound,
  playIncorrectSound,
  setSoundEnabled,
  unlockSound,
} from "./sound.js";

const PLAYER_KEY = "tomatoku.playerName";
const GAME_URL = "https://chameleonjp-lab.github.io/tomatooku/";
const COUNTDOWN_STEPS = [
  { label: "3", durationMs: 650 },
  { label: "2", durationMs: 650 },
  { label: "1", durationMs: 650 },
  { label: "スタート", durationMs: 420 },
];

const PHASE = Object.freeze({
  HOME: "home",
  PREPARING: "preparing",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
  STAGE_TRANSITION: "stageTransition",
  RESULT: "result",
  RETIRED: "retired",
});

const $ = (selector) => document.querySelector(selector);

let phase = PHASE.HOME;
let session = null;
let pendingPlay = null;
let activePlayId = null;
let cells = [];
let timerRafId = null;
let countdownRafId = null;
let countdownTimerIds = [];
let transitionTimerId = null;
let toastTimerId = null;
let lastHudPaintAt = 0;
const ensureRandomStageBank = createRandomStageBankLoader();
let startInFlight = false;
let startRequestId = 0;
let officialSubmissionPromise = null;
const rankingRequestIds = new Map();

function gameUrl() {
  try {
    const current = location.origin + location.pathname;
    return current.startsWith("http") ? current : GAME_URL;
  } catch (_) {
    return GAME_URL;
  }
}

function modeLabel(mode) {
  return mode === GAME_MODE.OFFICIAL ? "公式モード" : "ランダム練習";
}

function phaseScreenId(nextPhase) {
  if (
    nextPhase === PHASE.HOME ||
    nextPhase === PHASE.PREPARING ||
    nextPhase === PHASE.RETIRED
  ) {
    return "screen-home";
  }
  if (nextPhase === PHASE.COUNTDOWN) return "screen-countdown";
  if (
    nextPhase === PHASE.PLAYING ||
    nextPhase === PHASE.STAGE_TRANSITION
  ) {
    return "screen-game";
  }
  if (nextPhase === PHASE.RESULT) return "screen-result";
  return "screen-home";
}

function setPhase(nextPhase) {
  phase = nextPhase;
  const activeId = phaseScreenId(nextPhase);
  document.querySelectorAll(".screen").forEach((screen) => {
    const active = screen.id === activeId;
    screen.classList.toggle("active", active);
    screen.setAttribute("aria-hidden", String(!active));
  });

  const board = $("#board");
  if (board) {
    board.setAttribute(
      "aria-busy",
      nextPhase === PHASE.STAGE_TRANSITION ? "true" : "false"
    );
  }
  updateHintButton();
  window.scrollTo(0, 0);
}

function isActivePlay(playId) {
  return Boolean(
    playId &&
      activePlayId === playId &&
      (session?.playId === playId || pendingPlay?.playId === playId)
  );
}

function createPendingPlayId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_KEY) || "";
  } catch (_) {
    return "";
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_KEY, name);
  } catch (_) {
    // 保存不可でも続行する。
  }
}

function syncRankingAvailability() {
  const enabled = isRankingEnabled();
  document.querySelectorAll("[data-ranking-only]").forEach((element) => {
    element.hidden = !enabled;
  });

  const badge = $("#release-badge");
  if (badge) {
    badge.textContent = enabled ? "ランキング公開中" : "テスト版・記録なし";
  }
}

function syncSoundControl() {
  const button = $("#sound-toggle");
  const label = $("#sound-toggle-label");
  const icon = $("#sound-toggle-icon");
  if (!button || !label || !icon) return;

  const supported = isSoundSupported();
  const enabled = supported && isSoundEnabled();
  button.disabled = !supported;
  button.setAttribute("aria-checked", String(enabled));
  button.setAttribute(
    "aria-label",
    supported
      ? `効果音を${enabled ? "なし" : "あり"}にする`
      : "この端末では効果音を利用できません"
  );
  label.textContent = supported ? (enabled ? "あり" : "なし") : "非対応";
  icon.textContent = enabled ? "🔊" : "🔇";
}

function setHomePreparing(preparing, message = "問題を準備しています…") {
  const home = $("#screen-home");
  const card = $("#home-card");
  const panel = $("#start-preparing");
  const text = $("#start-preparing-text");
  home?.classList.toggle("is-preparing", preparing);
  card?.setAttribute("aria-busy", String(preparing));
  if (panel) panel.hidden = !preparing;
  if (text) text.textContent = message;

  document
    .querySelectorAll("#screen-home button, #screen-home input")
    .forEach((control) => {
      control.disabled = preparing && control.id !== "cancel-start-btn";
    });
  const cancel = $("#cancel-start-btn");
  if (cancel) cancel.disabled = !preparing;
}

function cancelPendingStart(message = "") {
  if (!startInFlight) return false;
  startRequestId++;
  startInFlight = false;
  setHomePreparing(false);
  if (phase === PHASE.PREPARING) setPhase(PHASE.HOME);
  if (message) {
    const error = $("#name-error");
    if (error) error.textContent = message;
  }
  return true;
}

function initHome() {
  const input = $("#player-name");
  input.value = loadPlayerName();
  syncSoundControl();

  $("#sound-toggle").addEventListener("click", () => {
    const enabled = setSoundEnabled(!isSoundEnabled());
    syncSoundControl();
    if (enabled) playCorrectSound();
  });

  $("#start-official-btn").addEventListener("click", () => {
    void onStart(GAME_MODE.OFFICIAL);
  });
  $("#start-practice-btn").addEventListener("click", () => {
    void onStart(GAME_MODE.PRACTICE);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      void onStart(GAME_MODE.OFFICIAL);
    }
  });

  $("#home-share-btn").addEventListener("click", () => {
    shareText(`「トマトオク」5×5に🍅を置くパズル!\n${gameUrl()}`);
  });
  $("#howto-btn").addEventListener("click", () => openModal("howto-modal"));
  $("#tutorial-btn").addEventListener("click", openTutorial);
  $("#howto-to-tutorial").addEventListener("click", () => {
    closeModal("howto-modal");
    openTutorial();
  });
  $("#tutorial-replay").addEventListener("click", () => {
    unlockSound();
    playTutorial();
  });
  $("#countdown-cancel-btn").addEventListener("click", () => {
    cancelActivePlay({ goHome: true });
  });
  $("#cancel-start-btn").addEventListener("click", () => {
    cancelPendingStart("準備を中止しました。もう一度開始してください。");
  });

  initModals();
  syncRankingAvailability();
  loadRankingInto("#home-ranking");
}

function openModal(id) {
  if (startInFlight) return;
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  if (id === "tutorial-modal") stopTutorial();
}

function openTutorial() {
  unlockSound();
  openModal("tutorial-modal");
  playTutorial();
}

function initModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal(modal.id));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal.open").forEach((modal) => {
      closeModal(modal.id);
    });
  });
}

async function startNamedGame(name, mode) {
  if (startInFlight) return;
  const requestId = ++startRequestId;
  startInFlight = true;
  const error = $("#name-error");
  setHomePreparing(
    true,
    mode === GAME_MODE.PRACTICE
      ? "練習問題を準備しています…"
      : "公式問題を準備しています…"
  );
  setPhase(PHASE.PREPARING);

  try {
    const randomBank = await ensureRandomStageBank();
    if (mode === GAME_MODE.OFFICIAL && randomBank.fallback) {
      throw new Error("公式用の問題を読み込めませんでした");
    }
    const officialRun =
      mode === GAME_MODE.OFFICIAL
        ? await prepareOfficialRun({ playerName: name })
        : null;
    if (mode === GAME_MODE.OFFICIAL && officialRun?.status !== "ok") {
      throw new Error("公式プレイ番号を発行できませんでした");
    }

    if (
      requestId !== startRequestId ||
      !startInFlight ||
      phase !== PHASE.PREPARING ||
      document.hidden
    ) {
      return;
    }

    startInFlight = false;
    setHomePreparing(false);
    if (error) error.textContent = "";
    beginCountdown(name, mode, randomBank, officialRun);
    if (mode === GAME_MODE.PRACTICE && randomBank.fallback) {
      setTimeout(() => showToast("従来の練習問題で開始します"), 0);
    }
  } catch (startError) {
    if (requestId !== startRequestId) return;
    startInFlight = false;
    setHomePreparing(false);
    setPhase(PHASE.HOME);
    if (error) {
      error.textContent =
        "ゲームを開始できませんでした。通信を確認してもう一度お試しください。";
    }
    console.error(startError);
  }
}

async function onStart(mode) {
  unlockSound();
  const input = $("#player-name");
  const name = normalizeDisplayName(input.value);
  const error = $("#name-error");
  input.value = name;

  if (!name) {
    error.textContent = "プレイヤー名を入力してください";
    input.focus();
    return;
  }

  error.textContent = "";
  savePlayerName(name);
  await startNamedGame(name, mode);
}

function clearCountdownWork() {
  countdownTimerIds.forEach((id) => clearTimeout(id));
  countdownTimerIds = [];
  if (countdownRafId != null) {
    cancelAnimationFrame(countdownRafId);
    countdownRafId = null;
  }
}

function clearTransitionWork() {
  if (transitionTimerId != null) {
    clearTimeout(transitionTimerId);
    transitionTimerId = null;
  }
}

function stopTimer() {
  if (timerRafId != null) {
    cancelAnimationFrame(timerRafId);
    timerRafId = null;
  }
  lastHudPaintAt = 0;
}

function clearAsyncWork() {
  clearCountdownWork();
  clearTransitionWork();
  stopTimer();

  if (toastTimerId != null) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
  const toast = $("#toast");
  if (toast) toast.classList.remove("show");
}

function cancelActivePlay({ goHome = true } = {}) {
  if (startInFlight) {
    startRequestId++;
    startInFlight = false;
    setHomePreparing(false);
  }
  clearAsyncWork();
  if (session) session.retire();

  activePlayId = null;
  session = null;
  pendingPlay = null;
  officialSubmissionPromise = null;
  cells = [];

  const board = $("#board");
  if (board) {
    board.className = "board";
    board.innerHTML = "";
    delete board.dataset.stageId;
    delete board.dataset.difficulty;
    delete board.dataset.mode;
    delete board.dataset.stageBankId;
    delete board.dataset.stageBankFallback;
  }

  if (goHome) {
    setPhase(PHASE.RETIRED);
    $("#player-name").value = loadPlayerName();
    setPhase(PHASE.HOME);
    loadRankingInto("#home-ranking");
  }
}

function beginCountdown(name, mode, randomBank = null, officialRun = null) {
  cancelActivePlay({ goHome: false });
  resetSubmission();

  if (mode === GAME_MODE.OFFICIAL) {
    const playId = createPendingPlayId();
    pendingPlay = {
      playId,
      name,
      mode,
      randomBank,
      runToken: officialRun?.runToken,
    };
    activePlayId = playId;
  } else {
    session = new GameSession(name, Math.random, {
      mode,
      stageBank: randomBank?.stages,
      stageBankId: randomBank?.bankId,
      stageBankFallback: randomBank?.fallback,
      competitionSets: randomBank?.competitionSets,
    });
    activePlayId = session.playId;
  }
  const playId = activePlayId;

  $("#countdown-mode").textContent = modeLabel(mode);
  setPhase(PHASE.COUNTDOWN);
  runCountdown(playId);
}

function runCountdown(playId) {
  clearCountdownWork();
  let index = 0;
  const value = $("#countdown-value");

  const showNext = () => {
    if (!isActivePlay(playId) || phase !== PHASE.COUNTDOWN) return;

    const step = COUNTDOWN_STEPS[index];
    if (!step) {
      prepareFirstStage(playId);
      return;
    }

    value.textContent = step.label;
    value.classList.toggle("is-start-label", step.label === "スタート");
    index++;
    const timerId = setTimeout(showNext, step.durationMs);
    countdownTimerIds.push(timerId);
  };

  showNext();
}

function prepareFirstStage(playId) {
  clearCountdownWork();
  if (!isActivePlay(playId) || phase !== PHASE.COUNTDOWN) return;

  const pendingOfficial = pendingPlay?.playId === playId ? pendingPlay : null;
  if (!pendingOfficial) {
    buildBoard();
    renderBoard();
    updateHud(monotonicNow());
  }
  setPhase(PHASE.STAGE_TRANSITION);

  countdownRafId = requestAnimationFrame(async () => {
    countdownRafId = null;
    if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;

    if (pendingOfficial) {
      setGameStatus("公式プレイを確認しています…");
      const begun = await beginOfficialRun({ runToken: pendingOfficial.runToken });
      if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;
      if (begun.status !== "ok") {
        cancelActivePlay({ goHome: true });
        const error = $("#name-error");
        if (error) {
          error.textContent =
            "公式モードを開始できませんでした。通信を確認してもう一度お試しください。";
        }
        return;
      }
      session = new GameSession(pendingOfficial.name, Math.random, {
        playId,
        mode: pendingOfficial.mode,
        stageBank: pendingOfficial.randomBank?.stages,
        stageBankId: pendingOfficial.randomBank?.bankId,
        stageBankFallback: pendingOfficial.randomBank?.fallback,
        competitionSets: pendingOfficial.randomBank?.competitionSets,
        officialStageIds: begun.stageIds,
        runToken: pendingOfficial.runToken,
      });
      pendingPlay = null;
      buildBoard();
      renderBoard();
      updateHud(monotonicNow());
    }

    startPlayingAfterBoardPaint(playId);
  });
}

function startPlayingAfterBoardPaint(playId) {
  // 2フレーム待ち、DOM更新だけでなく実paintも競技タイムから除外する。
  countdownRafId = requestAnimationFrame(() => {
    countdownRafId = requestAnimationFrame(() => {
      countdownRafId = null;
      if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION || !session) {
        return;
      }
      session.startStage(monotonicNow());
      setPhase(PHASE.PLAYING);
      setBoardInputEnabled(true);
      updateHud(monotonicNow());
      startTimer(playId);
    });
  });
}

function setGameStatus(message, tone = "info") {
  const status = $("#game-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function buildBoard() {
  if (!session) return;

  const board = $("#board");
  board.className = "board";
  board.innerHTML = "";
  board.dataset.stageId = session.current.stage.id;
  board.dataset.difficulty = String(session.current.stage.difficulty);
  board.dataset.mode = session.mode;
  board.dataset.stageBankId = session.stageBankId;
  board.dataset.stageBankFallback = String(session.stageBankFallback);
  setGameStatus("マスを選んで🍅を置いてください。");
  cells = [];

  const state = session.current;
  for (let r = 0; r < N; r++) {
    cells[r] = [];
    for (let c = 0; c < N; c++) {
      const cell = document.createElement("button");
      cell.type = "button";

      const area = state.stage.regions[r][c];
      const regions = state.stage.regions;
      cell.className = `cell area-${area}`;
      if (r === 0 || regions[r - 1][c] !== area) cell.classList.add("edge-top");
      if (r === N - 1 || regions[r + 1][c] !== area) cell.classList.add("edge-bottom");
      if (c === 0 || regions[r][c - 1] !== area) cell.classList.add("edge-left");
      if (c === N - 1 || regions[r][c + 1] !== area) cell.classList.add("edge-right");

      cell.setAttribute("aria-label", `${r + 1}行${c + 1}列 エリア${area}`);
      const tomato = document.createElement("span");
      tomato.className = "tomato";
      tomato.textContent = "🍅";
      tomato.setAttribute("aria-hidden", "true");
      cell.appendChild(tomato);

      cell.addEventListener("click", () => onCellTap(r, c));
      board.appendChild(cell);
      cells[r][c] = cell;
    }
  }
}

function renderBoard() {
  if (!session) return;
  const state = session.current;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const filled = state.has(r, c);
      cells[r][c].classList.toggle("filled", filled);
      cells[r][c].setAttribute("aria-pressed", String(filled));
      cells[r][c].disabled = phase !== PHASE.PLAYING;
    }
  }
}

function setBoardInputEnabled(enabled) {
  cells.flat().forEach((cell) => {
    if (cell) cell.disabled = !enabled;
  });
}

function onCellTap(r, c) {
  if (phase !== PHASE.PLAYING || !session) return;

  const tappedAt = monotonicNow();
  session.recordTap(r, c, tappedAt);
  const state = session.current;
  const result = state.tap(r, c);
  const cell = cells[r][c];

  if (result.type === "mistake") {
    session.recordMistake();
    playIncorrectSound();
    flashMistake(cell);
    updateHud(monotonicNow());
    return;
  }

  cell.classList.remove("hinted");
  renderBoard();
  updateHud(monotonicNow());

  if (result.type === "place" && state.cleared) {
    onStageClear(tappedAt);
  } else if (result.type === "place") {
    playCorrectSound();
  }
}

function flashMistake(cell) {
  cell.classList.remove("mistake");
  void cell.offsetWidth;
  cell.classList.add("mistake");
  setTimeout(() => cell.classList.remove("mistake"), 360);
  vibrate(30);
}

function onHint() {
  if (phase !== PHASE.PLAYING || !session) return;

  const state = session.current;
  if (!state.canHint()) return;

  const hintedAt = monotonicNow();
  session.recordHintAction(hintedAt);
  const result = state.applyHint();
  session.recordHint();
  renderBoard();
  updateHud(monotonicNow());

  if (result && result.placed) {
    const [r, c] = result.placed;
    cells[r][c].classList.add("hinted");
    const removedCount = result.removed?.length || 0;
    const removedText = removedCount
      ? `誤った🍅を${removedCount}個取り除き、`
      : "";
    setGameStatus(
      `ヒントで${removedText}${r + 1}行${c + 1}列に🍅を置きました（+30秒）。`,
      "success"
    );
  } else {
    setGameStatus("ヒントを使いました（+30秒）。", "success");
  }

  updateHintButton();
  if (state.cleared) onStageClear(hintedAt);
}

function updateHintButton() {
  const button = $("#hint-btn");
  if (!button) return;

  const canUse =
    phase === PHASE.PLAYING &&
    session &&
    session.current &&
    session.current.canHint();
  button.disabled = !canUse;
}

function onStageClear(clearedAt = monotonicNow()) {
  if (phase !== PHASE.PLAYING || !session) return;

  const playId = session.playId;
  session.finishStage(clearedAt);
  const lastStage = session.isLastStage();
  if (lastStage && session.mode === GAME_MODE.OFFICIAL) {
    officialSubmissionPromise = submitScore({
      playId,
      mode: session.mode,
      runToken: session.runToken,
      transcript: session.transcript(),
      elapsedMs: Math.floor(session.accumulatedMs),
    });
  }
  playCorrectSound();
  setPhase(PHASE.STAGE_TRANSITION);
  setBoardInputEnabled(false);
  stopTimer();
  updateHud(monotonicNow());

  $("#board").classList.add("cleared");
  setGameStatus(
    session.isLastStage()
      ? "全3ステージをクリアしました！"
      : `ステージ${session.stageNumber}をクリアしました！`,
    "success"
  );
  vibrate([20, 40, 30]);

  showToast(lastStage ? "全ステージクリア!" : "ステージクリア!");

  clearTransitionWork();
  transitionTimerId = setTimeout(() => {
    transitionTimerId = null;
    if (!isActivePlay(playId) || phase !== PHASE.STAGE_TRANSITION) return;

    $("#board").classList.remove("cleared");
    const finished = session.advance(monotonicNow());
    if (finished) {
      goToResult(playId);
      return;
    }

    buildBoard();
    renderBoard();
    updateHud(monotonicNow());

    startPlayingAfterBoardPaint(playId);
  }, 850);
}

function updateHud(now = monotonicNow()) {
  if (!session) return;

  $("#hud-mode").textContent = modeLabel(session.mode);
  $("#hud-stage").textContent = `${session.stageNumber}/${session.totalStages}`;
  $("#hud-time").textContent = formatTime(session.elapsedMs(now));
  $("#hud-adjusted").textContent = formatCentiseconds(session.adjustedTime(now));
  $("#hud-mistakes").textContent = String(session.mistakeCount);
  $("#hud-hints").textContent = String(session.hintCount);
  updateHintButton();
}

function startTimer(playId) {
  stopTimer();

  const tick = (frameTime) => {
    if (!isActivePlay(playId) || phase !== PHASE.PLAYING || !session) {
      timerRafId = null;
      return;
    }

    if (frameTime - lastHudPaintAt >= 80) {
      lastHudPaintAt = frameTime;
      updateHud(monotonicNow());
    }
    timerRafId = requestAnimationFrame(tick);
  };

  timerRafId = requestAnimationFrame(tick);
}

function renderStageTimes(completedSession) {
  const list = $("#result-stage-times");
  list.innerHTML = completedSession.stageTimesMs
    .map((time, index) => {
      const mistakes = completedSession.stageMistakeCounts[index] || 0;
      const hints = completedSession.stageHintCounts[index] || 0;
      return `<li>ステージ${index + 1}: ${formatTime(time)} / 誤${mistakes} / ヒント${hints}</li>`;
    })
    .join("");
}

function goToResult(playId) {
  if (!isActivePlay(playId) || !session) return;

  clearAsyncWork();
  const completedSession = session;
  const breakdown = completedSession.resultBreakdown(monotonicNow());
  const adjusted = breakdown.adjustedTimeCentiseconds;

  $("#result-score").textContent = formatCentiseconds(adjusted);
  $("#result-mode").textContent = modeLabel(completedSession.mode);
  $("#result-time").textContent = formatTime(breakdown.elapsedMs);
  $("#result-mistakes").textContent = String(breakdown.mistakeCount);
  $("#result-hints").textContent = String(breakdown.hintCount);
  $("#result-mistake-penalty").textContent = `+${formatCentiseconds(breakdown.mistakePenaltyCentiseconds)}秒`;
  $("#result-hint-penalty").textContent = `+${formatCentiseconds(breakdown.hintPenaltyCentiseconds)}秒`;
  $("#result-stages").textContent = `${completedSession.totalStages}/${completedSession.totalStages}`;
  renderStageTimes(completedSession);

  setPhase(PHASE.RESULT);

  const stateElement = $("#submit-state");
  if (completedSession.mode === GAME_MODE.PRACTICE) {
    stateElement.className = "submit-state skipped";
    stateElement.textContent = "ランダム練習はランキング対象外です";
  } else if (!isSubmissionEnabled()) {
    stateElement.className = "submit-state skipped";
    stateElement.textContent = "テスト中のため、今回の記録は保存されません";
  } else {
    stateElement.className = "submit-state pending";
    stateElement.textContent = "公式ランキングへ送信中…";
  }

  const submissionPromise =
    completedSession.mode === GAME_MODE.OFFICIAL
      ? officialSubmissionPromise
      : submitScore({ playId, mode: completedSession.mode });
  Promise.resolve(
    submissionPromise ||
      submitScore({
        playId,
        mode: completedSession.mode,
        runToken: completedSession.runToken,
        transcript: completedSession.transcript(),
        elapsedMs: Math.floor(breakdown.elapsedMs),
      })
  ).then((result) => {
    if (
      !isActivePlay(playId) ||
      session !== completedSession ||
      phase !== PHASE.RESULT
    ) {
      return;
    }

    if (
      result.status === "ok" &&
      result.score != null &&
      result.score !== adjusted
    ) {
      applySubmitResult(
        stateElement,
        {
          status: "error",
          message: "記録の確認結果が画面表示と一致しませんでした",
        }
      );
      return;
    }
    applySubmitResult(stateElement, result);
    if (isRankingEnabled()) loadRankingInto("#result-ranking");
  });

  const shareMessage =
    `トマトオク ${modeLabel(completedSession.mode)}で補正タイム${formatCentiseconds(adjusted)}秒！` +
    `\n誤タップ${breakdown.mistakeCount} / ヒント${breakdown.hintCount}` +
    `\n${gameUrl()}`;
  $("#result-share-btn").onclick = () => shareText(shareMessage);
}

function applySubmitResult(stateElement, result) {
  if (result.status === "ok") {
    stateElement.className = "submit-state ok";
    const parts = [result.message];
    if (result.bestScore != null) {
      parts.push(`ベスト ${formatCentiseconds(result.bestScore)}秒`);
    }
    if (result.firstScore != null) {
      parts.push(`初回 ${formatCentiseconds(result.firstScore)}秒`);
    }
    stateElement.textContent = parts.join(" / ");
    return;
  }

  stateElement.className =
    result.status === "error" ? "submit-state error" : "submit-state skipped";
  stateElement.textContent = result.message;
}

async function loadRankingInto(selector) {
  const box = $(selector);
  if (!box) return;

  if (!isRankingEnabled()) {
    box.innerHTML = `<div class="rank-empty">テスト中のためランキングを停止しています</div>`;
    return;
  }

  if (!isConfigured()) {
    box.innerHTML = `<div class="rank-empty">ランキングは未設定です</div>`;
    return;
  }

  box.innerHTML = `<div class="rank-empty">読み込み中…</div>`;
  const requestId = (rankingRequestIds.get(selector) || 0) + 1;
  rankingRequestIds.set(selector, requestId);
  const result = await fetchBestRanking(10);
  if (rankingRequestIds.get(selector) !== requestId) return;

  if (result.status === "error") {
    box.innerHTML = `<div class="rank-empty">公式ランキングは公開準備中です</div>`;
    return;
  }
  if (result.status === "not_configured") {
    box.innerHTML = `<div class="rank-empty">ランキングは未設定です</div>`;
    return;
  }
  if (result.status === "empty") {
    box.innerHTML = `<div class="rank-empty">まだランキングがありません</div>`;
    return;
  }

  box.innerHTML = result.rows
    .map((row) => {
      const first =
        row.firstScore != null
          ? `<span class="first">初回 ${formatCentiseconds(row.firstScore)}秒</span>`
          : "";
      return `
        <div class="rank-row">
          <span class="pos">${escapeHtml(row.rank)}</span>
          <span class="name">${escapeHtml(row.playerName)}${first}</span>
          <span class="sc">${formatCentiseconds(row.bestScore)}秒</span>
        </div>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function shareText(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text, title: "トマトオク" });
      return;
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("シェア文をコピーしました");
  } catch (_) {
    showToast("シェア文をコピーできませんでした");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimerId != null) clearTimeout(toastTimerId);
  toastTimerId = setTimeout(() => {
    toast.classList.remove("show");
    toastTimerId = null;
  }, 1200);
}

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {
    // 非対応端末は無視する。
  }
}

function initGameControls() {
  $("#hint-btn").addEventListener("click", onHint);
  $("#quit-btn").addEventListener("click", () => {
    if (confirm("ホームに戻りますか?(現在のプレイは記録されません)")) {
      cancelActivePlay({ goHome: true });
    }
  });
}

function initResultControls() {
  $("#again-btn").addEventListener("click", () => {
    unlockSound();
    const name = (session && session.playerName) || loadPlayerName();
    const mode = (session && session.mode) || GAME_MODE.OFFICIAL;
    void startNamedGame(name, mode);
  });

  $("#home-btn").addEventListener("click", () => {
    cancelActivePlay({ goHome: true });
  });
}

function boot() {
  try {
    initHome();
    initGameControls();
    initResultControls();
    setHomePreparing(false);
    setPhase(PHASE.HOME);
  } catch (error) {
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.textContent = "初期化に失敗しました。ページを再読み込みしてください。";
    document.body.prepend(banner);
    console.error(error);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && startInFlight) {
    cancelPendingStart(
      "画面が隠れたため準備を中止しました。もう一度開始してください。"
    );
  }
});

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".board")) event.preventDefault();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
