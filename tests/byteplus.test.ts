import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { callBytePlus, getBytePlusTask } from "../src/server/byteplus";
import { providerSettings, saveProviderSettings } from "../src/server/provider-settings";
import { defaultModel, getModel, quoteJob, resolveValues } from "../src/registry";
import { mediaFromTask } from "../src/server/extract";
import { sniff } from "../src/server/media";
import { generationPrice } from "../src/config/installation";
import { redact } from "../src/server/treg";

const scratch = mkdtempSync(path.join(tmpdir(), "parallax-byteplus-"));
process.env.PARALLAX_DATA_DIR = scratch;
process.env.BYTEPLUS_API_KEY = "test-platform-key-never-send";
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BYTEPLUS_API_KEY;
  rmSync(scratch, { recursive: true, force: true });
});

test("Seedream 5.5 sends native transparency without obsolete sequential options and charges its pixel tier", async () => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "dola-seedream-5-5-261028");
    assert.equal(body.background, "transparent");
    assert.equal(body.sequential_image_generation, undefined);
    return Response.json({ data: [{ b64_json: "example", size: "1024x1024" }], usage: { generated_images: 1 } });
  };
  const reply = await callBytePlus("byteplus.image.seedream-5-5", { body: { image: ["example"], size: "2048x2048", background: "transparent" } });
  assert.equal(reply.costMicro, 28000);
});

test("Seedance 2.5 strips internal reservation metadata and uses its own native model", async () => {
  process.env.BYTEPLUS_VIDEO_MODEL = "ep-old-bound-2-0";
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "dreamina-seedance-2-5-260628");
      assert.equal(body.duration, -1);
      assert.equal(body.omni_reference_task_type, "edit");
      assert.equal(body._parallax_reservation_seconds, undefined);
      return Response.json({ id: "cgt-edit" });
    };
    await callBytePlus("byteplus.video.seedance-2-5", { body: { duration: -1, omni_reference_task_type: "edit", _parallax_reservation_seconds: 5 } });
    globalThis.fetch = async () => Response.json({ status: "succeeded", usage: { completion_tokens: 100000 } });
    const task = await getBytePlusTask("byteplus:cgt-edit", "byteplus.video.seedance-2-5", { resolution: "480p", content: [{ type: "video_url" }] });
    assert.equal(task.cost_micro, 640000);
  } finally { delete process.env.BYTEPLUS_VIDEO_MODEL; }
});

test("native Seedream request preserves the chosen aspect ratio and uses inline references", () => {
  const model = getModel("byteplus-seedream-4.5")!;
  assert.ok(model, "the native image model must exist");
  const values = resolveValues(model, { aspect: "16:9" }, { refs: 1 });
  const quote = quoteJob(model, { prompt: "A lighthouse", values, filled: { refs: 1 }, count: 2 });
  assert.equal(quote.jobs, 2);
  assert.equal(quote.usdPerJob, 0.04);
  assert.equal(quote.request.body.size, "2560x1440");
  assert.match(JSON.stringify(quote.request.body.image), /data:image\/png;base64,asset-b64:/);
});

test("image generation authenticates only to BytePlus and records provider cost without a markup", async () => {
  let target = "";
  globalThis.fetch = async (input, init) => {
    target = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-platform-key-never-send");
    assert.equal(new Headers(init?.headers).has("x-treg-token"), false);
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "seedream-4-5-251128");
    assert.equal(body.response_format, "b64_json");
    return Response.json({ data: [{ b64_json: "sample" }], usage: { generated_images: 1 } });
  };
  const reply = await callBytePlus("byteplus.image.seedream-4-5", { body: { prompt: "A lighthouse", size: "2048x2048" } });
  assert.equal(target, "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations");
  assert.equal(reply.ok, true);
  assert.equal(reply.costMicro, 40000);
  assert.equal(reply.isAsync, false);
});

test("Seedance submission and polling preserve the real task id and usage", async () => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "dreamina-seedance-2-0-260128");
    return Response.json({ id: "cgt-test-task" });
  };
  const submitted = await callBytePlus("byteplus.video.seedance-2-0", { body: { content: [{ type: "text", text: "Waves" }], duration: 5 } });
  assert.equal(submitted.callId, "byteplus:cgt-test-task");
  assert.equal(submitted.isAsync, true);
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-test-task");
    return Response.json({ id: "cgt-test-task", status: "succeeded", content: { video_url: "https://example.com/video.mp4" }, usage: { completion_tokens: 100000 } });
  };
  const task = await getBytePlusTask(submitted.callId!);
  assert.equal(task.state, "succeeded");
  assert.equal(task.result, "https://example.com/video.mp4");
  assert.equal(task.cost_micro, 700000);
});

test("missing credentials stop before any network request", async () => {
  delete process.env.BYTEPLUS_API_KEY;
  globalThis.fetch = async () => assert.fail("missing credentials must never reach the provider");
  await assert.rejects(callBytePlus("byteplus.image.seedream-4-5", { body: {} }), /platform API key/i);
  process.env.BYTEPLUS_API_KEY = "test-platform-key-never-send";
});

test("local key storage is private and an empty password field keeps the saved key", () => {
  saveProviderSettings({ apiKey: "test-saved-secret", dailyBudgetUsd: 2 });
  saveProviderSettings({ apiKey: "", dailyBudgetUsd: 3 });
  assert.equal(providerSettings().apiKey, "test-saved-secret");
  assert.equal(providerSettings().dailyBudgetUsd, 3);
  const filename = path.join(scratch, "provider-settings.json");
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  assert.ok(readFileSync(filename, "utf8").includes("test-saved-secret"));
  assert.throws(() => saveProviderSettings({ dailyBudgetUsd: -1 }), /budget/i);
  assert.throws(() => saveProviderSettings({ apiKey: "bad\nkey" }), /key/i);
});

test("speech uses its own key and joins streamed audio only after a completion marker", async () => {
  saveProviderSettings({ speechApiKey: "test-speech-secret" });
  const model = getModel("byteplus-seed-speech-2.0")!;
  assert.ok(model, "native speech must be registered");
  const quote = quoteJob(model, { prompt: "Hello world", values: resolveValues(model, {}, {}), filled: {}, count: 1 });
  assert.equal(quote.usdPerJob, 11 * 30 / 1e6);
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Api-Key"), "test-speech-secret");
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.get("X-Api-Resource-Id"), "seed-tts-2.0");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.req_params.text, "Hello world");
    assert.equal(payload.req_params.speaker, "en_female_skye_uranus_bigtts");
    return new Response([JSON.stringify({ code: 0, data: Buffer.from("ID3-first").toString("base64") }), JSON.stringify({ code: 0, data: Buffer.from("-second").toString("base64") }), JSON.stringify({ code: 20000000, data: null })].join("\n"));
  };
  const reply = await callBytePlus(quote.request.endpoint, { body: quote.request.body });
  assert.equal(reply.ok, true);
  assert.equal(reply.contentType, "audio/mpeg");
  assert.equal(reply.bytes?.toString(), "ID3-first-second");
  assert.equal(reply.costMicro, 330);
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: "SUQzZmlyc3Q=" }));
  await assert.rejects(callBytePlus(quote.request.endpoint, { body: quote.request.body }), /incomplete|did not complete/i);
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 45000000, message: "speaker permission denied" }));
  const refused = await callBytePlus(quote.request.endpoint, { body: quote.request.body });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 403);
});

test("missing Speech key does not fall back to a ModelArk credential", async () => {
  saveProviderSettings({ speechApiKey: "" }); // blank preserves an existing key
  const saved = readFileSync(path.join(scratch, "provider-settings.json"), "utf8");
  try {
    rmSync(path.join(scratch, "provider-settings.json"));
    globalThis.fetch = async () => assert.fail("a platform key cannot authenticate the Speech service");
    await assert.rejects(callBytePlus("byteplus.speech.seed-tts-2-0", { body: { text: "Hello" } }), /Speech API key/);
  } finally {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(scratch, "provider-settings.json"), saved, { mode: 0o600 });
  }
});

test("legacy Speech application credentials use the documented header pair", async () => {
  saveProviderSettings({ speechApiKey: "test-legacy-speech-token", speechAppId: "1234567890" });
  try {
    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Api-App-Id"), "1234567890");
      assert.equal(headers.get("X-Api-Access-Key"), "test-legacy-speech-token");
      assert.equal(headers.has("X-Api-Key"), false);
      assert.equal(headers.has("Authorization"), false);
      return new Response(JSON.stringify({ code: 0, data: Buffer.from("ID3-test-audio").toString("base64") }) + "\n" + JSON.stringify({ code: 20000000 }));
    };
    const reply = await callBytePlus("byteplus.speech.seed-tts-2-0", { body: { text: "Hello", speaker: "en_female_skye_uranus_bigtts" } });
    assert.equal(reply.ok, true);
    assert.throws(() => saveProviderSettings({ speechAppId: "not-an-app-id" }), /APP ID/);
  } finally {
    saveProviderSettings({ speechAppId: "" });
  }
  assert.equal(providerSettings().speechAppId, "");
});

test("music requests a bounded Seedance soundtrack with audio enabled", async () => {
  const model = getModel("byteplus-seedance-music")!;
  assert.ok(model, "native music must be registered");
  const quote = quoteJob(model, { prompt: "Warm acoustic guitar", values: resolveValues(model, { duration: 8 }, {}), filled: {}, count: 1 });
  assert.equal(model.output, "audio");
  assert.equal(quote.usdPerJob, 0.8);
  assert.equal(quote.request.body.generate_audio, true);
  assert.equal(quote.request.body.duration, 8);
  assert.match(JSON.stringify(quote.request.body.content), /Warm acoustic guitar/);
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).model, "dreamina-seedance-2-0-260128");
    return Response.json({ id: "cgt-music-test" });
  };
  const reply = await callBytePlus(quote.request.endpoint, { body: quote.request.body });
  assert.equal(reply.callId, "byteplus:cgt-music-test");
  assert.equal(reply.isAsync, true);
});

test("small speech prices never appear as a free generation", () => {
  assert.equal(generationPrice({ usdPerJob: 0.00003, jobs: 1, metered: false }), "$0.00003");
  assert.equal(generationPrice({ usdPerJob: 0.0006, jobs: 1, metered: false }), "$0.00060");
});

test("a music result extracts real audio and refuses a silent video", async () => {
  const file = path.join(scratch, "tone.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "0.4", "-c:v", "libx264", "-c:a", "aac", file]);
  const task = { result: `data:video/mp4;base64,${readFileSync(file).toString("base64")}` } as Awaited<ReturnType<typeof getBytePlusTask>>;
  const [audio] = await mediaFromTask("byteplus.music.seedance-2-0", task, "audio", 1);
  assert.equal(sniff(audio)?.kind, "audio");
  assert.equal(sniff(audio)?.mime, "audio/mpeg");
  const silent = path.join(scratch, "silent.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-c:v", "copy", silent]);
  task.result = `data:video/mp4;base64,${readFileSync(silent).toString("base64")}`;
  await assert.rejects(mediaFromTask("byteplus.music.seedance-2-0", task, "audio", 1), /audio|soundtrack/i);
});

test("the video quality default keeps the free-allowance alternative available", () => {
  assert.equal(defaultModel("video")?.id, "byteplus-seedance-2.5");
  const model = getModel("byteplus-seedance-1.0-pro-fast")!;
  assert.ok(model);
  assert.equal(model.slots.some((slot) => slot.id === "end"), false);
  const quote = quoteJob(model, { prompt: "Waves", values: resolveValues(model, { duration: 15 }, {}), filled: {}, count: 1 });
  assert.equal(quote.request.body.duration, 12);
  assert.equal(quote.request.body.resolution, "480p");
  assert.equal(quote.request.body.generate_audio, undefined);
});

test("free-allowance video routes cannot be redirected to the paid Seedance 2 endpoint", async () => {
  process.env.BYTEPLUS_VIDEO_MODEL = "ep-paid-seedance-2";
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(JSON.parse(String(init?.body)).model, "seedance-1-0-pro-fast-251015");
      return Response.json({ id: "cgt-free-allowance" });
    };
    const reply = await callBytePlus("byteplus.video.seedance-1-0-pro-fast", { body: { duration: 5 } });
    assert.equal(reply.callId, "byteplus:cgt-free-allowance");
    globalThis.fetch = async () => Response.json({ status: "succeeded", usage: { completion_tokens: 100000 } });
    const settled = await getBytePlusTask(reply.callId!, "byteplus.video.seedance-1-0-pro-fast");
    assert.equal(settled.cost_micro, 100000);
  } finally {
    delete process.env.BYTEPLUS_VIDEO_MODEL;
  }
});

test("additional image pools keep their own native model and listed price", async () => {
  for (const [id, native, cost] of [["byteplus-seedream-4.0", "seedream-4-0-250828", 30000], ["byteplus-seedream-5.0-lite", "seedream-5-0-lite-260128", 35000]] as const) {
    const model = getModel(id)!;
    assert.ok(model);
    const quote = quoteJob(model, { prompt: "A mountain", values: resolveValues(model, {}, {}), filled: {}, count: 1 });
    assert.equal(quote.usdPerJob, cost / 1e6);
    globalThis.fetch = async (_input, init) => {
      assert.equal(JSON.parse(String(init?.body)).model, native);
      return Response.json({ data: [{ b64_json: "sample" }] });
    };
    assert.equal((await callBytePlus(quote.request.endpoint, { body: quote.request.body })).costMicro, cost);
  }
});

test("the music default keeps Audio 1.0 available with a bounded budget reservation", async () => {
  assert.equal(defaultModel("music")?.id, "byteplus-seedance-2.5-music");
  const model = getModel("byteplus-seed-audio-1.0")!;
  const quote = quoteJob(model, { prompt: "Gentle piano", values: resolveValues(model, { duration: 10 }, {}), filled: {}, count: 1 });
  assert.equal(quote.usdPerJob, 0.3); // provider can output up to 120 seconds
  assert.match(String(quote.request.body.text_prompt), /Gentle piano/);
  saveProviderSettings({ audioApiKey: "test-modern-audio-key" });
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/tts\/create$/);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Api-Key"), "test-modern-audio-key");
    assert.equal(headers.has("X-Api-App-Id"), false);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "seed-audio-1.0");
    assert.equal(body.audio_config.format, "mp3");
    return Response.json({ code: 0, audio: Buffer.from("ID3-audio").toString("base64"), original_duration: 10, duration: 10 });
  };
  const reply = await callBytePlus(quote.request.endpoint, { body: quote.request.body });
  assert.equal(reply.ok, true);
  assert.equal(reply.bytes?.toString(), "ID3-audio");
  assert.equal(reply.costMicro, 25000);
  globalThis.fetch = async () => Response.json({ audio: "SUQzYXVkaW8=", original_duration: 999 });
  await assert.rejects(callBytePlus(quote.request.endpoint, { body: quote.request.body }), /unreadable|invalid|incomplete/i);
});

test("Audio 1.0 credentials cannot leak through provider error messages", () => {
  saveProviderSettings({ audioApiKey: "test-audio-key-must-not-leak" });
  assert.equal(redact("Provider echoed test-audio-key-must-not-leak"), "Provider echoed [key]");
});
