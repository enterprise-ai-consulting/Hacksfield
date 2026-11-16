import type { CatalogEndpoint } from "./quote";

/** Direct BytePlus prices: https://docs.byteplus.com/en/docs/modelark/model-pricing */
export const byteplusEndpoints: Record<string, CatalogEndpoint> = {
  "byteplus.image.seedream-4-5": {
    provider: "byteplus", platform: null, name: "Seedream 4.5", method: "POST", path: "/images/generations", params: [],
    cost: { value: 0.04, unit: "call" }, async: null,
  },
  "byteplus.speech.seed-tts-2-0": {
    provider: "byteplus", platform: null, name: "Seed Speech 2.0", method: "POST", path: "/tts/unidirectional", params: [],
    cost: { value: 30, per: 1_000_000, unit: "character" }, async: null,
  },
  "byteplus.audio.seed-audio-1-0": {
    provider: "byteplus", platform: null, name: "Seed Audio 1.0", method: "POST", path: "/tts/create", params: [],
    // Natural-language timing is a request; reserve the provider's full 120-second maximum.
    cost: { value: 0.30, estimated: true, settle: "usage" }, async: null,
  },
  "byteplus.video.seedance-2-0": {
    provider: "byteplus", platform: null, name: "Seedance 2.0", method: "POST", path: "/contents/generations/tasks", params: [],
    // Reserve above the published 24fps token estimate. Actual usage settles at $7.00/M tokens.
    // No video reference input is offered, so the lower input-video rate never applies.
    cost: { estimated: true, settle: "usage", table: [
      { when: { resolution: "480p" }, value: 0.10, times: "duration" },
      { when: { resolution: "720p" }, value: 0.20, times: "duration" },
    ] },
    async: { interval: 5, statusPath: "status", success: ["succeeded"], failure: ["failed", "cancelled", "expired"], resultPath: "content.video_url" },
  },
};

// The soundtrack is produced by the same paid video task, then extracted locally.
byteplusEndpoints["byteplus.music.seedance-2-0"] = { ...byteplusEndpoints["byteplus.video.seedance-2-0"], name: "Seedance Soundtrack" };

for (const [version, price] of [["4-0", 0.03], ["5-0-lite", 0.035]] as const) {
  byteplusEndpoints[`byteplus.image.seedream-${version}`] = {
    ...byteplusEndpoints["byteplus.image.seedream-4-5"], name: `Seedream ${version}`, cost: { value: price, unit: "call" },
  };
}

for (const [version, rate] of [["1-0-pro-fast", 0.02], ["1-0-pro", 0.05]] as const) {
  byteplusEndpoints[`byteplus.video.seedance-${version}`] = {
    ...byteplusEndpoints["byteplus.video.seedance-2-0"], name: `Seedance ${version}`,
    cost: { estimated: true, settle: "usage", table: [
      { when: { resolution: "480p" }, value: rate, times: "duration" },
      { when: { resolution: "720p" }, value: rate * 2, times: "duration" },
    ] },
  };
}

byteplusEndpoints["byteplus.image.seedream-5-5"] = {
  ...byteplusEndpoints["byteplus.image.seedream-4-5"], name: "Seedream 5.5",
  cost: { inputImageUsd: 0.008, pixelTiers: [{ maxPixels: 2601123.84, value: 0.02 }, { maxPixels: 4624220.16, value: 0.035 }] },
};
byteplusEndpoints["byteplus.image.seedream-5-5-layers"] = {
  ...byteplusEndpoints["byteplus.image.seedream-5-5"], name: "Seedream 5.5 Layers",
  cost: { ...byteplusEndpoints["byteplus.image.seedream-5-5"].cost, estimated: true, settle: "usage" },
};
byteplusEndpoints["byteplus.video.seedance-2-5"] = {
  ...byteplusEndpoints["byteplus.video.seedance-2-0"], name: "Seedance 2.5",
  cost: { estimated: true, settle: "usage", table: [
    { when: { resolution: "480p" }, value: 0.20, times: "duration" },
    { when: { resolution: "720p" }, value: 0.40, times: "duration" },
    { when: { resolution: "1080p" }, value: 0.80, times: "duration" },
  ] },
};
byteplusEndpoints["byteplus.music.seedance-2-5"] = { ...byteplusEndpoints["byteplus.video.seedance-2-5"], name: "Seedance 2.5 Soundtrack" };
