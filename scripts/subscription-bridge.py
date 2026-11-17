#!/usr/bin/env python3
"""Loopback-only subscription relay for an SSH forward. No prompt/credential logs."""
import hmac
import json
import os
import pathlib
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(os.environ["PARALLAX_HERMES_ROOT"])
SCRIPT = pathlib.Path(__file__).with_name("codex-subscription.py")
KEY = pathlib.Path(os.environ["HACKSFIELD_SUBSCRIPTION_BRIDGE_KEY_FILE"]).read_text().strip()
if len(KEY) < 32:
    raise SystemExit("A private relay key is required.")
SLOTS = threading.BoundedSemaphore(2)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def authorized(self):
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + KEY)

    def do_GET(self):
        if not self.authorized():
            return self.respond(401, {"error": "unauthorized"})
        return self.respond(200 if self.path == "/health" else 404, {"ready": self.path == "/health"})

    def do_POST(self):
        if not self.authorized():
            return self.respond(401, {"error": "unauthorized"})
        if self.path != "/respond":
            return self.respond(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 12_000_000:
                return self.respond(413, {"error": "invalid request size"})
            self.connection.settimeout(20)
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict) or not isinstance(request.get("messages"), list) or not isinstance(request.get("model"), str) or set(request) - {"model", "messages", "tools"}:
                return self.respond(400, {"error": "invalid request"})
        except (ValueError, OSError):
            return self.respond(400, {"error": "invalid request"})
        if not SLOTS.acquire(blocking=False):
            return self.respond(429, {"error": "subscription busy"})
        try:
            self.connection.settimeout(260)
            result = subprocess.run([str(ROOT / "venv/bin/python"), str(SCRIPT)], cwd=ROOT,
                                    input=json.dumps(request), capture_output=True, text=True, timeout=240,
                                    env={**os.environ, "HERMES_HOME": os.environ.get("PARALLAX_HERMES_HOME", str(pathlib.Path.home() / ".hermes"))})
            data = json.loads(result.stdout) if result.returncode == 0 else {}
            if not isinstance(data, dict) or not isinstance(data.get("message"), dict) or data.get("error"):
                return self.respond(503, {"error": "subscription unavailable"})
            return self.respond(200, {"message": data["message"]})
        except (ValueError, OSError, subprocess.TimeoutExpired):
            return self.respond(503, {"error": "subscription unavailable"})
        finally:
            SLOTS.release()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("HACKSFIELD_SUBSCRIPTION_BRIDGE_PORT", "3311"))), Handler).serve_forever()
