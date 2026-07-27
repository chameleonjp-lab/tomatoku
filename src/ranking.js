import { RANKING_CONFIG } from "./ranking-config.js";

/**
 * トマトオク 共通ランキング連携 (Supabase REST RPC)
 *
 * - Publishable key だけを `apikey` ヘッダーへ設定する。
 * - secret / service_role key と Authorization: Bearer は使用しない。
 * - 公式モードかつ明示的な送信ゲート有効時だけ送信する。
 */

export const DEFAULT_CLIENT_VERSION = "tomatooku-web-2.1.0-mode-score-v1";
const MAX_POSTGRES_INT = 2_147_483_647;
const CONTROL_OR_FORMAT_RE = /[\p{Cc}\p{Cf}]/gu;
const PLACEHOLDER_RE = /(xxxx|example|placeholder|公開可能なキー|publishable key|anon key)/i;

const DEFAULTS = {
  supabaseUrl: RANKING_CONFIG.supabaseUrl,
  supabasePublishableKey: RANKING_CONFIG.supabasePublishableKey,
  supabaseAnonKey: "",
  gameSlug: RANKING_CONFIG.gameSlug,
  clientVersion: RANKING_CONFIG.clientVersion || DEFAULT_CLIENT_VERSION,
  timeoutMs: RANKING_CONFIG.timeoutMs,
  submitRpc: RANKING_CONFIG.submitRpc,
  bestRankingRpc: RANKING_CONFIG.bestRankingRpc,
  firstRankingRpc: RANKING_CONFIG.firstRankingRpc,
  rankingsEnabled: RANKING_CONFIG.rankingsEnabled === true,
  submissionsEnabled: RANKING_CONFIG.submissionsEnabled === true,
};

function globalConfig() {
  return typeof window !== "undefined" && window.TOMATOKU_CONFIG
    ? window.TOMATOKU_CONFIG
    : {};
}

const OVERRIDES = globalConfig();
export const CONFIG = Object.freeze({
  ...DEFAULTS,
  ...OVERRIDES,
  supabaseUrl: String(OVERRIDES.supabaseUrl || DEFAULTS.supabaseUrl),
  supabasePublishableKey: String(
    OVERRIDES.supabasePublishableKey ||
      OVERRIDES.publishableKey ||
      OVERRIDES.supabaseAnonKey ||
      DEFAULTS.supabasePublishableKey
  ),
  rankingsEnabled:
    OVERRIDES.rankingsEnabled === true ||
    (OVERRIDES.rankingsEnabled == null && DEFAULTS.rankingsEnabled),
  submissionsEnabled:
    OVERRIDES.submissionsEnabled === true ||
    (OVERRIDES.submissionsEnabled == null && DEFAULTS.submissionsEnabled),
});
export const CLIENT_VERSION = CONFIG.clientVersion;

function publishableKeyOf(config = CONFIG) {
  return String(
    config.supabasePublishableKey ||
      config.publishableKey ||
      config.supabaseAnonKey ||
      ""
  ).trim();
}

export function isConfigured(config = CONFIG) {
  const url = String(config.supabaseUrl || "").trim();
  const key = publishableKeyOf(config);
  if (!url || !key || key.length < 20) return false;
  if (PLACEHOLDER_RE.test(url) || PLACEHOLDER_RE.test(key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

export function isSubmissionEnabled(config = CONFIG) {
  return isRankingEnabled(config) && config.submissionsEnabled === true;
}

export function isRankingEnabled(config = CONFIG) {
  return isConfigured(config) && config.rankingsEnabled === true;
}

export function normalizeDisplayName(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(CONTROL_OR_FORMAT_RE, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 20);
}

function normalizeScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  const integer = Math.floor(numeric);
  if (integer < 0 || integer > MAX_POSTGRES_INT) return null;
  return integer;
}

function normalizeLimit(limit) {
  const numeric = Math.floor(Number(limit));
  if (!Number.isFinite(numeric)) return 10;
  return Math.min(100, Math.max(1, numeric));
}

function baseResult(status, message) {
  return {
    status,
    accepted: false,
    firstScore: null,
    bestScore: null,
    playCount: null,
    isFirstPlay: false,
    isNewBest: false,
    rank: null,
    message,
  };
}

function rankingState(status, rows, message) {
  return { status, rows, message };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function createRankingClient(config = CONFIG, dependencies = {}) {
  const effectiveConfig = { ...DEFAULTS, ...config };
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const setTimeoutImpl = dependencies.setTimeout || globalThis.setTimeout;
  const clearTimeoutImpl = dependencies.clearTimeout || globalThis.clearTimeout;
  const submissionByPlayId = new Map();

  async function rpc(name, body) {
    if (!isConfigured(effectiveConfig)) {
      const error = new Error("ranking_not_configured");
      error.code = "NOT_CONFIGURED";
      throw error;
    }
    if (typeof fetchImpl !== "function") {
      const error = new Error("fetch_unavailable");
      error.code = "FETCH_UNAVAILABLE";
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeoutImpl(
      () => controller.abort(),
      effectiveConfig.timeoutMs
    );
    const endpoint = `${String(effectiveConfig.supabaseUrl).replace(/\/$/, "")}/rest/v1/rpc/${name}`;

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKeyOf(effectiveConfig),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response || typeof response.ok !== "boolean") {
        throw new Error("invalid_response");
      }
      if (!response.ok) {
        const error = new Error(`rpc_http_${response.status || 0}`);
        error.code = "HTTP_ERROR";
        error.httpStatus = response.status || null;
        throw error;
      }

      try {
        return await response.json();
      } catch (_) {
        const error = new Error("invalid_json");
        error.code = "INVALID_JSON";
        throw error;
      }
    } catch (error) {
      if (controller.signal.aborted && (!error || error.name !== "AbortError")) {
        const timeoutError = new Error("ranking_timeout");
        timeoutError.name = "AbortError";
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeoutImpl(timer);
    }
  }

  function submitScore({ playId, mode, playerName, score } = {}) {
    if (mode !== "official") {
      return Promise.resolve(
        baseResult("skipped", "ランダム練習はランキング対象外です")
      );
    }
    if (!isSubmissionEnabled(effectiveConfig)) {
      return Promise.resolve(
        baseResult("skipped", "テスト中のため、今回の記録は保存されません")
      );
    }

    const normalizedPlayId = String(playId || "").trim();
    const normalizedName = normalizeDisplayName(playerName);
    const normalizedScore = normalizeScore(score);
    if (!normalizedPlayId || !normalizedName || normalizedScore === null) {
      return Promise.resolve(
        baseResult("error", "ランキングへ送信できない結果です")
      );
    }

    if (submissionByPlayId.has(normalizedPlayId)) {
      return submissionByPlayId.get(normalizedPlayId);
    }

    const promise = (async () => {
      try {
        const data = await rpc(effectiveConfig.submitRpc, {
          p_display_name: normalizedName,
          p_game_slug: effectiveConfig.gameSlug,
          p_score: normalizedScore,
          p_client_version: effectiveConfig.clientVersion,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (!row || row.accepted !== true) {
          return baseResult(
            "error",
            "ランキング登録を受け付けられませんでした"
          );
        }
        return {
          status: "ok",
          accepted: true,
          firstScore: numberOrNull(row.result_first_score),
          bestScore: numberOrNull(row.result_best_score),
          playCount: numberOrNull(row.result_play_count),
          isFirstPlay: row.is_first_play === true,
          isNewBest: row.is_new_best === true,
          rank: null,
          message: "ランキングへ登録しました",
        };
      } catch (_) {
        return baseResult("error", "ランキング送信に失敗しました");
      }
    })();

    submissionByPlayId.set(normalizedPlayId, promise);
    return promise;
  }

  async function fetchRankingByType(type, limit = 10) {
    if (!isConfigured(effectiveConfig)) {
      return rankingState("not_configured", [], "ランキングは未設定です");
    }
    if (effectiveConfig.rankingsEnabled !== true) {
      return rankingState(
        "disabled",
        [],
        "テスト中のためランキングを停止しています"
      );
    }
    const isFirst = type === "first";
    const rpcName = isFirst
      ? effectiveConfig.firstRankingRpc
      : effectiveConfig.bestRankingRpc;

    try {
      const data = await rpc(rpcName, {
        p_game_slug: effectiveConfig.gameSlug,
        p_limit: normalizeLimit(limit),
      });
      if (!Array.isArray(data)) {
        return rankingState("error", [], "ランキングの形式が不正です");
      }
      const rows = data.map((row, index) => ({
        rank: numberOrNull(row.rank_no) ?? index + 1,
        playerName: String(row.display_name ?? "?"),
        firstScore: numberOrNull(row.first_score),
        bestScore: numberOrNull(row.best_score),
        playCount: numberOrNull(row.play_count),
        updatedAt: row.updated_at ?? null,
      }));
      return rows.length
        ? rankingState("ok", rows, "")
        : rankingState("empty", [], "まだランキングがありません");
    } catch (_) {
      return rankingState("error", [], "ランキングを読み込めませんでした");
    }
  }

  return {
    config: effectiveConfig,
    submitScore,
    fetchBestRanking: (limit) => fetchRankingByType("best", limit),
    fetchFirstRanking: (limit) => fetchRankingByType("first", limit),
    clearSubmissionCacheForTests: () => submissionByPlayId.clear(),
  };
}

const defaultClient = createRankingClient(CONFIG);

export function submitScore(args) {
  return defaultClient.submitScore(args);
}

export function fetchBestRanking(limit = 10) {
  return defaultClient.fetchBestRanking(limit);
}

export function fetchFirstRanking(limit = 10) {
  return defaultClient.fetchFirstRanking(limit);
}

export async function fetchRanking(limit = 10) {
  const result = await fetchBestRanking(limit);
  return result.status === "ok" ? result.rows : [];
}

export function resetSubmission() {
  // playId単位で管理するため、画面遷移では解除しない。
}
