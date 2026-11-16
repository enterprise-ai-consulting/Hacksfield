import assert from "node:assert/strict";
import { test } from "node:test";
import { storageClient, signedVideoUrl, validateVideoReference } from "../src/server/byteplus-storage";

test("video links use the private BytePlus S3 endpoint and expire in six hours", async () => {
  const client = storageClient({ tosAccessKeyId: "AKEXAMPLE", tosSecretAccessKey: "example-secret-not-real", tosBucket: "parallax-local-test" });
  try {
    const url = new URL(await signedVideoUrl(client, "parallax-local-test", "parallax/example.mp4"));
    assert.equal(url.hostname, "parallax-local-test.tos-s3-ap-southeast-1.bytepluses.com");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "21600");
    assert.match(url.searchParams.get("X-Amz-Credential")!, /ap-southeast-1\/s3\/aws4_request$/);
    assert.equal(url.searchParams.has("X-Amz-Signature"), true);
  } finally { client.destroy(); }
});

test("video references reject unsupported or oversized sources before any upload", () => {
  const good = { kind: "video" as const, mime: "video/mp4", bytes: 1000, duration: 5, width: 1280, height: 720 };
  assert.doesNotThrow(() => validateVideoReference(good));
  assert.throws(() => validateVideoReference({ ...good, mime: "video/webm" }), /MP4|MOV/);
  assert.throws(() => validateVideoReference({ ...good, duration: 31 }), /30/);
  assert.throws(() => validateVideoReference({ ...good, bytes: 31_000_000 }), /30 MB/);
  assert.throws(() => validateVideoReference({ ...good, duration: null }), /duration/);
});
