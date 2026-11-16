import assert from "node:assert/strict";
import { test } from "node:test";
import { codexMessages, codexResult } from "../src/server/super/codex-subscription";
import { parseSubscriptionCopy } from "../src/server/ads/subscription-copy";

test("subscription chat preserves tool calls, results and user images in replay order", () => {
  const result = codexMessages("Make media only through the supplied tools.", [
    { role: "user", content: [{ type: "text", text: "Animate this" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } }] },
    { role: "assistant", content: [{ type: "text", text: "I can make that." }, { type: "tool_use", id: "call_1", name: "generate_media", input: { kind: "video", prompt: "Waves" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "{\"status\":\"succeeded\"}" }] },
  ]);
  assert.equal(result[0].role, "system");
  assert.ok(Array.isArray(result[1].content));
  assert.equal(result[1].content[1].image_url?.url, "data:image/png;base64,aGVsbG8=");
  assert.equal(result[2].tool_calls?.[0].function.name, "generate_media");
  assert.equal(result[3].role, "tool");
  assert.equal(result[3].tool_call_id, "call_1");
});

test("subscription copy requires the requested structured options and a real script", () => {
  const input = { copy: [{ headline: "New cup", caption: "A blue ceramic cup.", cta: "Learn more" }], script: "Meet our new blue ceramic cup." };
  assert.deepEqual(parseSubscriptionCopy(JSON.stringify(input), 1), input);
  assert.throws(() => parseSubscriptionCopy(JSON.stringify({ ...input, copy: [] }), 1), /copy|options/);
  assert.throws(() => parseSubscriptionCopy("not JSON", 1), /structured|JSON/);
});

test("subscription results return real tool calls and reject malformed arguments", () => {
  const result = codexResult({ content: "Planning your clip", tool_calls: [{ id: "call_1", function: { name: "generate_media", arguments: '{"kind":"video"}' } }] });
  assert.equal(result.stopReason, "tool_use");
  assert.deepEqual(result.content[1], { type: "tool_use", id: "call_1", name: "generate_media", input: { kind: "video" } });
  assert.throws(() => codexResult({ tool_calls: [{ id: "bad", function: { name: "generate_media", arguments: "{" } }] }), /arguments/);
});

test("all parallel tool results precede images returned for model inspection", () => {
  const result = codexMessages("Inspect results", [{ role: "user", content: [
    { type: "tool_result", tool_use_id: "first", content: [{ type: "text", text: "image" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "abc=" } }] },
    { type: "tool_result", tool_use_id: "second", content: "another result" },
  ] }]);
  assert.deepEqual(result.map(m => m.role), ["system", "tool", "tool", "user"]);
});
