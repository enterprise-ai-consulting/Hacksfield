import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { localVideoFilter, transformLocalVideo } from "../src/server/local-video";
import { sniff } from "../src/server/media";

test("local video operations use fixed filters, and return a playable MP4 without network calls", async () => {
  assert.throws(() => localVideoFilter("injected", {}), /Unknown/);
  assert.match(localVideoFilter("fps", { fps: "999;bad" }), /^minterpolate=fps=30:/);
  const input = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=24", "-t", "0.4", "-c:v", "libx264", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"]);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Local processing must never contact a provider"); };
  try {
    const output = await transformLocalVideo(input, "reframe", { aspect: "9:16" });
    assert.equal(sniff(output)?.mime, "video/mp4");
    assert.ok(output.length > 100);
  } finally { globalThis.fetch = original; }
});
