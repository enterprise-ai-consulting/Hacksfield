import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { defaultModel, getModel, modelsFor, quoteJob, resolveValues } from "../src/registry";
import { providerSettings, saveProviderSettings } from "../src/server/provider-settings";
import { classify, redact, tregCall, tregTask } from "../src/server/treg";
import { verifyDecartKey, validateDecartSource, validateDecartImage } from "../src/server/decart";
import { createGuest } from "../src/server/auth";
import { saveAsset } from "../src/server/assets";
import { submitJobs } from "../src/server/jobs";
import { get, run } from "../src/server/db";

const scratch = mkdtempSync(path.join(tmpdir(), "parallax-decart-"));
process.env.PARALLAX_DATA_DIR = scratch;
process.env.DECART_API_KEY = "dct_offline-test-never-send";
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; delete process.env.DECART_API_KEY; rmSync(scratch, { recursive: true, force: true }); });

test("Decart models appear alongside BytePlus without changing defaults; price uses source duration", () => {
  assert.equal(defaultModel("image")?.id, "byteplus-seedream-5.5");
  assert.ok(modelsFor("video-edit").some(m => m.id === "decart-lucy-2.6"));
  for (const [id, rate] of [["decart-lucy-2.6", 0.04], ["decart-lucy-vton-3.6", 0.04], ["decart-lucy-restyle-2", 0.01]] as const) {
    const model = getModel(id)!;
    assert.ok(model, id);
    const q = quoteJob(model, { prompt: "Replace the jacket", values: resolveValues(model, {}, { source: 1 }), media: { source: [{ url: "asset:owned", data: "asset-b64:owned", mime: "video/mp4", duration: 5.2 }] }, filled: { source: 1 }, count: 1 });
    assert.equal(q.usdPerJob, 6 * rate); // reserve whole seconds, never undercount a partial second
    assert.match(String(q.request.body.data), /^data:video\/mp4;base64,asset-b64:/);
  }
});

test("Decart credentials remain owner-only, blank preserves key, and errors redact it", () => {
  saveProviderSettings({ decartApiKey: "dct_saved-offline-test" } as Parameters<typeof saveProviderSettings>[0]);
  saveProviderSettings({ decartApiKey: "" } as Parameters<typeof saveProviderSettings>[0]);
  assert.equal((providerSettings() as { decartApiKey?: string }).decartApiKey, "dct_saved-offline-test");
  assert.equal(statSync(path.join(scratch, "provider-settings.json")).mode & 0o777, 0o600);
  assert.ok(readFileSync(path.join(scratch, "provider-settings.json"), "utf8").includes("dct_saved-offline-test"));
  assert.doesNotMatch(redact("oops dct_saved-offline-test"), /dct_saved/);
});

test("image editing uses private multipart files and the fixed Decart origin", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.decart.ai/v1/generate/lucy-image-2");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "dct_saved-offline-test");
    assert.equal(init?.redirect, "error");
    const form = init?.body as FormData;
    assert.equal(form.get("prompt"), "A sunset");
    assert.equal(form.get("_parallax_duration"), null);
    assert.equal(await (form.get("data") as File).text(), "image bytes");
    assert.equal(form.get("resolution"), "720p");
    return new Response("image output", { headers: { "content-type": "image/png" } });
  };
  const reply = await tregCall("decart.image.lucy-image-2", { body: { data: `data:image/png;base64,${Buffer.from("image bytes").toString("base64")}`, prompt: "A sunset", resolution: "720p", _parallax_duration: 99 } });
  assert.equal(reply.provider, "decart");
  assert.equal(reply.costMicro, 20000);
  assert.equal(reply.bytes?.toString(), "image output");
});

test("queued video status and protected content download use the key without exposing a URL", async () => {
  globalThis.fetch = async () => Response.json({ job_id: "job-offline-123" });
  const reply = await tregCall("decart.video.lucy-2.6", { body: { data: "data:video/mp4;base64,dmlkZW8=", prompt: "Rain", resolution: "720p", _parallax_duration: 6 } });
  assert.equal(reply.callId, "decart:job-offline-123");
  assert.equal(reply.costMicro, 240000);
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push(String(input));
    assert.equal(new Headers(init?.headers).get("x-api-key"), "dct_saved-offline-test");
    return String(input).endsWith("/content") ? new Response("mp4 bytes", { headers: { "content-type": "video/mp4" } }) : Response.json({ status: "completed" });
  };
  const task = await tregTask(reply.callId!, "decart.video.lucy-2.6", { _parallax_duration: 6 });
  assert.equal(task.status, "completed");
  assert.equal(task.cost_micro, 240000);
  assert.equal((task as { bytes?: Buffer }).bytes?.toString(), "mp4 bytes");
  assert.equal(task.result_url, null);
  assert.deepEqual(seen, ["https://api.decart.ai/v1/jobs/job-offline-123", "https://api.decart.ai/v1/jobs/job-offline-123/content"]);
});

test("invalid media and task IDs are refused before any network call", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Must not connect"); };
  await assert.rejects(tregCall("decart.image.lucy-image-2", { body: { data: "https://example.com/private", prompt: "Edit" } }));
  await assert.rejects(tregTask("decart:../../other", "decart.video.lucy-2.6"));
  assert.equal(calls, 0);
});

test("Decart errors never trigger automatic paid resubmissions", async () => {
  globalThis.fetch = async () => Response.json({ detail: "busy dct_saved-offline-test" }, { status: 503 });
  const reply = await tregCall("decart.image.lucy-image-2", { body: { data: "data:image/png;base64,aW1hZ2U=", prompt: "Edit", resolution: "480p" } });
  const failure = classify(reply);
  assert.equal(failure.kind, "provider");
  assert.doesNotMatch(failure.message + failure.detail, /dct_saved/);
});

test("replacement keys are checked with a free read-only balance request", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.decart.ai/v1/credits");
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    return Response.json({ credits: 1000 });
  };
  assert.deepEqual(await verifyDecartKey("dct_replacement-fixture"), { credits: 1000 });
  globalThis.fetch = async () => Response.json({ detail: "denied" }, { status: 401 });
  await assert.rejects(verifyDecartKey("dct_invalid-fixture"), /rejected/);
  assert.equal(providerSettings().decartApiKey, "dct_saved-offline-test");
});

test("unsupported video references stop before upload or spend", () => {
  const source = { mime: "video/mp4", bytes: 10000, duration: 5, width: 1920, height: 1080 };
  assert.doesNotThrow(() => validateDecartSource(source, "decart.video.lucy-2.6"));
  for (const change of [{ duration: null }, { duration: 31 }, { bytes: 30_000_001 }, { mime: "video/quicktime" }, { width: 1080 }]) {
    assert.throws(() => validateDecartSource({ ...source, ...change }, "decart.video.lucy-2.6"));
  }
});

test("unsupported Decart image formats stop before money is reserved", () => {
  assert.doesNotThrow(() => validateDecartImage({ mime: "image/png", bytes: 100 }));
  assert.throws(() => validateDecartImage({ mime: "image/avif", bytes: 100 }));
  assert.throws(() => validateDecartImage({ mime: "image/png", bytes: 30_000_001 }));
});

test("Decart enforces the common personal media budget and asset ownership before enqueue", async () => {
  process.env.PARALLAX_PERSONAL_MODE = "1";
  const owner = createGuest(), other = createGuest();
  const image = await saveAsset({ userId: owner.id, source: "upload", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9M8AAAAASUVORK5CYII=", "base64") });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Must not send"); };
  const input = { modelId: "decart-lucy-image-2", prompt: "Edit", inputs: { source: [image.id] } };
  saveProviderSettings({ dailyBudgetUsd: 0 });
  assert.throws(() => submitJobs(owner, input), /rolling daily budget/);
  assert.throws(() => submitJobs(other, input), /not found|does not exist/i);
  // A prior BytePlus reservation consumes the same cap for a new Decart request.
  saveProviderSettings({ dailyBudgetUsd: 0.03 });
  run("INSERT INTO jobs (id,user_id,kind,surface,model_id,status,prompt,params,inputs,endpoint,request,expect_count,cost,est_usd,meta,created_at) VALUES ('job_prior',?,'image','image','byteplus-seedream-5.5','succeeded','x','{}','{}','byteplus.image.seedream-5-5','{}',1,0,0.02,'{}',?)", owner.id, Date.now());
  assert.throws(() => submitJobs(owner, input), /rolling daily budget/);
  assert.equal(get<{ n: number }>("SELECT count(*) n FROM jobs WHERE model_id LIKE 'decart-%'")?.n, 0);
  assert.equal(calls, 0);
  delete process.env.PARALLAX_PERSONAL_MODE;
});
