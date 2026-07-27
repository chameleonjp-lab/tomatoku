/**
 * トマトオク UIアクセシビリティ補助。
 *
 * ゲームロジックには介入せず、フォーカス管理、読み上げ通知、
 * 外部リンク説明、ルール違反理由の表示だけを担当する。
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const previousFocusByModal = new WeakMap();

function focusableElements(modal) {
  return [...modal.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    return !element.hasAttribute("hidden") && element.getClientRects().length > 0;
  });
}

function openModalA11y(modal) {
  previousFocusByModal.set(modal, document.activeElement);
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    if (!modal.classList.contains("open")) return;
    const focusables = focusableElements(modal);
    const target = focusables[0] || modal.querySelector(".modal-card");
    target?.focus({ preventScroll: true });
  });
}

function closeModalA11y(modal) {
  if (!document.querySelector(".modal.open")) {
    document.body.classList.remove("modal-open");
  }

  const previous = previousFocusByModal.get(modal);
  previousFocusByModal.delete(modal);
  if (previous instanceof HTMLElement && previous.isConnected) {
    requestAnimationFrame(() => previous.focus({ preventScroll: true }));
  }
}

function trapModalFocus(modal, event) {
  if (event.key !== "Tab" || !modal.classList.contains("open")) return;

  const focusables = focusableElements(modal);
  if (!focusables.length) {
    event.preventDefault();
    modal.querySelector(".modal-card")?.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const current = document.activeElement;

  if (event.shiftKey && (current === first || !modal.contains(current))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}

function initModalAccessibility() {
  document.querySelectorAll(".modal").forEach((modal) => {
    let wasOpen = modal.classList.contains("open");

    modal.addEventListener("keydown", (event) => trapModalFocus(modal, event));

    const observer = new MutationObserver(() => {
      const isOpen = modal.classList.contains("open");
      if (isOpen === wasOpen) return;
      wasOpen = isOpen;
      if (isOpen) openModalA11y(modal);
      else closeModalA11y(modal);
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "aria-hidden"],
    });
  });
}

function cellPosition(board, cell) {
  const cells = [...board.querySelectorAll(".cell")];
  const index = cells.indexOf(cell);
  if (index < 0) return null;
  return { row: Math.floor(index / 5), col: index % 5, cells };
}

function inferMistakeReason(board, cell) {
  const position = cellPosition(board, cell);
  if (!position) return "そのマスには置けません。";

  const { row, col, cells } = position;
  const filled = cells
    .map((candidate, index) => ({
      candidate,
      row: Math.floor(index / 5),
      col: index % 5,
      area: [...candidate.classList].find((name) => name.startsWith("area-")),
    }))
    .filter(({ candidate }) => candidate.getAttribute("aria-pressed") === "true");

  if (filled.some((item) => item.row === row)) {
    return "同じ行には、🍅を1個だけ置けます。";
  }
  if (filled.some((item) => item.col === col)) {
    return "同じ列には、🍅を1個だけ置けます。";
  }

  const area = [...cell.classList].find((name) => name.startsWith("area-"));
  if (area && filled.some((item) => item.area === area)) {
    return "同じエリアには、🍅を1個だけ置けます。";
  }

  if (
    filled.some(
      (item) =>
        Math.abs(item.row - row) <= 1 &&
        Math.abs(item.col - col) <= 1
    )
  ) {
    return "🍅同士は、上下左右や斜めで隣り合えません。";
  }

  if (filled.length >= 5) {
    return "🍅は盤面に5個までです。";
  }

  return "ルールに合わないため、そのマスには置けません。";
}

function announceGameStatus(message, tone = "info") {
  const status = document.querySelector("#game-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function initBoardKeyboard() {
  const board = document.querySelector("#board");
  if (!board) return;

  const movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  board.addEventListener("keydown", (event) => {
    const delta = movement[event.key];
    if (!delta) return;

    const cell = event.target.closest(".cell");
    if (!cell || !board.contains(cell)) return;

    const position = cellPosition(board, cell);
    if (!position) return;

    const nextRow = Math.max(0, Math.min(4, position.row + delta[0]));
    const nextCol = Math.max(0, Math.min(4, position.col + delta[1]));
    const next = position.cells[nextRow * 5 + nextCol];
    if (!next || next.disabled) return;

    event.preventDefault();
    next.focus({ preventScroll: true });
  });
}

function initBoardAnnouncements() {
  const board = document.querySelector("#board");
  if (!board) return;

  board.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || !board.contains(cell)) return;

    queueMicrotask(() => {
      if (board.classList.contains("cleared")) return;
      if (cell.classList.contains("mistake")) {
        announceGameStatus(inferMistakeReason(board, cell), "error");
        return;
      }

      const placed = cell.getAttribute("aria-pressed") === "true";
      const label = cell.getAttribute("aria-label") || "選択したマス";
      announceGameStatus(
        placed ? `${label}に🍅を置きました。` : `${label}の🍅を取り除きました。`
      );
    });
  });

  const screenObserver = new MutationObserver(() => {
    const gameScreen = document.querySelector("#screen-game");
    if (gameScreen?.classList.contains("active")) {
      announceGameStatus("マスを選んで🍅を置いてください。");
    }
  });

  const gameScreen = document.querySelector("#screen-game");
  if (gameScreen) {
    screenObserver.observe(gameScreen, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
}

function initExternalLinkLabels() {
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    const label = link.getAttribute("aria-label") || link.textContent.trim();
    if (!label.includes("新しいタブ")) {
      link.setAttribute("aria-label", `${label}（新しいタブで開きます）`);
    }
  });
}

function initTutorialProgress() {
  const bar = document.querySelector("#tutorial-bar");
  const progress = document.querySelector(".tutorial-progress");
  if (!bar || !progress) return;

  const update = () => {
    const numeric = Math.max(0, Math.min(100, Number.parseFloat(bar.style.width) || 0));
    progress.setAttribute("aria-valuenow", String(Math.round(numeric)));
  };

  new MutationObserver(update).observe(bar, {
    attributes: true,
    attributeFilter: ["style"],
  });
  update();
}

function init() {
  initModalAccessibility();
  initBoardKeyboard();
  initBoardAnnouncements();
  initExternalLinkLabels();
  initTutorialProgress();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
