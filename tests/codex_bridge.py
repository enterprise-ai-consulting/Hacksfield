"""Offline contract checks for Hermes's namespace response objects."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).parents[1] / "scripts/codex-subscription.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_namespace_message_and_tool_calls(self):
        message = NS(role="assistant", content="Creating your image", tool_calls=[NS(
            id="call_1", type="function", function=NS(name="generate_media", arguments='{"kind":"image"}')
        )])
        self.assertEqual(bridge.serialize_message(message), {
            "role": "assistant", "content": "Creating your image", "tool_calls": [{
                "id": "call_1", "type": "function", "function": {"name": "generate_media", "arguments": '{"kind":"image"}'}
            }]
        })

    def test_empty_tools_are_omitted(self):
        self.assertEqual(bridge.serialize_message(NS(role="assistant", content="Hello", tool_calls=None)), {
            "role": "assistant", "content": "Hello"
        })


if __name__ == "__main__":
    unittest.main(argv=[__file__])
