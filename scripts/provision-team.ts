/** Private commissioning: JSON accounts on stdin, never passwords in arguments or logs.
 * Run with: node --conditions=react-server --import tsx scripts/provision-team.ts
 * Input: { accounts: [{ email, name, password, existingGuestId? }] }
 */
import { signUp, userById } from "../src/server/auth";
import { get, tx } from "../src/server/db";
import { teamEmailAllowed, teamMode } from "../src/server/team-access";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (raw.length > 32768) throw new Error("Input too large.");
  }
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== "object" || !("accounts" in input) || !Array.isArray(input.accounts) || !input.accounts.length || input.accounts.length > 50) throw new Error("Invalid accounts.");
  const requested = input.accounts;
  const accounts = tx(() => requested.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid account.");
    const account = value as Record<string, unknown>;
    const email = String(account.email ?? "").trim().toLowerCase();
    if (teamMode() && !teamEmailAllowed(email)) throw new Error("Account is not invited.");
    if (get("SELECT id FROM users WHERE email = ?", email)) throw new Error("Account already exists; no credentials were changed.");
    const guest = account.existingGuestId ? userById(String(account.existingGuestId)) : null;
    if (account.existingGuestId && !guest?.isGuest) throw new Error("Only a guest can be upgraded in place.");
    const user = signUp({ email, password: account.password, name: account.name }, guest);
    return { email: user.email, created: true, keptGuestWork: Boolean(guest) };
  }));
  console.log(JSON.stringify({ accounts }));
}

main().catch(() => { console.error("Team provisioning failed; no accounts were changed. Check the private commissioning input."); process.exitCode = 1; });
