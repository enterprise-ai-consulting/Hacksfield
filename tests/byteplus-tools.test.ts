import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultModel, getModel, quoteJob, resolveValues } from "../src/registry";
import { apps } from "../src/server/apps/catalog";
import { checkCatalog } from "../src/server/apps/check";
import { remixModes } from "../src/content/remix";
import { checkFormats, FORMATS } from "../src/server/ads/formats";

test("the direct installation offers the current Seedream and Seedance models by default", () => {
  assert.equal(defaultModel("image")?.id, "byteplus-seedream-5.5");
  assert.equal(defaultModel("video")?.id, "byteplus-seedance-2.5");
  assert.equal(defaultModel("music")?.id, "byteplus-seedance-2.5-music");
});

test("Seedream 5.5 quotes both input images and the chosen output pixel tier", () => {
  const model = getModel("byteplus-seedream-5.5")!;
  assert.ok(model);
  for (const [resolution, expected] of [["1K", 0.028], ["2K", 0.043]] as const) {
    const values = resolveValues(model, { aspect: "4:5", resolution }, { refs: 1 });
    const q = quoteJob(model, { prompt: "A product photo", values, filled: { refs: 1 }, count: 1 });
    assert.ok(Math.abs(q.usdPerJob - expected) < 1e-9);
    assert.equal(q.request.body.output_format, "png");
    assert.equal(q.request.body.sequential_image_generation, undefined);
  }
});

test("native layer decomposition keeps its own bounded request and reservation", () => {
  const model = getModel("byteplus-seedream-5.5-layers")!;
  assert.ok(model);
  const q = quoteJob(model, { prompt: "Separate foreground, lettering and background", values: resolveValues(model, {}, { refs: 1 }), filled: { refs: 1 }, count: 1 });
  assert.equal(q.request.body.layer_decomposition, true);
  assert.deepEqual(q.request.body.layer_decomposition_options, { max_images: 8 });
  assert.equal(q.request.body.background, undefined);
  assert.ok(q.usdPerJob >= 8 * 0.035 + 0.008 - 1e-9);
});

test("the existing app catalog routes its runnable tools through BytePlus", () => {
  assert.equal(apps.filter(a => a.status === "available").length, 72);
  assert.deepEqual(checkCatalog(apps), []);
  for (const app of apps.filter(a => a.status === "available")) {
    assert.ok(app.modelId?.startsWith("byteplus-") || app.modelId?.startsWith("local-"), `${app.id} still uses ${app.modelId}`);
  }
  assert.ok(remixModes.every(mode => mode.modelId.startsWith("byteplus-")));
  assert.equal(apps.find(app => app.id === "jingle")?.modelId, "byteplus-seedance-2.5-music");
});

test("all ad formats have valid native BytePlus recipes and usage reservations", () => {
  assert.deepEqual(checkFormats(), []);
  assert.ok(FORMATS.every(format => format.modelId.startsWith("byteplus-") && (!format.speech || format.speech.modelId.startsWith("byteplus-"))));
});

test("video edits and extension use Seedance's explicit native task constraints", () => {
  const source = { url: "asset:owned", data: "asset-b64:owned", mime: "video/mp4", duration: 5 };
  for (const task of ["edit", "extend", "reference"] as const) {
    const m = getModel(`byteplus-seedance-2.5-${task}`)!;
    assert.ok(m);
    const q = quoteJob(m, { prompt: `${task} this clip`, values: resolveValues(m, {}, { source: 1 }), media: { source: [source] }, filled: { source: 1 }, count: 1 });
    assert.equal(q.request.body.omni_reference_task_type, task);
    if (task !== "reference") assert.equal(q.request.body.ratio, "adaptive");
    if (task === "edit") { assert.equal(q.request.body.duration, -1); assert.ok(Math.abs(q.usdPerJob - 1) < 1e-9); }
    assert.match(JSON.stringify(q.request.body.content), /reference_video/);
  }
});
