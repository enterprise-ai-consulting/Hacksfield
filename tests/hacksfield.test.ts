import assert from "node:assert/strict";
import { after, test } from "node:test";
import { isPersonalMode } from "../src/server/provider-settings";
import { personalInstallation, generationProvider } from "../src/config/installation";
import { generationPlan } from "../src/server/generation-limits";
import { demoBillingOn } from "../src/server/account/billing";

const before = process.env.PARALLAX_PERSONAL_MODE;
after(() => { if (before === undefined) delete process.env.PARALLAX_PERSONAL_MODE; else process.env.PARALLAX_PERSONAL_MODE = before; });

test("fresh Hacksfield installs need no membership flags, subscription, or credit purchase", () => {
  delete process.env.PARALLAX_PERSONAL_MODE;
  assert.equal(isPersonalMode(), true);
  assert.equal(personalInstallation, true);
  assert.equal(generationProvider, "byteplus");
  assert.equal(demoBillingOn(), false);
  assert.deepEqual(generationPlan("free"), generationPlan("ultimate"));
  assert.equal(generationPlan("free").concurrency, 4);
});
