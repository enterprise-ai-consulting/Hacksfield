import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./db";
import { ApiError, badRequest } from "./errors";

interface StoredSettings {
  decartApiKey?: string;
  apiKey?: string;
  speechApiKey?: string;
  audioApiKey?: string;
  speechAppId?: string;
  dailyBudgetUsd?: number;
  tosAccessKeyId?: string;
  tosSecretAccessKey?: string;
  tosBucket?: string;
}

/** Membership-free unless explicitly running the upstream compatibility test mode. */
export const isPersonalMode = () => process.env.PARALLAX_PERSONAL_MODE !== "0";
const filename = () => path.join(dataDir(), "provider-settings.json");

function storedSettings(): StoredSettings {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filename(), "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid settings");
    return value as StoredSettings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ApiError(503, "provider_configuration", "Generation settings could not be read. Check the local provider settings file.");
  }
}

/** Server only: callers must never serialize this object to a browser or log. */
export function providerSettings() {
  const stored = storedSettings();
  const decartApiKey = typeof stored.decartApiKey === "string" && stored.decartApiKey ? stored.decartApiKey : (process.env.DECART_API_KEY ?? "").trim();
  const apiKey = typeof stored.apiKey === "string" && stored.apiKey ? stored.apiKey : (process.env.BYTEPLUS_API_KEY ?? "").trim();
  const speechApiKey = typeof stored.speechApiKey === "string" && stored.speechApiKey ? stored.speechApiKey : (process.env.BYTEPLUS_SPEECH_API_KEY ?? "").trim();
  const audioApiKey = typeof stored.audioApiKey === "string" && stored.audioApiKey ? stored.audioApiKey : (process.env.BYTEPLUS_AUDIO_API_KEY ?? "").trim();
  const speechAppId = stored.speechAppId ?? (process.env.BYTEPLUS_SPEECH_APP_ID ?? "").trim();
  if (typeof speechAppId !== "string" || (speechAppId && !/^\d{6,32}$/.test(speechAppId))) throw new ApiError(503, "provider_configuration", "Set a valid legacy Speech APP ID or leave it blank when using an API key.");
  const dailyBudgetUsd = stored.dailyBudgetUsd ?? Number(process.env.BYTEPLUS_DAILY_BUDGET_USD ?? process.env.TREG_DAILY_BUDGET_USD ?? 5);
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd < 0) throw new ApiError(503, "provider_configuration", "Set a valid daily generation budget.");
  const tosAccessKeyId = stored.tosAccessKeyId || process.env.BYTEPLUS_TOS_ACCESS_KEY_ID || "";
  const tosSecretAccessKey = stored.tosSecretAccessKey || process.env.BYTEPLUS_TOS_SECRET_ACCESS_KEY || "";
  const tosBucket = stored.tosBucket || process.env.BYTEPLUS_TOS_BUCKET || "";
  return { apiKey, speechApiKey, audioApiKey, decartApiKey, speechAppId, dailyBudgetUsd, tosAccessKeyId, tosSecretAccessKey, tosBucket };
}

export function requireDecartKey(): string {
  const { decartApiKey } = providerSettings();
  if (!decartApiKey) throw new ApiError(503, "provider_configuration", "Add your Decart developer API key in Generation settings to use Lucy models.");
  return decartApiKey;
}

export function requireStorage() {
  const { tosAccessKeyId, tosSecretAccessKey, tosBucket } = providerSettings();
  if (!tosAccessKeyId || !tosSecretAccessKey || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(tosBucket)) throw new ApiError(503, "provider_configuration", "Connect private BytePlus TOS storage in Generation settings to use uploaded-video tools. Images, new videos, music and speech work without it.");
  return { tosAccessKeyId, tosSecretAccessKey, tosBucket };
}

export function requireBytePlusKey(): string {
  const { apiKey } = providerSettings();
  if (!apiKey) throw new ApiError(503, "provider_configuration", "Add your BytePlus ModelArk platform API key in Generation settings first. A Coding Plan key does not cover image or video generation.");
  return apiKey;
}

export function requireSpeechKey(): string {
  const { speechApiKey } = providerSettings();
  if (!speechApiKey) throw new ApiError(503, "provider_configuration", "Add your BytePlus Seed Speech API key in Generation settings first. Seed Speech uses a separate key from ModelArk and Coding Plan.");
  return speechApiKey;
}

export function requireBytePlusCredentials(endpoint: string): string {
  if (endpoint.startsWith("byteplus.audio.")) return requireAudioKey();
  return endpoint.startsWith("byteplus.speech.") ? requireSpeechKey() : requireBytePlusKey();
}

export function requireAudioKey(): string {
  const { audioApiKey, speechApiKey, speechAppId } = providerSettings();
  const key = audioApiKey || (!speechAppId ? speechApiKey : "");
  if (!key) throw new ApiError(503, "provider_configuration", "Seed Audio 1.0 needs a modern Seed Speech API key in Generation settings. Legacy APP ID credentials remain available for speech. No paid music model was substituted.");
  return key;
}

/** An empty password field means keep the existing key. The file stays owner-readable only. */
export function saveProviderSettings(input: { apiKey?: unknown; speechApiKey?: unknown; audioApiKey?: unknown; decartApiKey?: unknown; speechAppId?: unknown; dailyBudgetUsd?: unknown; tosAccessKeyId?: unknown; tosSecretAccessKey?: unknown; tosBucket?: unknown }) {
  const next = storedSettings();
  for (const field of ["apiKey", "speechApiKey", "audioApiKey", "decartApiKey", "tosAccessKeyId", "tosSecretAccessKey"] as const) {
    const value = input[field];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || !/^[\x21-\x7e]{8,4096}$/.test(value)) throw badRequest("Enter a valid API key without spaces or line breaks.");
    next[field] = value;
  }
  if (input.tosBucket !== undefined && input.tosBucket !== "") {
    if (typeof input.tosBucket !== "string" || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.tosBucket)) throw badRequest("Enter a valid private BytePlus TOS bucket name.");
    next.tosBucket = input.tosBucket;
  }
  if (input.speechAppId !== undefined) {
    if (typeof input.speechAppId !== "string" || (input.speechAppId && !/^\d{6,32}$/.test(input.speechAppId))) throw badRequest("Enter a valid legacy Speech APP ID, or leave it blank for an API key.");
    next.speechAppId = input.speechAppId;
  }
  if (input.dailyBudgetUsd !== undefined) {
    if (typeof input.dailyBudgetUsd !== "number" || !Number.isFinite(input.dailyBudgetUsd) || input.dailyBudgetUsd < 0) throw badRequest("Enter a daily budget of zero or more US dollars.");
    next.dailyBudgetUsd = input.dailyBudgetUsd;
  }
  const destination = filename();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(next) + "\n", { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
