import "server-only";

import { randomUUID } from "node:crypto";
import { providerSettings, requireAudioKey, requireBytePlusKey, requireSpeechKey } from "./provider-settings";
import { ApiError, badRequest } from "./errors";
import type { CallOptions, TregReply, TregTask } from "./treg";
import { byteplusEndpoints } from "@/registry/byteplus-catalog";
import { imagePixelPrice } from "@/registry/quote";

export class BytePlusUnreachable extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
const IMAGE_ENDPOINT = "byteplus.image.seedream-4-5";
const VIDEO_ENDPOINT = "byteplus.video.seedance-2-0";
const MUSIC_ENDPOINT = "byteplus.music.seedance-2-0";
const SPEECH_ENDPOINT = "byteplus.speech.seed-tts-2-0";
const AUDIO_ENDPOINT = "byteplus.audio.seed-audio-1-0";
const MB = 1_000_000;
const imageRoutes: Record<string, { model: string; micro: number }> = {
  [IMAGE_ENDPOINT]: { model: "seedream-4-5-251128", micro: 40000 },
  "byteplus.image.seedream-4-0": { model: "seedream-4-0-250828", micro: 30000 },
  "byteplus.image.seedream-5-0-lite": { model: "seedream-5-0-lite-260128", micro: 35000 },
  "byteplus.image.seedream-5-5": { model: "dola-seedream-5-5-261028", micro: 35000 },
  "byteplus.image.seedream-5-5-layers": { model: "dola-seedream-5-5-261028", micro: 35000 },
};
const videoRoutes: Record<string, { model: string; microPerToken: number }> = {
  [VIDEO_ENDPOINT]: { model: "dreamina-seedance-2-0-260128", microPerToken: 7 },
  [MUSIC_ENDPOINT]: { model: "dreamina-seedance-2-0-260128", microPerToken: 7 },
  "byteplus.video.seedance-1-0-pro-fast": { model: "seedance-1-0-pro-fast-251015", microPerToken: 1 },
  "byteplus.video.seedance-1-0-pro": { model: "seedance-1-0-pro-250528", microPerToken: 2.5 },
  "byteplus.video.seedance-2-5": { model: "dreamina-seedance-2-5-260628", microPerToken: 10.7 },
  "byteplus.music.seedance-2-5": { model: "dreamina-seedance-2-5-260628", microPerToken: 10.7 },
};

function base(speech = false): string {
  const url = new URL(speech ? (process.env.BYTEPLUS_SPEECH_BASE_URL ?? "https://voice.ap-southeast-1.bytepluses.com/api/v3") : (process.env.BYTEPLUS_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3"));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) throw new Error("BytePlus requires an HTTPS API address.");
  return url.toString().replace(/\/+$/, "");
}

async function readBounded(response: Response, maxBytes = 48 * MB): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  let length = 0;
  while (reader) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("response limit");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Read-only validation before replacing a saved platform credential. No task is submitted. */
export async function verifyBytePlusKey(key: string): Promise<void> {
  if (!/^[\x21-\x7e]{8,4096}$/.test(key)) throw badRequest("Enter a valid ModelArk platform API key.");
  let response: Response;
  try {
    response = await fetch(base() + "/contents/generations/tasks?page_size=1", {
      method: "GET", redirect: "error", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
  } catch {
    throw new ApiError(503, "provider_configuration", "BytePlus could not verify this replacement key. Your saved connection has been kept.");
  }
  if (response.status === 401 || response.status === 403) throw badRequest("BytePlus rejected this platform key or its media permissions. Your saved connection has been kept.");
  if (!response.ok) throw new ApiError(503, "provider_configuration", "BytePlus could not verify this replacement key. Your saved connection has been kept.");
}

async function request(route: string, body?: unknown, maxBytes?: number): Promise<{ status: number; json: Record<string, unknown> }> {
  const key = requireBytePlusKey();
  let response: Response;
  try {
    response = await fetch(base() + route, {
      method: body === undefined ? "GET" : "POST", redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(body === undefined ? 30_000 : 180_000),
    });
  } catch {
    throw new BytePlusUnreachable("The connection to BytePlus did not complete. Check its status before submitting again.");
  }
  try {
    const parsed: unknown = JSON.parse(await readBounded(response, maxBytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid response");
    return { status: response.status, json: parsed as Record<string, unknown> };
  } catch {
    throw new BytePlusUnreachable("BytePlus returned an unreadable response. Check its task history before submitting again.");
  }
}

async function speech(opts: CallOptions): Promise<TregReply> {
  const key = requireSpeechKey();
  const { speechAppId } = providerSettings();
  const auth: Record<string, string> = speechAppId ? { "X-Api-App-Id": speechAppId, "X-Api-Access-Key": key } : { "X-Api-Key": key };
  const body = opts.body && typeof opts.body === "object" ? opts.body as Record<string, unknown> : {};
  const reply = (status: number, json: Record<string, unknown>): TregReply => ({ status, ok: false, provider: "byteplus", callId: null, costMicro: null, isAsync: false, tregError: false, contentType: "application/json", json, bytes: null });
  let response: Response;
  let text: string;
  try {
    response = await fetch(base(true) + "/tts/unidirectional", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(180_000),
      headers: { "Content-Type": "application/json", ...auth, "X-Api-App-Key": "aGjiRDfUWi", "X-Api-Resource-Id": "seed-tts-2.0", "X-Api-Request-Id": randomUUID() },
      body: JSON.stringify({ user: { uid: "parallax" }, req_params: {
        text: body.text, speaker: body.speaker,
        audio_params: { format: "mp3", sample_rate: 24000, speech_rate: body.speech_rate ?? 0 },
        ...(body.style ? { additions: JSON.stringify({ context_texts: [body.style] }) } : {}),
      } }),
    });
    text = await readBounded(response);
  } catch {
    throw new BytePlusUnreachable("The Speech connection did not complete. Check provider usage before submitting again.");
  }
  const audio: Buffer[] = [];
  let complete = false;
  try {
    if (!response.ok) {
      let json: Record<string, unknown>;
      try { json = JSON.parse(text); } catch { json = { message: "Seed Speech refused the request." }; }
      return reply(response.status, json);
    }
    for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
      const event = JSON.parse(line) as { code?: number; data?: string | null; message?: string };
      if (complete) throw new Error("unexpected data after completion");
      if (event.code !== 0 && event.code !== 20000000) {
        const message = typeof event.message === "string" ? event.message : "Seed Speech could not finish this request.";
        const status = /concurrency|rate limit/i.test(message) ? 429 : event.code === 45000000 ? 403 : event.code && event.code >= 50000000 ? 502 : 400;
        return reply(status, { error: { message } });
      }
      if (event.data) {
        if (typeof event.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(event.data)) throw new Error("invalid audio data");
        audio.push(Buffer.from(event.data, "base64"));
      }
      if (event.code === 20000000) complete = true;
    }
    if (!complete || audio.length === 0) throw new Error("incomplete audio stream");
  } catch {
    throw new BytePlusUnreachable("Seed Speech returned an incomplete audio stream. Check provider usage before submitting again.");
  }
  return { ...reply(200, {}), ok: true, contentType: "audio/mpeg", json: undefined, bytes: Buffer.concat(audio), costMicro: Array.from(String(body.text ?? "")).length * 30 };
}

async function audio(opts: CallOptions): Promise<TregReply> {
  const key = requireAudioKey();
  const body = opts.body && typeof opts.body === "object" ? opts.body as Record<string, unknown> : {};
  let response: Response;
  let payload: Record<string, unknown>;
  try {
    response = await fetch(base(true) + "/tts/create", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(180_000),
      headers: { "Content-Type": "application/json", "X-Api-Key": key, "X-Api-Request-Id": randomUUID() },
      body: JSON.stringify({ model: "seed-audio-1.0", text_prompt: body.text_prompt, audio_config: { format: "mp3", sample_rate: 24000, enable_subtitle: false } }),
    });
    payload = JSON.parse(await readBounded(response));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid response");
  } catch {
    throw new BytePlusUnreachable("Seed Audio returned an unreadable or incomplete response. Check provider usage before submitting again.");
  }
  const reply: TregReply = { status: response.status, ok: false, provider: "byteplus", callId: null, costMicro: null, isAsync: false, tregError: false, contentType: "application/json", json: payload, bytes: null };
  if (!response.ok || (payload.code !== undefined && payload.code !== 0 && payload.code !== 20000000)) {
    return { ...reply, status: response.ok ? 400 : response.status };
  }
  const seconds = Number(payload.original_duration);
  if (typeof payload.audio !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120) {
    throw new BytePlusUnreachable("Seed Audio returned invalid audio or duration. Check provider usage before submitting again.");
  }
  return { ...reply, ok: true, json: undefined, contentType: "audio/mpeg", bytes: Buffer.from(payload.audio, "base64"), costMicro: Math.ceil(seconds * 2500) };
}

export async function callBytePlus(endpoint: string, opts: CallOptions): Promise<TregReply> {
  if (endpoint === AUDIO_ENDPOINT) return audio(opts);
  if (endpoint === SPEECH_ENDPOINT) return speech(opts);
  const imageRoute = imageRoutes[endpoint];
  const videoRoute = videoRoutes[endpoint];
  if (!imageRoute && !videoRoute) throw new Error("Unsupported BytePlus endpoint.");
  const image = Boolean(imageRoute);
  // Legacy endpoint overrides apply only to the original model, never another quota pool.
  const model = endpoint === IMAGE_ENDPOINT ? (process.env.BYTEPLUS_IMAGE_MODEL ?? imageRoute.model)
    : endpoint === VIDEO_ENDPOINT || endpoint === MUSIC_ENDPOINT ? (process.env.BYTEPLUS_VIDEO_MODEL ?? videoRoute.model)
    : (imageRoute ?? videoRoute).model;
  const body = opts.body && typeof opts.body === "object" ? { ...opts.body } as Record<string, unknown> : {};
  delete body._parallax_reservation_seconds;
  const { status, json } = await request(image ? "/images/generations" : "/contents/generations/tasks", {
    ...body, model, ...(image ? { response_format: "b64_json", ...(!endpoint.includes("seedream-5-5") ? { sequential_image_generation: "disabled" } : {}) } : {}),
  }, endpoint === "byteplus.image.seedream-5-5-layers" ? 256 * MB : undefined);
  const ok = status >= 200 && status < 300 && !json.error;
  const usage = json.usage as { generated_images?: number } | undefined;
  const count = Number(usage?.generated_images ?? (Array.isArray(json.data) ? json.data.length : 0));
  const costRule = byteplusEndpoints[endpoint]?.cost;
  let imageMicro = count * (imageRoute?.micro ?? 0);
  if (image && costRule?.pixelTiers && ok && Array.isArray(json.data)) {
    const requestBody = body as Record<string, unknown>;
    const inputs = requestBody.image;
    const inputCount = Array.isArray(inputs) ? inputs.length : typeof inputs === "string" ? 1 : 0;
    const outputs = json.data as { size?: string }[];
    imageMicro = Math.ceil((inputCount * (costRule.inputImageUsd ?? 0) + outputs.reduce((total, output) => total + imagePixelPrice(output.size ?? requestBody.size, costRule.pixelTiers!), 0)) * 1e6);
  }
  return {
    status, ok, provider: "byteplus", callId: !image && ok && typeof json.id === "string" ? `byteplus:${json.id}` : null,
    costMicro: image && ok && count > 0 ? Math.round(imageMicro) : null,
    isAsync: !image && ok, tregError: false, contentType: "application/json", json, bytes: null,
  };
}

export async function getBytePlusTask(callId: string, endpoint = VIDEO_ENDPOINT, requestBody?: Record<string, unknown>): Promise<TregTask> {
  const id = callId.replace(/^byteplus:/, "");
  if (!/^cgt-[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error("Invalid BytePlus task id.");
  const { status, json } = await request(`/contents/generations/tasks/${encodeURIComponent(id)}`);
  if (status < 200 || status >= 300) throw new BytePlusUnreachable(`BytePlus task status could not be read (HTTP ${status}).`, status);
  const content = json.content as { video_url?: string } | undefined;
  const usage = json.usage as { completion_tokens?: number } | undefined;
  const tokens = Number(usage?.completion_tokens);
  let rate = videoRoutes[endpoint]?.microPerToken;
  if (endpoint.endsWith("seedance-2-5")) {
    const resolution = requestBody?.resolution ?? json.resolution;
    const withVideo = Array.isArray(requestBody?.content) && requestBody.content.some(item => item?.type === "video_url");
    rate = withVideo ? resolution === "1080p" ? 7 : 6.4 : resolution === "1080p" ? 11.7 : 10.7;
  }
  return {
    call_id: callId, endpoint_id: endpoint, task_id: id,
    state: typeof json.status === "string" ? json.status : null, status: typeof json.status === "string" ? json.status : null,
    response: { http_status: status, content_type: "application/json", body: json }, result: content?.video_url ?? null,
    result_url: null, fetch_command: null, retry_after: 5, error: json.error ?? null,
    cost_micro: Number.isFinite(tokens) && tokens >= 0 && rate !== undefined ? Math.ceil(tokens * rate) : null,
  };
}
