import assert from "node:assert/strict";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, mock, test } from "node:test";
import { createGuest } from "../src/server/auth";
import { saveAsset } from "../src/server/assets";
import { saveProviderSettings } from "../src/server/provider-settings";
import { downloadFile } from "../src/server/developer/downloads";
import { toolList } from "../src/server/developer/mcp";
import { listModels } from "../src/server/developer/service";

const scratch = mkdtempSync(path.join(tmpdir(), "parallax-downloads-"));
process.env.PARALLAX_DATA_DIR = scratch;
const objects = new Map<string, Buffer>();
let uploadFails = false;
mock.method(S3Client.prototype, "send", async (command: PutObjectCommand) => {
  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.ACL, undefined);
  if (uploadFails) throw new Error("private upstream detail must not escape");
  objects.set(command.input.Key!, Buffer.from(command.input.Body as Uint8Array));
  return { $metadata: { httpStatusCode: 200 } };
});
after(() => {
  mock.restoreAll();
  rmSync(scratch, { recursive: true, force: true });
});
saveProviderSettings({ tosAccessKeyId: "AKEXAMPLE", tosSecretAccessKey: "fixture-secret-never-send", tosBucket: "parallax-local-test" });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9M8AAAAASUVORK5CYII=", "base64");

test("a member cannot export another member's file", async () => {
  const owner = createGuest(), other = createGuest();
  const asset = await saveAsset({ userId: owner.id, source: "generated", bytes: png });
  const before = objects.size;
  await assert.rejects(downloadFile(other.id, asset.id), /not found|does not exist/i);
  assert.equal(objects.size, before);
});

test("finished media gets an HTTPS download limited to one private object for one hour", async () => {
  const owner = createGuest();
  const asset = await saveAsset({ userId: owner.id, source: "generated", bytes: png, title: "A private picture" });
  const result = await downloadFile(owner.id, asset.id);
  const url = new URL(result.file.url);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "parallax-local-test.tos-s3-ap-southeast-1.bytepluses.com");
  assert.match(url.pathname, /^\/parallax\/downloads\/[a-f0-9-]+\.png$/);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
  assert.match(url.searchParams.get("response-content-disposition")!, /attachment; filename="parallax-ast_.*\.png"/);
  assert.ok(Date.parse(result.file.expiresAt) > Date.now());
  assert.ok(Date.parse(result.file.expiresAt) <= Date.now() + 3_601_000);
  assert.equal(result.file.id, asset.id);
  assert.deepEqual(objects.get(url.pathname.slice(1)), png);
  assert.equal(JSON.stringify(result).includes("fixture-secret-never-send"), false);
  assert.equal(JSON.stringify(result).includes(scratch), false);
});

test("concurrent requests reuse a temporary copy instead of repeatedly uploading it", async () => {
  const owner = createGuest();
  const asset = await saveAsset({ userId: owner.id, source: "generated", bytes: png });
  const before = objects.size;
  const results = await Promise.all([downloadFile(owner.id, asset.id), downloadFile(owner.id, asset.id)]);
  assert.equal(results[0].file.url, results[1].file.url);
  assert.equal(objects.size, before + 1);
});

test("expired downloads are renewed", async () => {
  const owner = createGuest();
  const asset = await saveAsset({ userId: owner.id, source: "generated", bytes: png });
  const first = await downloadFile(owner.id, asset.id);
  const now = Date.now;
  const clock = mock.method(Date, "now", () => now() + 3_700_000);
  try {
    const second = await downloadFile(owner.id, asset.id);
    assert.notEqual(second.file.url, first.file.url);
    assert.ok(Date.parse(second.file.expiresAt) > Date.parse(first.file.expiresAt));
  } finally { clock.mock.restore(); }
});

test("storage failure stays an explicit error and a later retry can succeed", async () => {
  const owner = createGuest();
  const asset = await saveAsset({ userId: owner.id, source: "generated", bytes: png });
  uploadFails = true;
  try {
    await assert.rejects(downloadFile(owner.id, asset.id), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /download|storage/i);
      assert.equal(err.message.includes("private upstream detail"), false);
      return true;
    });
  } finally { uploadFails = false; }
  assert.match((await downloadFile(owner.id, asset.id)).file.url, /^https:/);
});

test("the export tool declares its external storage write", () => {
  const tool = toolList().find(t => t.name === "get_download");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.openWorldHint, true);
});

test("the personal API advertises connected native models instead of unconfigured gateways", () => {
  const previous = process.env.PARALLAX_PERSONAL_MODE;
  process.env.PARALLAX_PERSONAL_MODE = "1";
  try {
    const catalog = listModels({ available: true });
    assert.ok(catalog.some(m => m.id === "byteplus-seedream-5.5"));
    assert.ok(catalog.some(m => m.id === "byteplus-seedance-2.5"));
    assert.ok(catalog.some(m => m.id === "decart-lucy-2.6"));
    assert.ok(catalog.every(m => m.id.startsWith("byteplus-") || m.id.startsWith("local-") || m.id.startsWith("decart-")));
  } finally {
    if (previous === undefined) delete process.env.PARALLAX_PERSONAL_MODE;
    else process.env.PARALLAX_PERSONAL_MODE = previous;
  }
});
