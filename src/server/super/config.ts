import "server-only";

import { readFileSync } from "node:fs";

/**
 * Settings for the agent chat. Each outside service is live only when SUPER_MODE=live
 * and its own key is set; otherwise that one service runs as a mock.
 *
 * The assistant itself can also run on an outside engine: a Hermes agent (SUPER_ENGINE=hermes).
 * Then Hermes does the thinking and Hacksfield serves it our tools; see `hermes.ts`.
 */

export type Service = "llm" | "computer" | "connectors";

const KEYS: Record<Service, string> = {
  llm: "ANTHROPIC_API_KEY",
  computer: "ORGO_API_KEY",
  connectors: "COMPOSIO_API_KEY",
};

export function serviceMode(service: Service): "live" | "mock" {
  if (service === "llm" && process.env.PARALLAX_ASSISTANT_PROVIDER === "codex-subscription") return "live";
  if (service === "llm" && hermesEngine()) return "live";
  return process.env.SUPER_MODE === "live" && !!process.env[KEYS[service]] ? "live" : "mock";
}

/** A secret from NAME, or from the file that NAME_FILE names. Never logged. */
export function secret(name: string): string | null {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  const file = process.env[`${name}_FILE`]?.trim();
  if (!file) return null;
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export interface HermesEngine {
  /** Where the agent's API server answers, with no trailing slash. */
  url: string;
  /** The agent's own API key. */
  key: string;
  /** What the agent must show us when it calls our tools. */
  token: string;
  model: string;
  /** The name members see in the composer. */
  name: string;
  /** The name our tool server has in the agent's settings; its tools are `mcp__<name>__<tool>`. */
  mcpName: string;
}

let warned = false;

/** The Hermes engine's settings, or null when the built-in engine is in charge. */
export function hermesEngine(): HermesEngine | null {
  if ((process.env.SUPER_ENGINE ?? "").trim().toLowerCase() !== "hermes") return null;
  let url: string | null = null;
  try {
    const u = new URL(process.env.HERMES_URL ?? "");
    if (u.protocol === "http:" || u.protocol === "https:") url = (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    /* not an address */
  }
  const key = secret("HERMES_API_KEY");
  const token = secret("SUPER_ENGINE_TOKEN");
  if (!url || !key || !token || token.length < 24) {
    if (!warned) {
      warned = true;
      const missing = [!url && "HERMES_URL", !key && "HERMES_API_KEY", (!token || token.length < 24) && "SUPER_ENGINE_TOKEN (24+ characters)"].filter(Boolean);
      console.error(`[super] SUPER_ENGINE=hermes is set but incomplete (${missing.join(", ")}). Using the built-in engine.`);
    }
    return null;
  }
  return {
    url,
    key,
    token,
    model: process.env.HERMES_MODEL?.trim() || "hermes-agent",
    name: (process.env.SUPER_ENGINE_NAME?.trim() || "Hermes").slice(0, 40),
    mcpName: (process.env.HERMES_MCP_NAME?.trim() || "parallax").replace(/[^A-Za-z0-9_]/g, "_"),
  };
}

function num(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
}

export const limits = {
  /** Model calls in one turn before it is cut off. */
  maxSteps: () => num("SUPER_MAX_STEPS", 12, 1, 50),
  /** Working time of one turn, not counting time spent waiting for the member. */
  turnMs: () => num("SUPER_TURN_MS", 5 * 60_000, 5_000, 30 * 60_000),
  /** How long an approval card waits before it expires. */
  approvalMs: () => num("SUPER_APPROVAL_MS", 30 * 60_000, 10_000, 24 * 3_600_000),
  /** How long a generation may take before the turn stops waiting for it. */
  jobWaitMs: () => num("SUPER_JOB_WAIT_MS", 10 * 60_000, 5_000, 60 * 60_000),
  /** Idle minutes before a member's computer is suspended. */
  computerIdleMs: () => num("SUPER_COMPUTER_IDLE_MIN", 20, 1, 24 * 60) * 60_000,
  maxSchedules: 10,
  maxChats: 500,
};

/** The assistant's own model choices. `auto` lets the server pick. */
export const LLM_MODELS = process.env.PARALLAX_ASSISTANT_PROVIDER === "codex-subscription" ? [
  { id: "auto", name: "Auto (Astra)", description: "Uses your ChatGPT subscription through Hermes.", tier: "standard" },
  { id: "gpt-6-astra", name: "GPT-6 Astra", description: "Reasoning and creative planning through your subscription.", tier: "high" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", description: "A capable subscription model.", tier: "medium" },
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", description: "Fast writing and everyday requests through your subscription.", tier: "low" },
] as const : [
  { id: "auto", name: "Auto", description: "Picks the model for you.", tier: "standard" },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", description: "Strongest planning and tool use.", tier: "high" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", description: "Fast and capable for everyday work.", tier: "medium" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Quickest replies for simple asks.", tier: "low" },
] as const;

export function resolveLlmModel(setting: string): string {
  if (setting && setting !== "auto" && LLM_MODELS.some((m) => m.id === setting)) return setting;
  return process.env.SUPER_LLM_MODEL || (process.env.PARALLAX_ASSISTANT_PROVIDER === "codex-subscription" ? "gpt-6-astra" : "claude-opus-5-5");
}

export const MODES = [
  { id: "ask", name: "Ask before generating", description: "Shows the model, prompt and price, and waits for your yes before generation." },
  { id: "auto", name: "Generate without asking", description: "Starts the generations you request straight away; provider usage charges apply." },
] as const;
export type Mode = "ask" | "auto";
