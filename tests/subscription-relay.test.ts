import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { subscriptionRequest } from "../src/server/super/codex-subscription";

test("hosted subscription relay sends only to authenticated loopback and validates its response", async () => {
  const oldUrl = process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL;
  const oldKey = process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY;
  const received: unknown[] = [];
  let fail = false;
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer offline-relay-test-key");
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(raw));
      res.writeHead(fail ? 503 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify(fail ? { error: "private provider detail" } : { message: { content: "offline response" } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL = `http://127.0.0.1:${port}/respond`;
    process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY = "offline-relay-test-key";
    const input = { model: "offline-model", messages: [{ role: "user", content: "offline prompt" }] };
    assert.deepEqual(await subscriptionRequest(input), { content: "offline response" });
    assert.deepEqual(received, [input]);
    fail = true;
    await assert.rejects(subscriptionRequest(input), /unavailable/);
    process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL = "https://example.com/respond";
    await assert.rejects(subscriptionRequest(input), /loopback/);
  } finally {
    if (oldUrl === undefined) delete process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL; else process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY; else process.env.HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY = oldKey;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
