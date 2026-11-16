# Direct BytePlus and personal mode

Set `PARALLAX_PERSONAL_MODE=1`, `NEXT_PUBLIC_PARALLAX_PERSONAL_MODE=1`, and
`NEXT_PUBLIC_PARALLAX_PROVIDER=byteplus`, then rebuild. Set `BYTEPLUS_MODE=live`.
Supply a **ModelArk platform API key** as `BYTEPLUS_API_KEY` or save it in the local
Generation settings page. Coding Plan subscription keys do not include image/video usage.

The original native models, retained as selectable alternatives, are `byteplus-seedream-4.5` (Seedream 4.5, `seedream-4-5-251128`),
`byteplus-seedance-2.0` (Seedance 2.0, `dreamina-seedance-2-0-260128`),
`byteplus-seed-speech-2.0` (Seed Speech 2.0) and `byteplus-seedance-music`
(short soundtracks extracted from Seedance 2.0 video).
Existing running endpoints for these exact model versions can be supplied as
`BYTEPLUS_IMAGE_MODEL` and `BYTEPLUS_VIDEO_MODEL`. Other models need their own
provider connection; the BytePlus mode picker does not offer them as working models.

Calls go directly to `https://ark.ap-southeast.bytepluses.com/api/v3`, using Bearer
authentication. Reference images are sent inline; they do not pass through Treg.
Results are copied into Hacksfield's asset storage immediately.

Personal mode skips Hacksfield credit affordability checks, records generation credit
cost as zero, disables billing/top-ups and low-credit notices, and removes the offer
countdown and subscription prompts. Session authentication and file ownership remain
enforced. Pricing, Wallet, and Invite pages lead to Generation settings.

The four-job concurrency guard protects local resources and does not require an upgrade.
Provider permissions, account balance, and provider rate limits still apply.
The live Supercomputer assistant can reuse an existing ChatGPT subscription through local Hermes; see the subscription section below.

## Speech and music

Seed Speech uses a separate key from the Speech console, saved as `speechApiKey` in
Generation settings or supplied as `BYTEPLUS_SPEECH_API_KEY`. It is sent only in the
`X-Api-Key` header to `https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional`,
with resource `seed-tts-2.0`. ModelArk and Coding Plan keys are never substituted.
Existing Speech applications can instead supply their Access Token in that same private
credential field and set `speechAppId` (or `BYTEPLUS_SPEECH_APP_ID`). The adapter then
uses the documented `X-Api-App-Id` and `X-Api-Access-Key` pair and omits `X-Api-Key`.
Clear the optional APP ID when switching to a modern Speech API key.
The adapter joins base64 MP3 chunks and requires the terminal success marker;
an incomplete stream or a provider application error cannot become a successful track.
The listed rate is US$30 per million characters, before free quota or discounts.
Voice IDs come from the official [voice list](https://docs.byteplus.com/en/docs/byteplusvoice/tts-voice-list).

Seedance Soundtrack reuses the existing ModelArk key and video endpoint. It creates
a 4–15 second 480p video with music, downloads it through the existing guarded media
fetcher, and extracts the soundtrack to MP3 with local ffmpeg. It is billed at video
rates and is intended for clips, stings and melody ideas. It does not produce full songs.
ffmpeg and ffprobe are required and checked before contacting the paid provider.
No audio stream is a clear failure; a completed video can still incur provider charges.
Both studios provide the normal audio player, history and download controls.

## Budget and recovery

`BYTEPLUS_DAILY_BUDGET_USD` defaults to US$5. Locally saved settings override it.
The limit applies to the previous 24 hours across users, including active reservations.
For the original models, Seedream 4.5 reserves US$0.04 per image before discounts. Seedance 2.0 reserves US$0.10/s
at 480p or US$0.20/s at 720p. The offered video ratios are 16:9 and 9:16. Final video
usage settles at the published no-video-input rate of US$7.00 per million completion
tokens. Music uses the same 480p reservation and token settlement. Speech reserves its
listed character price. Account discounts and free quota are not queried, so accounting
remains conservative across all four studios.

These estimates use the published BytePlus rate card; provider rate changes can change
actual billing. The application budget does not limit spending by other applications
on the same BytePlus account. Check provider-side spending controls for an account-wide cap.

Direct submissions have no assumed idempotent replay. A network timeout, unreadable
response, or crash before storing a task ID fails the job without automatically
submitting it again, and keeps the estimated cost in the daily budget. Check BytePlus
task history before manually retrying an uncertain request. Known video task IDs resume
polling after a restart. Confirmed 4xx rejections release the reservation.

## Local settings API

Both routes require personal mode and a loopback Host header. Forwarded public hosts are
refused. The standard same-origin write guard protects changes. No API key is returned.

- `GET /api/settings/provider`: provider, configured and speechConfigured booleans, optional public Speech APP ID, mode, model IDs,
  dailyBudgetUsd, committedUsd, and personalMode.
- `POST /api/settings/provider`: `{ "apiKey"?: string, "speechApiKey"?: string, "speechAppId"?: string, "dailyBudgetUsd"?: number }`.
  An empty key leaves the saved key unchanged. Zero budget pauses new generations.
  Keys are atomically written to `PARALLAX_DATA_DIR/provider-settings.json`, mode 0600.
  Changes take effect on the next request without restarting.

Invalid input returns 400; remote/non-personal access and cross-site writes return 403.
Missing provider credentials return 503 `provider_configuration` before queueing work.
When a replacement ModelArk key is supplied, a read-only task-list request must succeed
before settings are written. Rejected or unreachable replacements leave all saved
settings intact. Empty key fields retain their existing values. The form waits for
current settings to load and sends the optional legacy Speech APP ID only when edited.

## Validation

### Direct models and optional free allowances

The direct catalog also includes Seedream 4.0 and 5.0 lite, Seedance 1.0 Pro Fast
and Pro, and Seed Audio 1.0. Seedance 2.0 with sound remains selectable; the current default is 2.5. Pro Fast
is an optional silent 2–12s model with its own `$1/M` output-token rate. Pro is
`$2.50/M`. Old `BYTEPLUS_VIDEO_MODEL`
overrides only apply to Seedance 2.0 and its soundtrack, never to another quota
pool. Polling receives the job's endpoint so settlement uses the correct rate.

Seedance Soundtrack is the music default. Optional Audio 1.0 calls `/tts/create` with
`model=seed-audio-1.0`, `text_prompt` and MP3 output configuration, using a modern
Speech key stored as `audioApiKey` (or `BYTEPLUS_AUDIO_API_KEY`). It never sends
legacy APP ID credentials to this API and never switches to a paid video model
when a key is missing. Audio reserves `$0.30` for the provider's 120-second maximum
and settles using `original_duration * $0.0025`, independently of requested timing.
Modern TTS keys can be reused only when no legacy APP ID is configured. All three
private credential fields are redacted from provider errors.

BytePlus applies each model's eligible account allowance. These settings do not
query live remaining balances, transfer allowances between models, or stop
provider billing once a model's free pool is exhausted. The rolling daily app
budget remains conservative and includes listed value while quota may cover it.

`NEXT_PUBLIC_PARALLAX_PROVIDER=byteplus node --conditions=react-server --import tsx --test tests/byteplus.test.ts`

`python3 tests/run.py tests/personal_byteplus.py`

These use fake credentials and a local provider stand-in. They never call a billable API.

## Open improvements

- Query account discounts and model access without running a generation.
- Add other BytePlus model versions with their own controls and rate cards.
- Add a provider for longer music tracks and full songs.

References: [Speech HTTP API](https://docs.byteplus.com/en/docs/byteplusvoice/unidirectional_tts_http),
[Speech pricing](https://docs.byteplus.com/api-reference/docs/byteplusvoice/TTS_Billing),
[Seedance API](https://docs.byteplus.com/en/docs/ModelArk/create-video-generation-task-api),
[ModelArk pricing](https://docs.byteplus.com/en/docs/modelark/model-pricing).


## Current models and tool routing

The defaults are Seedream 5.5 (`dola-seedream-5-5-261028`), Seedance 2.5
(`dreamina-seedance-2-5-260628`) and Seedance 2.5 Soundtrack. Legacy environment
model overrides never replace a newer model or another free-quota model.

Seedream 5.5 sends PNG output, optional transparent backgrounds and inline image
references, without obsolete sequential-image parameters. Inputs cost $0.008 each;
outputs cost $0.020 or $0.035 by pixel tier. The layer tool requests at most eight
images, reserves all eight, saves every returned PNG and preserves its name, order
and bounding box in asset parameters.

Seedance 2.5 uses explicit `reference`, `edit` and `extend` task types. Editing
keeps `ratio=adaptive` and `duration=-1`. Input duration is measured from an owned
asset for budget reservation; internal reservation metadata is removed before the
provider request. Video-reference formats, dimensions, encoding, FPS and duration
are checked before submitting the paid model call. Reference audio is MP3/WAV,
2–30 seconds and no more than 15 MB.

Reservations are $0.20/s at 480p, $0.40/s at 720p and $0.80/s at 1080p. Actual
completion usage settles at $10.70/M tokens for 480p/720p without a video input,
$11.70/M at 1080p; with a video input, rates are $6.40/M and $7.00/M respectively.
These are app estimates and list prices, before provider discounts/free allowances.

Apps, Cinema, Ads, Canvas, Shorts and Remix share the native registry and admission
checks. Music templates use the music model, not the speech model. Local video
resizing/sharpening, centre cropping and frame interpolation use ffmpeg without a
provider call. Mask-guided edits are generative and do not lock outside-mask pixels;
image enhancement is generative detail restoration up to 2K. These are labelled in
the tool descriptions. Transparent video cutouts have no supported BytePlus route.
Horizon remains the upstream announcement/preview page, not a world-generation engine.

## ChatGPT subscription connection

Set `PARALLAX_ASSISTANT_PROVIDER=codex-subscription`. The server invokes
`scripts/codex-subscription.py` using the local Hermes virtualenv. Optional
`PARALLAX_HERMES_ROOT` and `PARALLAX_HERMES_HOME` select the installation/profile.
The script uses Hermes's canonical Codex credential reader and response adapter;
it does not copy OAuth credentials into Hacksfield. It requires the ChatGPT backend
host and never falls back to a separately billed API. Astra, Sol and Terra are
allowlisted; ad copy uses Terra unless `PARALLAX_COPY_MODEL` overrides it.

Only real Hacksfield tools are offered to this assistant. Mock computer and connected
app tools are excluded. The conversation adapter preserves function calls/results
and user images. Credentials, raw process errors and provider URLs are not returned
to the browser. Subscription usage is independent of the $5 media budget.

`python scripts/codex-subscription.py --status` checks configuration without model
inference. Production setup deliberately makes no live model test requests.

## Private video storage

Uploaded videos require private BytePlus TOS in Johor (`ap-southeast-1`). The official
S3-compatible endpoint is `https://tos-s3-ap-southeast-1.bytepluses.com`; the AWS SDK
is used solely as an S3 protocol client, with no AWS cloud account/service involved.

Store `tosAccessKeyId`, `tosSecretAccessKey` and `tosBucket` in the private settings
file, or use `BYTEPLUS_TOS_ACCESS_KEY_ID`, `BYTEPLUS_TOS_SECRET_ACCESS_KEY` and
`BYTEPLUS_TOS_BUCKET`. Use a service key restricted to GetObject/PutObject for the
bucket's `parallax/` prefix, keep the bucket private and configure one-day lifecycle
cleanup. Only an owned, selected clip is uploaded, under a random object name.
Read URLs expire after six hours and remain server-side. The API returns only a
configured flag and bucket name; both access-key fields are redacted from errors.
Failure to upload stops the job before any paid generation submission. No public
bucket, tunnel or third-party file host is used. Storage/transfer fees are outside
the application's media accounting.

## Offline validation

Unit tests use fetch stand-ins, fake credentials, synthetic local media and signed
URL inspection. The personal integration test runs a local BytePlus stand-in and
an isolated fake Hermes module; it cannot reach the real account or use live model
credentials. It covers native media, layers/metadata, zero membership credits,
spending controls, private-key handling, missing storage and subscription tool/copy
round trips. Original core and Supercomputer mock tests remain separate.
# Decart editing

The optional Decart connection uses a developer API key saved in the local Generation
settings page, or `DECART_API_KEY` on the server. Saving a replacement checks only
`GET https://api.decart.ai/v1/credits`; it never submits a paid request. The key is
kept in the existing owner-only provider settings file and is not returned by APIs.

Available model IDs are `decart-lucy-image-2`, `decart-lucy-2.6`,
`decart-lucy-vton-3.6`, and `decart-lucy-restyle-2`. These edit uploaded images or
videos; they are not text-to-video models. They appear in the normal studio and
the same MCP model catalog used by Codex and ChatGPT. BytePlus remains the default.

Decart receives multipart files directly from this server. PNG, JPEG and WebP
images and MP4 clips are supported, up to 30 MB per file and 30 seconds per clip.
Video needs a 16:9 or 9:16 frame; VTON also accepts 2:1 and 1:2. Reference images
are optional, except Restyle which uses text alone. Realtime webcam/streaming and
Oasis are not implemented by this batch integration.

Both direct providers share the configured rolling 24-hour media budget. Video
quotes reserve whole seconds rounded up, using $0.04/sec for Lucy 2.6 and VTON 3.6
and $0.01/sec for Restyle 2. Image edits cost $0.01 at 480p and $0.02 at 720p.
Prices are from [Decart's API rate card](https://docs.platform.decart.ai/getting-started/pricing).
Decart account credits are separate from BytePlus balance and ChatGPT subscriptions.
There is no Hacksfield membership charge or provider markup.

Uncertain submissions are never automatically replayed. The shared budget retains
a conservative reservation for failed/uncertain work unless rejection is known to
have occurred before generation. Completed video content is fetched from Decart
with server-side authentication and saved as a private owned Hacksfield asset.
`DECART_MODE=mock` makes queued Decart jobs local and free for development.

