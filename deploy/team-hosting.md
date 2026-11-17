# Private team hosting

Hacksfield has no membership fee. Provider usage still uses the configured shared
rolling 24-hour media budget. Keep one authoritative database for a team so the
budget and library cannot diverge between machines.

Set `HACKSFIELD_TEAM_EMAILS` to an exact comma-separated invitation list. Its first
address owns shared provider settings. Team mode disables guests, public sign-up
and email changes. Existing uninvited sessions and API keys are rejected. Leaving
the variable unset retains the normal personal installation; setting it to an
empty string denies all team access.

Provision the accounts before publishing the hostname. The commissioning helper
accepts private JSON on stdin, never passwords in command arguments or output:

```sh
node --conditions=react-server --import tsx scripts/provision-team.ts < /private/accounts.json
```

The JSON shape is `{ "accounts": [{ "email": "owner@example.com", "name": "Owner",
"password": "<private password>", "existingGuestId": "<optional guest id>" }] }`.
Use an owner-readable file outside the checkout. Upgrading an existing guest
keeps that guest's library, jobs, sessions and API keys. Accounts are created in
one transaction; existing account credentials are never overwritten. Passwords
are stored as salted scrypt hashes by the existing account service.

Build with `NEXT_PUBLIC_HACKSFIELD_TEAM_MODE=1` for the team sign-in screen, and
configure the same invitation list at runtime. Set `COOKIE_SECURE=1` and
`PARALLAX_ORIGIN` to the external HTTPS origin. Back up SQLite consistently before
migrating data; copying a live database without its WAL is unsafe.

The example systemd service binds only to `127.0.0.1:3125`, uses an unprivileged
service account, and loads private runtime settings from `/etc/hacksfield.env`.
Keep the database, provider credentials and assets in `/var/lib/hacksfield/data`
with owner-only permissions. Adjust the Node runtime path for your installation.
Publish through an HTTPS reverse proxy or an existing Cloudflare Tunnel only
after checking that anonymous API requests are rejected. No Cloudflare Access
subscription is required for Hacksfield's built-in team logins.

## Retaining a Mac subscription connection

`scripts/subscription-bridge.py` can keep an existing Hermes ChatGPT subscription
on its original Mac. It binds only to loopback, requires a private key file,
limits concurrency, and runs the existing subscription adapter without logging
prompts or credentials. Forward that loopback port over authenticated SSH; do not
publish the bridge itself. Configure the server with:

```text
HACKSFIELD_SUBSCRIPTION_BRIDGE_URL=http://127.0.0.1:3311/respond
HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY=<private relay key>
```

On the Mac, set `PARALLAX_HERMES_ROOT`,
`HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY_FILE` and optionally
`HACKSFIELD_SUBSCRIPTION_BRIDGE_PORT`, then run the bridge with Python. The original
Mac must remain online for subscription-backed assistant calls. Media generation
on the hosted server remains independent. There is no automatic paid LLM fallback.

A local SSH forward to the hosted app can retain existing Codex and private
ChatGPT MCP URLs and keys, while all callers use the same database and budget.
