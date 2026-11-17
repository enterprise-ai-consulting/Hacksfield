import { ApiError, publicRoute, readJson } from "@/server/http";
import { spentToday } from "@/server/jobs";
import { isPersonalMode, providerSettings, saveProviderSettings } from "@/server/provider-settings";
import type { NextRequest } from "next/server";
import { verifyBytePlusKey } from "@/server/byteplus";
import { verifyDecartKey } from "@/server/decart";
import { localMaintenanceRequest, teamSettingsAllowed } from "@/server/team-access";
import type { User } from "@/server/auth";

function localOnly(req: NextRequest, user: User | null) {
  if (teamSettingsAllowed(user)) return;
  if (!isPersonalMode() || !localMaintenanceRequest(req.headers)) {
    throw new ApiError(403, "forbidden", "Generation settings are available only to the studio owner or through local maintenance.");
  }
}

function view() {
  const settings = providerSettings();
  return {
    provider: "byteplus", configured: Boolean(settings.apiKey), speechConfigured: Boolean(settings.speechApiKey), audioConfigured: Boolean(settings.audioApiKey || (!settings.speechAppId && settings.speechApiKey)), speechAppId: settings.speechAppId,
    storageConfigured: Boolean(settings.tosAccessKeyId && settings.tosSecretAccessKey && settings.tosBucket), storageBucket: settings.tosBucket,
    decartConfigured: Boolean(settings.decartApiKey),
    assistant: process.env.PARALLAX_ASSISTANT_PROVIDER === "codex-subscription" ? "codex-subscription" : "demo",
    mode: process.env.BYTEPLUS_MODE === "mock" ? "demo" : "live",
    personalMode: true, dailyBudgetUsd: settings.dailyBudgetUsd, committedUsd: spentToday(),
    imageModel: "dola-seedream-5-5-261028",
    videoModel: "dreamina-seedance-2-5-260628",
    defaults: { image: "Seedream 5.5", video: "Seedance 2.5", speech: "Seed Speech 2.0", music: "Seedance 2.5 Soundtrack" },
  };
}

export const GET = publicRoute(({ req, user }) => {
  localOnly(req, user);
  return view();
});

export const POST = publicRoute(async ({ req, user }) => {
  localOnly(req, user);
  const input = await readJson(req, 32768);
  if (typeof input.apiKey === "string" && input.apiKey) await verifyBytePlusKey(input.apiKey);
  if (typeof input.decartApiKey === "string" && input.decartApiKey) await verifyDecartKey(input.decartApiKey);
  saveProviderSettings(input);
  return view();
});
