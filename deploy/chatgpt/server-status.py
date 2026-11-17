#!/usr/bin/env python3
"""Safe operator status for the systemd-managed private ChatGPT connection."""
import json
import pathlib
import subprocess
import urllib.parse
import urllib.request


def main():
    running = subprocess.run(["systemctl", "is-active", "--quiet", "hacksfield-chatgpt.service"]).returncode == 0
    healthy = ready = False
    try:
        raw = pathlib.Path("/var/lib/hacksfield/chatgpt/health.url").read_text().strip()
        url = urllib.parse.urlsplit(raw)
        if url.scheme != "http" or url.hostname != "127.0.0.1" or url.username or url.password:
            raise ValueError("Invalid local health address")
        origin = f"http://127.0.0.1:{url.port}"
        with urllib.request.urlopen(origin + "/healthz", timeout=3) as response:
            healthy = response.status == 200
        with urllib.request.urlopen(origin + "/readyz", timeout=3) as response:
            ready = response.status == 200
    except (OSError, ValueError):
        pass
    print(json.dumps({"alias": "hacksfield-chatgpt", "host": "server", "process_running": running,
                      "healthy": healthy, "ready": ready, "runtime_state": "ready" if ready else "starting" if running else "stopped"}))


if __name__ == "__main__":
    main()
