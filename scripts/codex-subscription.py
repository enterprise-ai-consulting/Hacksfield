"""Hacksfield text/tool calls through Hermes's existing ChatGPT subscription adapter.

Credentials stay in the Hermes profile. No model inference runs in --status mode.
"""
import json
import logging
import os
from pathlib import Path
import sys

ALLOWED_MODELS = {"gpt-6-astra", "gpt-6.1-terra", "gpt-6.1-sol"}


def serialize_message(message):
    """Hermes returns SimpleNamespace messages rather than SDK/Pydantic objects."""
    result = {"role": "assistant"}
    if message.content is not None:
        result["content"] = message.content
    if message.tool_calls:
        result["tool_calls"] = [{
            "id": call.id, "type": "function",
            "function": {"name": call.function.name, "arguments": call.function.arguments},
        } for call in message.tool_calls]
    return result


def main():
    root = Path(os.environ.get("PARALLAX_HERMES_ROOT", Path.home() / ".hermes/hermes-agent"))
    sys.path.insert(0, str(root))
    from agent.secret_scope import build_profile_secret_scope, set_secret_scope
    set_secret_scope(build_profile_secret_scope(Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))))
    from agent.auxiliary_client import _build_codex_client
    if "--status" in sys.argv:
        client, _ = _build_codex_client("gpt-6-astra")
        print(json.dumps({"configured": client is not None, "provider": "openai-codex", "billing": "subscription"}))
        if client:
            client.close()
        return
    raw = sys.stdin.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError("request too large")
    request = json.loads(raw)
    model = request.get("model")
    if model not in ALLOWED_MODELS:
        raise ValueError("unsupported subscription model")
    client, _ = _build_codex_client(model)
    if client is None:
        raise RuntimeError("ChatGPT sign-in required")
    try:
        from urllib.parse import urlparse
        if urlparse(str(client.base_url)).hostname != "chatgpt.com":
            raise RuntimeError("a ChatGPT subscription endpoint is required")
        client._real_client.max_retries = 0
        response = client.chat.completions.create(
            model=model, messages=request["messages"], tools=request.get("tools") or None,
            timeout=210, extra_body={"reasoning": {"effort": "medium"}},
        )
        print(json.dumps({"message": serialize_message(response.choices[0].message)}))
    finally:
        client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
    try:
        main()
    except Exception:
        print(json.dumps({"error": "Codex subscription request failed; check Hermes authentication or plan limits."}))
        sys.exit(1)
