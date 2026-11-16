# Hacksfield

**A membership-free, self-hosted AI creative studio from EAIC.**

Hacksfield is our version of [Parallax](https://github.com/nickvasilescu/parallax),
with direct BytePlus and Decart connections, a local media library, image/video/audio
studios, Apps, Cinema, Ads, Remix, and an MCP interface for coding agents and ChatGPT.

There is **no Hacksfield membership, credit purchase, or markup**. Membership-free
mode is the default on a fresh install, in both the browser and the server. Your
provider accounts still charge for their API usage after any applicable free quota.

## Install

Requires **Node.js 22.13+** and npm. Install **ffmpeg and ffprobe** for soundtrack
extraction and local video tools (`brew install ffmpeg` on macOS).

```bash
git clone https://github.com/enterprise-ai-consulting/Hacksfield.git
cd Hacksfield
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Go to **Generation settings**
at `/settings/provider` to connect your own accounts. No environment file is required
for the membership-free defaults. Unconfigured providers ask for a key before use.

If another app already uses port 3000, run `npm run dev -- -p 3001` instead.

For a production build:

```bash
npm run build
npm start
```

The server binds to **127.0.0.1** by default. On macOS, after building, you can
also double-click **Start Hacksfield.command**; it uses port **3001** so it can
sit alongside an existing Parallax installation. Keep that Terminal window open
and press Control-C to stop it.

## Connect providers

| Connection | What it enables |
|---|---|
| BytePlus ModelArk platform key | Seedream 5.5 images, edits and layers; Seedance 2.5 video and short soundtrack clips |
| BytePlus Seed Speech key | Seed Speech 2.0 spoken audio; a modern Speech key also supports optional Seed Audio 1.0 music/ambience |
| Decart developer API key | Lucy Image 2 image edits, Lucy 2.6 video edits, Lucy VTON 3.6 outfits and Lucy Restyle 2 |
| Private BytePlus TOS storage | BytePlus uploaded-video tools and temporary downloads for chat clients |
| Existing Hermes ChatGPT sign-in (optional) | Subscription-backed Supercomputer and ad-copy assistant |

**Bring your own keys. This repository and its source archive contain no EAIC or
personal credentials, provider balances, account IDs, media library, or ChatGPT tunnel.**
Existing BytePlus Coding Plan keys are separate from ModelArk media access. An
existing Decart website account does not by itself establish API access.

Keys entered in Generation settings are saved in `data/provider-settings.json`
with owner-only file permissions. Keys are never returned by the settings API.
Keep the data directory private and outside version control. Never put credentials
in a `NEXT_PUBLIC_` variable. `.env.example` lists optional server settings.

All direct media providers share a **US$5 rolling 24-hour budget by default**.
Change it in Generation settings; set it to zero to pause paid generation.
Quotes reserve provider costs before submission. Uncertain direct-provider requests
are not automatically resubmitted. Storage/transfer fees and subscription limits
are separate from the app's media budget.

Decart is available in **Image → model picker** and **Video → Edit Video**. It edits
uploaded source files. PNG/JPEG/WebP images and MP4 video are supported, up to 30 MB
per file and 30 seconds per clip. BytePlus stays the generation default.

See [provider setup and accounting](docs/api/provider.md) for model details,
separate Speech credentials, private storage policies and recovery behaviour.

## Codex, ChatGPT and other MCP clients

Hacksfield exposes an authenticated MCP endpoint at `/api/mcp`. Create your own
local account and a developer key with the scopes you need on `/developer`.
Point your client at your running installation; its API keys stay on your machine.

The nine MCP tools list models, inspect their controls, quote, submit and inspect
generations, list the library, export a temporary download, and read the budget.
Edits use source files already uploaded to the Hacksfield library. Exporting a
file uses your private TOS storage and returns a one-hour link.

Codex can use the loopback MCP endpoint. ChatGPT needs its own approved reachable
connection, such as a private workspace tunnel. `deploy/chatgpt/connection.sh` is
an optional transport helper; the official tunnel client, tunnel identity and keys
must be configured separately. No existing private connection is bundled.

The optional subscription assistant uses an existing Hermes sign-in; it does not
turn a ChatGPT subscription into a BytePlus or Decart API subscription. There is
no automatic paid-API fallback. See [the assistant guide](docs/api/super.md).

## What membership-free means

The local studios, available Apps, Cinema, Ads, Remix and API do not require a paid
Hacksfield plan or app credits. Four concurrent media jobs are allowed regardless
of the legacy account plan label. A free local login may still be needed to keep
files and developer keys attached to an owner.

Provider access, safety decisions, spending limits and authentication are still
required. These controls protect your account; no provider payment system is
bypassed. Legacy `PARALLAX_*` environment names and the private storage prefix
`parallax/` remain for compatibility. The public product name is **Hacksfield**.

This is a working fork with specific integrations, not a claim that every feature
of a commercial studio has been reproduced. Transparent video cutouts, realtime
Decart webcam/Oasis sessions, and Horizon world generation are not implemented.
Canvas boards remain browser-local. Third-party connectors need their own setup.

## Offline development checks

```bash
npm run check:registry
npm run test:unit
npm run build
npm run lint -- --quiet
npm run test:api
```

The unit tests use fake keys and mocked network calls. API checks start isolated
local servers and a BytePlus stand-in; they do not use real provider credentials
or submit billable generations. Some optional UI checks in the upstream test suite
require their own browser setup.

The historical upstream billing tests explicitly enable compatibility mode. Normal
Hacksfield installs do not use it. See [UPSTREAM.md](UPSTREAM.md) for provenance and
[SECURITY.md](SECURITY.md) for security reporting.

## Licence and credits

MIT, with the original copyright and licence preserved in [LICENSE](LICENSE).
Based on Nick Vasilescu's Parallax; EAIC's modifications are provided under the same
licence. Hacksfield is an independent fork and is not affiliated with Higgsfield,
BytePlus, Decart or OpenAI.
