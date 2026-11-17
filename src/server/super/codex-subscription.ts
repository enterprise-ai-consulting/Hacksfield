import "server-only";

import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { LlmClient, LlmMessage, LlmRequest, LlmResult } from "./llm";

interface ChatPart { type: string; text?: string; image_url?: { url: string } }
interface ChatCall { id: string; type: "function"; function: { name: string; arguments: string } }
interface ChatMessage { role: string; content: string | ChatPart[]; tool_calls?: ChatCall[]; tool_call_id?: string }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function contentParts(blocks: unknown[]): ChatPart[] {
  return blocks.flatMap<ChatPart>(block => {
    if (!record(block)) return [];
    if (block.type === "text" && typeof block.text === "string") return [{ type: "text", text: block.text }];
    if (block.type === "image" && record(block.source)) {
      const source = block.source;
      const url = source.type === "base64" ? `data:${source.media_type};base64,${source.data}` : source.type === "url" ? String(source.url) : "";
      return url ? [{ type: "image_url", image_url: { url } }] : [];
    }
    return [];
  });
}

/** Convert only conversation data; credentials never enter these messages or the browser. */
export function codexMessages(system: string, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (typeof message.content === "string") { out.push({ role: message.role, content: message.content }); continue; }
    const blocks = message.content as unknown as Record<string, unknown>[];
    if (message.role === "assistant") {
      const calls: ChatCall[] = blocks.filter(b => b.type === "tool_use").map(b => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input) } }));
      out.push({ role: "assistant", content: contentParts(blocks).filter(p => p.type === "text").map(p => p.text).join("\n"), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const returnedImages: ChatPart[] = [];
      for (const block of blocks.filter(b => b.type === "tool_result")) {
        const parts = typeof block.content === "string" ? [{ type: "text", text: block.content }] : contentParts(Array.isArray(block.content) ? block.content : []);
        out.push({ role: "tool", tool_call_id: String(block.tool_use_id), content: parts.filter(p => p.type === "text").map(p => p.text).join("\n") });
        returnedImages.push(...parts.filter(p => p.type === "image_url"));
      }
      if (returnedImages.length) out.push({ role: "user", content: [{ type: "text", text: "Images returned by the preceding tools for inspection:" }, ...returnedImages] });
      const parts = contentParts(blocks);
      if (parts.length) out.push({ role: "user", content: parts });
    }
  }
  return out;
}

export function codexResult(message: unknown): LlmResult {
  if (!record(message)) throw new Error("Codex returned an invalid response.");
  const content: LlmResult["content"] = [];
  if (typeof message.content === "string" && message.content) content.push({ type: "text", text: message.content });
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    if (!record(call) || typeof call.id !== "string" || !record(call.function) || typeof call.function.name !== "string" || typeof call.function.arguments !== "string") throw new Error("Codex returned invalid tool arguments.");
    let input: unknown;
    try { input = JSON.parse(call.function.arguments); } catch { throw new Error("Codex returned invalid tool arguments."); }
    if (!record(input)) throw new Error("Codex returned invalid tool arguments.");
    content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }
  if (!content.length && typeof message.refusal === "string") content.push({ type: "text", text: message.refusal });
  return { content, stopReason: content.some(b => b.type === "tool_use") ? "tool_use" : message.refusal ? "refusal" : "end_turn" };
}

export async function subscriptionRequest(input: { model: string; messages: ChatMessage[]; tools?: unknown[] }, signal?: AbortSignal): Promise<unknown> {
  const relay = process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL;
  if (relay) {
    const url = new URL(relay);
    const key = process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY;
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/respond" || url.username || url.password || url.search || url.hash || !key) {
      throw new Error("The subscription relay requires authenticated loopback configuration.");
    }
    try {
      const response = await fetch(url, {
        method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(input), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240_000)]) : AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error("relay unavailable");
      const result: unknown = await response.json();
      if (!record(result) || result.error || !record(result.message)) throw new Error("invalid response");
      return result.message;
    } catch {
      throw new Error("The Codex subscription connection is unavailable. Keep the connected Mac online and check your Hermes sign-in. No paid API fallback was used.");
    }
  }
  const root = process.env.PARALLAX_HERMES_ROOT || path.join(os.homedir(), ".hermes", "hermes-agent");
  const python = path.join(root, "venv", "bin", "python");
  const script = path.join(process.cwd(), "scripts", "codex-subscription.py");
  return new Promise((resolve, reject) => {
    const child = execFile(python, [script], { cwd: root, timeout: 240_000, maxBuffer: 12_000_000, signal, env: { ...process.env, HERMES_HOME: process.env.PARALLAX_HERMES_HOME || path.join(os.homedir(), ".hermes") } }, (error, stdout) => {
      if (error) return reject(new Error("The Codex subscription connection is unavailable. Check your ChatGPT sign-in in Hermes. No paid API fallback was used."));
      try {
        const result: unknown = JSON.parse(stdout);
        if (!record(result) || result.error || !result.message) throw new Error("invalid response");
        resolve(result.message);
      } catch { reject(new Error("Codex did not return a complete response. Check your subscription limits or Hermes sign-in before trying again.")); }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(JSON.stringify(input));
  });
}

export class CodexSubscriptionLlm implements LlmClient {
  readonly live = true;
  async respond(req: LlmRequest): Promise<LlmResult> {
    const message = await subscriptionRequest({
      model: req.model, messages: codexMessages(req.system, req.messages),
      tools: req.tools.map(tool => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } })),
    }, req.signal);
    const result = codexResult(message);
    for (const block of result.content) if (block.type === "text") req.onText(block.text);
    return result;
  }
}
