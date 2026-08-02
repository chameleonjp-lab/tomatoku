import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { validateTranscript } from "./validator.js";

const CLIENT_VERSION = "tomatooku-web-3.0.0-verified-competition-v1";
const MAX_REQUEST_BYTES = 80_000;
const ALLOWED_ORIGINS = new Set([
  "https://chameleonjp-lab.github.io",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://chameleonjp-lab.github.io",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function json(req: Request, status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseNamedKeys(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Object.values(parsed).filter(
      (candidate): candidate is string => typeof candidate === "string"
    );
  } catch (_) {
    return [];
  }
}

function publicKeys() {
  return [
    ...parseNamedKeys(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
    Deno.env.get("SUPABASE_ANON_KEY") || "",
  ].filter(Boolean);
}

function secretKey() {
  return (
    parseNamedKeys(Deno.env.get("SUPABASE_SECRET_KEYS"))[0] ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

async function callInternalRpc(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = secretKey();
  if (!url || !key) throw new Error("server_configuration_missing");
  const response = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/rpc/${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
      },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`internal_rpc_${response.status}`);
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

async function sha256(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJsonObject(req: Request) {
  if (!req.body) throw new Error("invalid_json");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json_shape");
  }
  return parsed as Record<string, unknown>;
}

async function requestKey(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = req.headers.get("cf-connecting-ip") || forwarded || "unknown";
  return sha256({ version: 1, source, salt: secretKey() });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { accepted: false, reason: "method_not_allowed" });
  }
  if (!originAllowed(req)) {
    return json(req, 403, { accepted: false, reason: "origin_not_allowed" });
  }

  const suppliedKey = req.headers.get("apikey") || "";
  if (!suppliedKey || !publicKeys().includes(suppliedKey)) {
    return json(req, 401, { accepted: false, reason: "invalid_api_key" });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(req, 413, { accepted: false, reason: "request_too_large" });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return json(req, 413, { accepted: false, reason: "request_too_large" });
    }
    return json(req, 400, { accepted: false, reason: "invalid_json" });
  }
  if (body.clientVersion !== CLIENT_VERSION) {
    return json(req, 409, { accepted: false, reason: "version_mismatch" });
  }

  try {
    if (body.action === "prepare") {
      const result = await callInternalRpc("tomatoku_prepare_run_internal", {
        p_display_name: String(body.playerName || ""),
        p_client_version: CLIENT_VERSION,
        p_request_key: await requestKey(req),
      });
      return json(req, 200, {
        accepted: result?.accepted === true,
        runToken: result?.run_token || null,
      });
    }

    if (body.action === "begin") {
      const result = await callInternalRpc("tomatoku_begin_run_internal", {
        p_run_token: String(body.runToken || ""),
        p_client_version: CLIENT_VERSION,
      });
      return json(req, 200, {
        accepted: result?.accepted === true,
        stageIds: result?.stage_ids || [],
      });
    }

    if (body.action === "finish") {
      const runToken = String(body.runToken || "");
      const transcriptHash = await sha256(body.transcript);
      const run = await callInternalRpc("tomatoku_get_run_internal", {
        p_run_token: runToken,
        p_client_version: CLIENT_VERSION,
        p_transcript_hash: transcriptHash,
      });
      if (!run || run.accepted !== true) {
        return json(req, 422, { accepted: false, reason: "invalid_run" });
      }
      if (run.completed === true) {
        return json(req, 200, run.result || { accepted: false });
      }
      const validation = validateTranscript({
        stages: run.stages,
        transcript: body.transcript,
        elapsedMs: body.elapsedMs,
      });
      const result = await callInternalRpc("tomatoku_finalize_run_internal", {
        p_run_token: runToken,
        p_client_version: CLIENT_VERSION,
        p_elapsed_ms: validation.elapsedMs,
        p_action_count: validation.actionCount,
        p_mistake_count: validation.mistakeCount,
        p_hint_count: validation.hintCount,
        p_score: validation.score,
        p_transcript_hash: transcriptHash,
      });
      return json(req, 200, result || { accepted: false });
    }

    return json(req, 400, { accepted: false, reason: "invalid_action" });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "tomatoku_competition_rejected",
        reason: error instanceof Error ? error.message : "unknown",
      })
    );
    return json(req, 422, { accepted: false, reason: "verification_failed" });
  }
});
