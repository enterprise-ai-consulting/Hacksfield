"""Invitation-only hosting and account isolation. Runner: own-server
Uses a throwaway database and mock providers; never runs a paid generation.
"""
import http.cookiejar
import json
import os
import pathlib
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

APP, DATA, PORT = sys.argv[1:4]
pathlib.Path(DATA).mkdir(parents=True, exist_ok=True)
BASE = f"http://127.0.0.1:{PORT}"
env = dict(os.environ, PARALLAX_DATA_DIR=DATA, PARALLAX_PERSONAL_MODE="1", COOKIE_SECURE="0",
           BYTEPLUS_MODE="mock", DECART_MODE="mock", SUPER_MODE="mock", PARALLAX_ASSISTANT_PROVIDER="mock")
env.pop("HACKSFIELD_TEAM_EMAILS", None)
checks = 0


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, body=None, status=200, public=False):
        global checks
        headers = {"Content-Type": "application/json"}
        if public:
            headers.update(Host="studio.example.test", **{"X-Forwarded-Host": "studio.example.test", "CF-Ray": "offline-test"})
        req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            response = self.opener.open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        assert response.code == status, (path, response.code, status)
        checks += 1
        return json.load(response)


def start():
    log = open(pathlib.Path(DATA) / "team-server.log", "ab")
    server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", PORT],
                              cwd=APP, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(100):
        try:
            urllib.request.urlopen(BASE + "/api/auth/me", timeout=2)
            return server
        except OSError:
            if server.poll() is not None:
                raise RuntimeError("Test server stopped; inspect the private test log.")
            time.sleep(0.3)
    raise RuntimeError("Test server did not become ready")


def stop(server):
    os.killpg(server.pid, signal.SIGTERM)
    server.wait(timeout=15)


owner, colleague, outsider, guest = [Client() for _ in range(4)]
server = start()
try:
    for client, email in [(owner, "owner@example.test"), (colleague, "colleague@example.test"), (outsider, "outsider@example.test")]:
        client.request("/api/auth/signup", {"email": email, "password": "Offline-Test-Only-987!"})
    guest.request("/api/auth/guest", {})
finally:
    stop(server)

env["HACKSFIELD_TEAM_EMAILS"] = "owner@example.test,colleague@example.test"
server = start()
try:
    anonymous = Client()
    for path in ["/", "/login"]:
        with urllib.request.urlopen(BASE + path, timeout=10) as response:
            html = response.read().decode()
        assert "This studio is for EAIC." in html, "Visitors must see the private-studio message before JavaScript runs"
        assert "raw.githubusercontent.com/enterprise-ai-consulting/Hacksfield/main/install.sh" in html
        assert "owner@example.test" not in html and "colleague@example.test" not in html
        checks += 1
    me = anonymous.request("/api/auth/me", public=True)
    assert me["teamMode"] is True and me["user"] is None
    anonymous.request("/api/settings/provider")  # Private loopback maintenance remains usable.
    for path, body in [("/api/library", None), ("/api/assets/nonexistent/file", None), ("/api/jobs", {}),
                       ("/api/auth/guest", {}), ("/api/auth/signup", {"email": "new@example.test", "password": "Offline-Test-Only-987!"})]:
        anonymous.request(path, body, status=401, public=True)
    for client in [outsider, guest]:
        assert client.request("/api/auth/me", public=True)["user"] is None
        client.request("/api/library", status=401, public=True)
    anonymous.request("/api/auth/login", {"email": "outsider@example.test", "password": "Offline-Test-Only-987!"}, status=403, public=True)
    anonymous.request("/api/auth/login", {"email": "owner@example.test", "password": "wrong-password"}, status=400, public=True)
    fresh = Client()
    signed = fresh.request("/api/auth/login", {"email": "OWNER@example.test", "password": "Offline-Test-Only-987!"}, public=True)
    assert signed["user"]["email"] == "owner@example.test" and signed["teamMode"] is True
    fresh.request("/api/library", public=True)
    owner.request("/api/settings/provider", public=True)
    colleague.request("/api/library", public=True)
    colleague.request("/api/settings/provider", status=403, public=True)
    colleague.request("/api/account/email", {"email": "other@example.test", "password": "Offline-Test-Only-987!"}, status=403, public=True)
    logged_out = fresh.request("/api/auth/logout", {}, public=True)
    assert logged_out["user"] is None and logged_out["teamMode"] is True
    fresh.request("/api/library", status=401, public=True)
    print(f"Team hosting: {checks} offline HTTP checks passed")
finally:
    stop(server)
