import assert from "node:assert/strict";
import { after, test } from "node:test";
import { assertTeamUser, localMaintenanceRequest, teamMode, teamEmailAllowed, teamSettingsAllowed } from "../src/server/team-access";

const original = process.env.HACKSFIELD_TEAM_EMAILS;
after(() => {
  if (original === undefined) delete process.env.HACKSFIELD_TEAM_EMAILS;
  else process.env.HACKSFIELD_TEAM_EMAILS = original;
});

test("personal installs keep working without a team allowlist", () => {
  delete process.env.HACKSFIELD_TEAM_EMAILS;
  assert.equal(teamMode(), false);
  assert.doesNotThrow(() => assertTeamUser(null));
});

test("team access admits only the exact configured accounts, never domain lookalikes or guests", () => {
  process.env.HACKSFIELD_TEAM_EMAILS = "owner@example.test, colleague@example.test";
  assert.equal(teamEmailAllowed("Owner@Example.Test"), true);
  for (const email of [null, "stranger@example.test", "owner@example.test.evil", "owner+extra@example.test"]) {
    assert.equal(teamEmailAllowed(email), false);
    assert.throws(() => assertTeamUser(email ? { email, isGuest: false } : null));
  }
  assert.throws(() => assertTeamUser({ email: "owner@example.test", isGuest: true }));
  assert.doesNotThrow(() => assertTeamUser({ email: "colleague@example.test", isGuest: false }));
});

test("an explicitly empty team allowlist fails closed", () => {
  process.env.HACKSFIELD_TEAM_EMAILS = "";
  assert.equal(teamMode(), true);
  assert.throws(() => assertTeamUser({ email: "owner@example.test", isGuest: false }));
});

test("only the designated owner may edit shared provider settings remotely", () => {
  process.env.HACKSFIELD_TEAM_EMAILS = "owner@example.test,colleague@example.test";
  assert.equal(teamSettingsAllowed({ email: "owner@example.test", isGuest: false }), true);
  assert.equal(teamSettingsAllowed({ email: "colleague@example.test", isGuest: false }), false);
  assert.equal(teamSettingsAllowed(null), false);
});

test("a proxied request cannot masquerade as loopback maintenance", () => {
  assert.equal(localMaintenanceRequest(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "127.0.0.1:3000" })), true);
  assert.equal(localMaintenanceRequest(new Headers({ host: "127.0.0.1:3000", "cf-ray": "forwarded" })), false);
  assert.equal(localMaintenanceRequest(new Headers({ host: "studio.example.test" })), false);
  assert.equal(localMaintenanceRequest(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "studio.example.test" })), false);
});
