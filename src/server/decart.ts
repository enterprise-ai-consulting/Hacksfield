import "server-only";

import { decartEndpoints } from "@/registry/decart-catalog";
import { quoteUsd } from "@/registry/quote";
import { ApiError, badRequest } from "./errors";
import { requireDecartKey } from "./provider-settings";
import type { CallOptions, TregReply, TregTask } from "./treg";

const ORIGIN = "https://api.decart.ai";
const MB = 1_000_000;
export class DecartUnreachable extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

async function bounded(response: Response, maximum: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new DecartUnreachable("Decart response exceeded the download limit."); }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

/** Fixed origin, no redirects, no caller-provided headers or credential-bearing URLs. */
async function request(route: string, key: string, body?: FormData, maximum = MB) {
  try {
    const response = await fetch(ORIGIN + route, {
      method: body ? "POST" : "GET", body, headers: { "X-API-KEY": key }, redirect: "error",
      signal: AbortSignal.timeout(body ? 300_000 : 120_000),
    });
    const bytes = await bounded(response, response.ok ? maximum : MB);
    return { response, bytes };
  } catch (err) {
    if (err instanceof DecartUnreachable) throw err;
    throw new DecartUnreachable("The connection to Decart dropped. Check its task history before submitting again.");
  }
}

function json(bytes: Buffer): Record<string, unknown> {
  try { const value = JSON.parse(bytes.toString("utf8")); if (value && typeof value === "object" && !Array.isArray(value)) return value; } catch { /* Invalid provider JSON is handled by the caller. */ }
  throw new DecartUnreachable("Decart returned an unreadable response. Check its task history before submitting again.");
}

/** Free, read-only credential check. Never submits a generation. */
export async function verifyDecartKey(key: string): Promise<{ credits: number }> {
  if (!/^[\x21-\x7e]{8,4096}$/.test(key)) throw badRequest("Enter a valid Decart API key.");
  const { response, bytes } = await request("/v1/credits", key);
  if (response.status === 401 || response.status === 403) throw badRequest("Decart rejected this developer API key. Your saved connection has been kept.");
  if (!response.ok) throw new ApiError(503, "provider_configuration", "Decart could not verify this key. Your saved connection has been kept.");
  const credits = json(bytes).credits;
  if (typeof credits !== "number" || !Number.isFinite(credits)) throw new ApiError(503, "provider_configuration", "Decart returned an unreadable credit balance. Your saved connection has been kept.");
  return { credits };
}

/** Enforce the local studio's clip limit before reserving money or uploading anything. */
export function validateDecartSource(source: { mime: string; bytes: number; duration: number | null; width: number | null; height: number | null }, endpoint: string): void {
  if (!endpoint.startsWith("decart.video.")) return;
  if (source.mime !== "video/mp4" || source.bytes > 30 * MB || source.duration == null || source.duration <= 0 || source.duration > 30) throw badRequest("Use an MP4 source up to 30 seconds and 30 MB for Decart video editing.");
  const ratio = (source.width ?? 0) / (source.height ?? 0);
  const ratios = endpoint.includes("vton") ? [16 / 9, 9 / 16, 2, 0.5] : [16 / 9, 9 / 16];
  if (!ratios.some(r => Math.abs(ratio - r) / r < 0.025)) throw badRequest("Use a landscape 16:9 or portrait 9:16 source for Decart. Virtual try-on also supports 2:1 and 1:2.");
}

export function validateDecartImage(source: { mime: string; bytes: number }): void {
  if (!["image/png", "image/jpeg", "image/webp"].includes(source.mime) || source.bytes <= 0 || source.bytes > 30 * MB) throw badRequest("Use a PNG, JPEG or WebP image under 30 MB for Decart.");
}

function file(value: unknown, video = false): File {
  const match = typeof value === "string" && /^data:(image\/(?:png|jpeg|webp)|video\/mp4);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || (video ? match[1] !== "video/mp4" : !match[1].startsWith("image/"))) throw badRequest("Add a supported local source file for Decart. Remote URLs are not accepted.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 30 * MB || bytes.toString("base64") !== match[2]) throw badRequest("Use a source file under 30 MB.");
  const extension = match[1].split("/")[1];
  return new File([new Uint8Array(bytes)], `source.${extension}`, { type: match[1] });
}

export async function callDecart(endpoint: string, options: CallOptions): Promise<TregReply> {
  const rule = decartEndpoints[endpoint];
  if (!rule) throw badRequest("Unknown Decart model.");
  const body = options.body && typeof options.body === "object" ? options.body as Record<string, unknown> : {};
  const video = Boolean(rule.async);
  const seconds = Number(body._parallax_duration);
  if (video && (!Number.isInteger(seconds) || seconds < 1 || seconds > 30)) throw badRequest("Decart video duration could not be verified.");
  const resolution = body.resolution ?? "720p";
  if (!(video ? resolution === "720p" : ["480p", "720p"].includes(String(resolution)))) throw badRequest("Choose a supported Decart resolution.");
  const form = new FormData();
  form.set("data", file(body.data, video));
  form.set("prompt", typeof body.prompt === "string" ? body.prompt : "");
  form.set("resolution", String(resolution));
  if (body.reference_image !== undefined && endpoint !== "decart.video.lucy-restyle-2") form.set("reference_image", file(body.reference_image));
  const { response, bytes } = await request(rule.path, requireDecartKey(), form, video ? MB : 64 * MB);
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("json") ? json(bytes) : undefined;
  const jobId = response.ok && video ? data?.job_id : null;
  if (response.ok && video && (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(jobId))) throw new DecartUnreachable("Decart accepted a request without a readable job ID. Check its task history before submitting again.");
  return {
    provider: "decart", status: response.status, ok: response.ok, callId: jobId ? `decart:${jobId}` : null,
    costMicro: response.ok ? Math.ceil(quoteUsd(endpoint, { ...body, resolution }).usd * 1e6) : null,
    isAsync: response.ok && video, tregError: false, contentType, json: data, bytes: data ? null : bytes,
  };
}

export async function getDecartTask(callId: string, endpoint?: string, body?: Record<string, unknown>): Promise<TregTask> {
  const id = callId.slice("decart:".length);
  if (!callId.startsWith("decart:") || !/^[A-Za-z0-9_-]{1,200}$/.test(id) || !endpoint || !decartEndpoints[endpoint]?.async) throw badRequest("Invalid Decart task.");
  const key = requireDecartKey();
  const { response, bytes } = await request(`/v1/jobs/${id}`, key);
  if (!response.ok) throw new DecartUnreachable(`Decart task status ${response.status}.`, response.status);
  const data = json(bytes);
  const status = typeof data.status === "string" ? data.status : "processing";
  let content: Buffer | undefined;
  if (status === "completed") {
    const result = await request(`/v1/jobs/${id}/content`, key, undefined, 300 * MB);
    if (!result.response.ok) throw new DecartUnreachable(`Decart result download ${result.response.status}.`, result.response.status);
    content = result.bytes;
  }
  return {
    call_id: callId, endpoint_id: endpoint, task_id: id, state: status, status,
    response: { http_status: response.status, body: data }, result: null, result_url: null, fetch_command: null,
    retry_after: 5, error: data.error ?? data.detail ?? null, bytes: content,
    // Failed or uncertain work keeps its reservation; no undocumented refund is assumed.
    cost_micro: status === "completed" && body ? Math.ceil(quoteUsd(endpoint, body).usd * 1e6) : null,
  };
}
