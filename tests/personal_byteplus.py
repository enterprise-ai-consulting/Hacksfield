"""Personal installation against a local BytePlus stand-in. Runner: own-server

No external requests or billable generations are made.
"""
import base64
import http.cookiejar
import json
import os
import pathlib
import re
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP, DATA, PORT = sys.argv[1:4]
ROOT = pathlib.Path(APP)
BASE = f"http://127.0.0.1:{PORT}"
KEY = "test-byteplus-platform-secret"
SPEECH_KEY = "test-byteplus-speech-secret"
AUDIO_KEY = "test-byteplus-audio-secret"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1cAAAAASUVORK5CYII=")
VIDEO = subprocess.check_output(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "1", "-c:v", "libx264", "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"])
AUDIO = subprocess.check_output(["ffmpeg", "-v", "error", "-i", "pipe:0", "-vn", "-f", "mp3", "pipe:1"], input=VIDEO)
calls = []
results = []


class Provider(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        calls.append((self.path, body, self.headers.get("Authorization")))
        if self.path.endswith("/tts/create"):
            if self.headers.get("X-Api-Key") != AUDIO_KEY or self.headers.get("X-Api-App-Id"):
                return self.respond(401, {"message": "Invalid Audio key"})
            return self.respond(200, {"code": 0, "audio": base64.b64encode(AUDIO).decode(), "original_duration": 1, "duration": 1})
        if self.path.endswith("/tts/unidirectional"):
            modern = self.headers.get("X-Api-Key") == SPEECH_KEY and not self.headers.get("X-Api-App-Id")
            legacy = self.headers.get("X-Api-App-Id") == "1234567890" and self.headers.get("X-Api-Access-Key") == SPEECH_KEY and not self.headers.get("X-Api-Key")
            if not (modern or legacy) or self.headers.get("Authorization"):
                return self.respond(401, {"error": {"message": "Invalid Speech key"}})
            if body.get("req_params", {}).get("text") == "speech refused":
                return self.respond(200, {"code": 45000000, "message": "Do not expose " + SPEECH_KEY})
            frames = [{"code": 0, "data": base64.b64encode(AUDIO[:100]).decode()}, {"code": 0, "data": base64.b64encode(AUDIO[100:]).decode()}, {"code": 20000000, "data": None}]
            encoded = "\n".join(json.dumps(frame) for frame in frames).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
            return
        if self.headers.get("Authorization") != "Bearer " + KEY:
            return self.respond(401, {"error": {"message": "Invalid platform key"}})
        if body.get("prompt") == "refused":
            return self.respond(401, {"error": {"message": "Do not expose " + KEY}})
        if self.path.endswith("/images/generations"):
            if body.get("layer_decomposition"):
                return self.respond(200, {"data": [{"b64_json": base64.b64encode(PNG).decode(), "size": "1024x1024", "name": name, "z_index": n, "bounding_box": {"absolute": {"x": 0, "y": 0, "width": 1024, "height": 1024}}} for n, name in enumerate(["Base", "Foreground"])], "usage": {"generated_images": 2}})
            return self.respond(200, {"data": [{"b64_json": base64.b64encode(PNG).decode()}], "usage": {"generated_images": 1}})
        return self.respond(200, {"id": "cgt-local-test"})

    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer " + KEY:
            return self.respond(401, {"error": {"message": "Invalid platform key"}})
        self.respond(200, {"id": "cgt-local-test", "status": "succeeded", "content": {"video_url": "data:video/mp4;base64," + base64.b64encode(VIDEO).decode()}, "usage": {"completion_tokens": 100000}})


jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(method, route, body=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(BASE + route, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with client.open(req, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            return error.code, json.loads(payload)
        except ValueError:
            return error.code, {"error": {"message": f"HTTP {error.code}: non-JSON response"}}


def check(name, passed):
    results.append(bool(passed))
    print(("PASS " if passed else "FAIL ") + name, flush=True)


def wait(job):
    until = time.time() + 25
    while time.time() < until:
        _, body = call("GET", "/api/jobs/" + job["id"])
        current = body["job"]
        if current["status"] in ("succeeded", "failed", "canceled"):
            return current
        time.sleep(0.2)
    raise AssertionError("job did not finish")


provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
threading.Thread(target=provider.serve_forever, daemon=True).start()
# A local Python implementation of Hermes's response contract; no sign-in or model is contacted.
fake_root = pathlib.Path(DATA).parent / "subscription-fixture"
(fake_root / "agent").mkdir(parents=True)
(fake_root / "venv/bin").mkdir(parents=True)
(fake_root / "venv/bin/python").symlink_to(sys.executable)
(fake_root / "agent/__init__.py").write_text("")
(fake_root / "agent/secret_scope.py").write_text("def build_profile_secret_scope(path): return path\ndef set_secret_scope(scope): pass\n")
(fake_root / "agent/auxiliary_client.py").write_text('''
import json, re
from pathlib import Path
from types import SimpleNamespace as NS
def _build_codex_client(model):
    def create(**request):
        tools = [x["function"]["name"] for x in request.get("tools") or []]
        with (Path(__file__).parent / "requests.jsonl").open("a") as log:
            log.write(json.dumps({"model": request["model"], "tools": tools}) + "\\n")
        if not tools:
            count = int(re.search(r"Return exactly (\\d+)", request["messages"][0]["content"]).group(1))
            content = json.dumps({"copy": [{"headline": "Fixture headline", "caption": "Fixture caption", "cta": "Learn more"} for _ in range(count)], "script": "Fixture spoken product script."})
            message = NS(content=content, tool_calls=None)
        elif any(m["role"] == "tool" for m in request["messages"]):
            message = NS(content="Fixture subscription reply after reading the registry.", tool_calls=None)
        else:
            message = NS(content=None, tool_calls=[NS(id="fixture-call", type="function", function=NS(name="list_models", arguments='{"kind":"image"}'))])
        return NS(choices=[NS(message=message)])
    client = NS(base_url="https://chatgpt.com/backend-api/codex", _real_client=NS(max_retries=2), chat=NS(completions=NS(create=create)), close=lambda: None)
    return client, model
''')
env = dict(os.environ, PARALLAX_DATA_DIR=DATA, PARALLAX_PERSONAL_MODE="1", PARALLAX_DEMO_SEED="0", BYTEPLUS_MODE="live", BYTEPLUS_API_KEY=KEY, BYTEPLUS_DAILY_BUDGET_USD="2", BYTEPLUS_IMAGE_MODEL="seedream-4-5-251128", BYTEPLUS_VIDEO_MODEL="dreamina-seedance-2-0-260128", BYTEPLUS_BASE_URL=f"http://127.0.0.1:{provider.server_port}/api/v3", TREG_MODE="live", TREG_TOKEN="")
env.update(BYTEPLUS_SPEECH_API_KEY="", BYTEPLUS_SPEECH_BASE_URL=f"http://127.0.0.1:{provider.server_port}/api/v3")
env.update(PARALLAX_ASSISTANT_PROVIDER="codex-subscription", PARALLAX_HERMES_ROOT=str(fake_root), PARALLAX_HERMES_HOME=str(fake_root / "profile"))
pathlib.Path(DATA).mkdir(parents=True, exist_ok=True)
with socket.socket() as port_check:
    port_check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        port_check.bind(("127.0.0.1", int(PORT)))
    except OSError:
        sys.exit(f"Test port {PORT} is in use; select an unused PORT before running this isolated test.")
with open(pathlib.Path(DATA).parent / "logs/personal.log", "wb") as log:
    server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", PORT], cwd=APP, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(40):
            if server.poll() is not None:
                raise AssertionError("isolated server stopped during startup; see logs/personal.log")
            try:
                if call("GET", "/api/auth/me")[0] == 200 and (pathlib.Path(DATA) / "parallax.db").exists():
                    break
            except OSError:
                pass
            time.sleep(0.25)
        status, guest = call("POST", "/api/auth/guest", {})
        check("guest session remains available", status == 200)
        with sqlite3.connect(pathlib.Path(DATA) / "parallax.db") as database:
            database.execute("DELETE FROM ledger WHERE user_id = ?", (guest["user"]["id"],))
        status, settings = call("GET", "/api/settings/provider")
        check("settings report configuration without revealing the key", status == 200 and settings.get("configured") is True and KEY not in json.dumps(settings))
        status, rejected_key = call("POST", "/api/settings/provider", {"apiKey": "invalid-platform-replacement"})
        check("an invalid replacement platform key is refused before overwriting settings", status == 400)
        if status != 400:
            raise AssertionError("invalid replacement credentials must leave the working connection intact")
        status, image = call("POST", "/api/jobs", {"modelId": "byteplus-seedream-4.5", "prompt": "A lighthouse", "values": {"aspect": "16:9"}})
        check("zero Hacksfield credits do not block direct generation", status == 200 and image.get("balance") == 0)
        if status != 200:
            raise AssertionError(json.dumps(image))
        finished = wait(image["jobs"][0])
        check("native image completes with no local credit charge", finished["status"] == "succeeded" and finished["cost"] == 0)
        check("provider receives the real model, size, and platform authorization", calls[0][1].get("model") == "seedream-4-5-251128" and calls[0][1].get("size") == "2560x1440" and calls[0][2] == "Bearer " + KEY)
        asset = finished["assets"][0]
        with client.open(BASE + asset["url"]) as response:
            check("provider image is stored and served", response.read() == PNG)
        status, image = call("POST", "/api/jobs", {"modelId": "byteplus-seedream-4.5", "prompt": "Restyle", "inputs": {"refs": [asset["id"]]}})
        check("image-to-image succeeds", status == 200 and wait(image["jobs"][0])["status"] == "succeeded")
        check("references go directly to BytePlus as inline images", calls[-1][1].get("image", [""])[0].startswith("data:image/png;base64,"))
        status, video = call("POST", "/api/jobs", {"modelId": "byteplus-seedance-2.0", "prompt": "Waves", "values": {"duration": 5}})
        check("native video queues and polls to a stored result", status == 200 and wait(video["jobs"][0])["status"] == "succeeded")
        status, settings = call("GET", "/api/settings/provider")
        check("actual provider usage settles the video reservation", status == 200 and abs(settings.get("committedUsd", -1) - 0.78) < 0.00001)
        before = len(calls)
        status, _ = call("POST", "/api/jobs", {"modelId": "byteplus-seed-speech-2.0", "prompt": "Hello from Hacksfield"})
        check("speech requires its own key before contacting a provider", status == 503 and len(calls) == before)
        status, settings = call("POST", "/api/settings/provider", {"speechApiKey": SPEECH_KEY})
        check("Speech key saves without exposing either provider key", status == 200 and settings.get("speechConfigured") is True and not any(key in json.dumps(settings) for key in [KEY, SPEECH_KEY]))
        status, speech = call("POST", "/api/jobs", {"modelId": "byteplus-seed-speech-2.0", "prompt": "Hello from Hacksfield"})
        spoken = wait(speech["jobs"][0])
        check("native streamed speech becomes a playable stored MP3", status == 200 and spoken["status"] == "succeeded" and spoken["assets"][0]["mime"] == "audio/mpeg" and spoken["assets"][0]["duration"] > 0)
        with client.open(BASE + spoken["assets"][0]["url"]) as response:
            check("Speech chunks are stored without truncation", response.read() == AUDIO)
        status, music = call("POST", "/api/jobs", {"modelId": "byteplus-seedance-music", "prompt": "Gentle piano", "values": {"duration": 5}})
        soundtrack = wait(music["jobs"][0])
        check("music extracts video audio into a stored MP3", status == 200 and soundtrack["status"] == "succeeded" and soundtrack["assets"][0]["mime"] == "audio/mpeg" and soundtrack["assets"][0]["duration"] > 0)
        status, settings = call("GET", "/api/settings/provider")
        check("audio and music share actual usage accounting with images and video", abs(settings.get("committedUsd", -1) - (1.48 + len("Hello from Hacksfield") * 30 / 1e6)) < 0.00001)
        status, refused = call("POST", "/api/jobs", {"modelId": "byteplus-seed-speech-2.0", "prompt": "speech refused"})
        speech_failure = wait(refused["jobs"][0])
        check("Speech application errors cannot succeed or expose a key", speech_failure["status"] == "failed" and SPEECH_KEY not in json.dumps(speech_failure))
        status, _ = call("POST", "/api/settings/provider", {"dailyBudgetUsd": 0})
        before = len(calls)
        status, denied = call("POST", "/api/jobs", {"modelId": "byteplus-seedream-4.5", "prompt": "Over budget"})
        check("provider spending cap still blocks in personal mode", status == 503 and len(calls) == before)
        status, _ = call("POST", "/api/settings/provider", {"dailyBudgetUsd": 2})
        status, _ = call("POST", "/api/settings/provider", {"dailyBudgetUsd": -1})
        check("invalid budget is rejected", status == 400)
        status, _ = call("POST", "/api/settings/provider", {"apiKey": "replacement-key"}, {"Origin": "https://evil.example"})
        check("cross-site key changes are refused", status == 403)
        status, _ = call("GET", "/api/settings/provider", headers={"Host": "evil.example"})
        check("non-local host cannot read generation settings", status == 403)
        status, _ = call("POST", "/api/wallet/topup", {"packId": "pack-100"})
        check("credit top-ups are disabled", status == 403)
        status, _ = call("POST", "/api/jobs", {"modelId": "flux-schnell", "prompt": "No gateway key"})
        check("unsupported provider cannot silently return demo output", status == 503)
        status, refused = call("POST", "/api/jobs", {"modelId": "byteplus-seedream-4.5", "prompt": "refused"})
        failed = wait(refused["jobs"][0])
        check("authentication failure is clear and does not leak the key", failed["status"] == "failed" and "platform key" in failed["error"]["message"] and KEY not in json.dumps(failed))
        check("direct-provider errors are not automatically resubmitted", sum(1 for _, body, _ in calls if body.get("prompt") == "refused") == 1)
        status, settings = call("POST", "/api/settings/provider", {"speechAppId": "1234567890"})
        check("legacy Speech APP ID saves without exposing its access token", status == 200 and settings.get("speechAppId") == "1234567890" and SPEECH_KEY not in json.dumps(settings))
        status, legacy = call("POST", "/api/jobs", {"modelId": "byteplus-seed-speech-2.0", "prompt": "Legacy Speech connection"})
        check("legacy Speech application also produces a playable MP3", status == 200 and wait(legacy["jobs"][0])["status"] == "succeeded")
        before = len(calls)
        status, _ = call("POST", "/api/jobs", {"modelId": "byteplus-seed-audio-1.0", "prompt": "Gentle piano"})
        check("missing modern Audio key never falls back to a paid soundtrack", status == 503 and len(calls) == before)
        status, settings = call("POST", "/api/settings/provider", {"audioApiKey": AUDIO_KEY})
        check("modern Audio key stays private and preserves legacy Speech", status == 200 and settings.get("audioConfigured") is True and settings.get("speechAppId") == "1234567890" and AUDIO_KEY not in json.dumps(settings))
        status, audio = call("POST", "/api/jobs", {"modelId": "byteplus-seed-audio-1.0", "prompt": "Gentle piano"})
        rendered = wait(audio["jobs"][0])
        check("Audio 1.0 saves audio without creating a video", status == 200 and rendered["status"] == "succeeded" and calls[-1][0].endswith("/tts/create") and rendered["assets"][0]["mime"] == "audio/mpeg")
        status, fast = call("POST", "/api/jobs", {"modelId": "byteplus-seedance-1.0-pro-fast", "prompt": "Waves", "values": {"duration": 5}})
        check("video free-pool model queues and saves a real provider-shaped result", status == 200 and wait(fast["jobs"][0])["status"] == "succeeded")
        check("video free-pool routing ignores the paid model override", calls[-1][1].get("model") == "seedance-1-0-pro-fast-251015")
        status, project = call("POST", "/api/cinema/projects", {"title": "Personal film"})
        check("cinema defaults use the selected direct BytePlus models", status == 200 and project["project"]["stillModelId"] == "byteplus-seedream-5.5" and project["project"]["videoModelId"] == "byteplus-seedance-2.5")
        status, batch = call("GET", "/api/cinema/projects/" + project["project"]["id"] + "/batch")
        check("cinema batches use the personal resource limit without membership", status == 200 and batch["quote"]["concurrency"] == 4 and batch["quote"]["affordable"] is True)
        call("POST", "/api/settings/provider", {"dailyBudgetUsd": 20})
        status, catalog = call("GET", "/api/apps")
        enabled = [a for a in catalog["apps"] if a["status"] == "available"]
        check("72 apps are connected to direct BytePlus or local processing", status == 200 and len(enabled) == 72 and all(a["modelId"].startswith(("byteplus-", "local-")) for a in enabled))
        check("personal app prices report provider dollars", all(a["price"]["providerCost"].lstrip("≤ ").startswith("$") for a in enabled))
        status, layers = call("POST", "/api/jobs", {"modelId": "byteplus-seedream-5.5-layers", "prompt": "Split the layers", "inputs": {"refs": [asset["id"]]}})
        split = wait(layers["jobs"][0])
        check("native layer results keep all PNGs and placement metadata", status == 200 and split["status"] == "succeeded" and len(split["assets"]) == 2 and split["assets"][1]["params"]["layer"]["z_index"] == 1)
        check("latest image routes cannot be replaced by the old model override", calls[-1][1].get("model") == "dola-seedream-5-5-261028" and "sequential_image_generation" not in calls[-1][1])
        before = len(calls)
        status, _ = call("POST", "/api/jobs", {"modelId": "byteplus-seedance-2.5-edit", "prompt": "Edit this clip", "inputs": {"source": [wait(video["jobs"][0])["assets"][0]["id"]]}})
        check("missing private video storage blocks before any paid model call", status == 503 and len(calls) == before)
        status, cfg = call("GET", "/api/super/config")
        check("subscription assistant exposes Astra, Sol and Terra", status == 200 and {"gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra"}.issubset({m["id"] for m in cfg["models"]}) and cfg["services"]["llm"] == "live")
        status, created = call("POST", "/api/super/chats", {})
        chat_id = created["chat"]["id"]
        call("POST", f"/api/super/chats/{chat_id}/messages", {"text": "List the image models", "model": "gpt-6-astra"})
        chat_rows = []
        for _ in range(80):
            _, row_data = call("GET", f"/api/super/chats/{chat_id}/rows")
            chat_rows = row_data.get("rows", [])
            if any("Fixture subscription reply" in str(r.get("body", {}).get("text", "")) for r in chat_rows):
                break
            time.sleep(0.1)
        check("subscription bridge completes a tool call and replays its result", any("Fixture subscription reply" in str(r.get("body", {}).get("text", "")) for r in chat_rows))
        status, product = call("POST", "/api/ads/products", {"name": "Fixture cup", "description": "A blue ceramic cup"})
        status, copy = call("POST", "/api/ads/copy", {"productId": product["product"]["id"], "count": 2, "seconds": 15})
        check("ad copy uses the subscription bridge and validates its structured output", status == 200 and copy.get("writer") == "codex-subscription" and len(copy.get("copy", [])) == 2 and copy.get("script") == "Fixture spoken product script.")
        requests = [json.loads(line) for line in (fake_root / "agent/requests.jsonl").read_text().splitlines()]
        check("subscription dispatch uses Astra for chat and Terra for copy without fake external tools", requests[0]["model"] == "gpt-6-astra" and requests[-1]["model"] == "gpt-6.1-terra" and all(not any(name.startswith(("computer_", "connector_")) for name in r["tools"]) for r in requests))
        call("POST", "/api/settings/provider", {"speechAppId": ""})
        if os.environ.get("CHROME_BIN"):
            call("POST", "/api/settings/provider", {"dailyBudgetUsd": 5})
            browser_env = dict(env, PARALLAX_TEST_BYTEPLUS="1")
            browser = subprocess.call(["node", "tests/personal-ui.mjs", BASE, str(ROOT / "ui-shots/personal")], cwd=APP, env=browser_env)
            check("personal browser walkthrough", browser == 0)
    finally:
        os.killpg(server.pid, signal.SIGTERM)
        server.wait(timeout=15)
        provider.shutdown()

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
