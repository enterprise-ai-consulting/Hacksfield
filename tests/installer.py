"""Offline installer integration tests. Runner: own-server
No package downloads or provider requests; fixtures manage their own environment.
"""
import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hacksfield-installer-")
        self.base = pathlib.Path(self.temp.name)
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.target = self.base / "My own studio"
        self.log = self.base / "calls.jsonl"
        self.env = dict(os.environ, HOME=str(self.base), PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        HACKSFIELD_INSTALL_DIR=str(self.target), INSTALL_TEST_BASE=str(self.base),
                        HACKSFIELD_TEAM_EMAILS="private@example.test", NEXT_PUBLIC_HACKSFIELD_TEAM_MODE="1",
                        PARALLAX_DATA_DIR="/never-use-the-parent-data", INSTALL_TEST_OS="Linux", INSTALL_TEST_ARCH="x86_64")
        self.make("uname", '#!/bin/bash\ncase "$1" in -s) echo "$INSTALL_TEST_OS";; -m) echo "$INSTALL_TEST_ARCH";; esac\n')
        self.node = '#!/bin/bash\nprintf "%s\\n" "${INSTALL_TEST_NODE_VERSION:-v24.22.3}"\n'
        self.make("node", self.node)
        self.npm = "#!" + sys.executable + '''
import json,os,pathlib,sys
args=sys.argv[1:]
row={'args':args,'cwd':str(pathlib.Path.cwd()),'team':os.environ.get('HACKSFIELD_TEAM_EMAILS'),'publicTeam':os.environ.get('NEXT_PUBLIC_HACKSFIELD_TEAM_MODE'),'data':os.environ.get('PARALLAX_DATA_DIR')}
with open(pathlib.Path(os.environ['INSTALL_TEST_BASE'])/'calls.jsonl','a') as f: f.write(json.dumps(row)+'\\n')
if args[:1]==['ci'] and os.environ.get('INSTALL_TEST_FAIL_CI'): sys.exit(9)
if args[:2]==['run','build']:
 pathlib.Path('.next').mkdir(exist_ok=True); pathlib.Path('.next/BUILD_ID').write_text('offline-build')
'''
        self.make("npm", self.npm)
        self.make("curl", "#!" + sys.executable + '''
import os,pathlib,shutil,sys
args=sys.argv[1:]; url=next(x for x in args if x.startswith('https://')); target=args[args.index('-o')+1]
base=pathlib.Path(os.environ['INSTALL_TEST_BASE'])
name='source.tar.gz' if 'github.com/' in url else 'SHASUMS256.txt' if url.endswith('SHASUMS256.txt') else 'node.tar.gz'
shutil.copyfile(base/name,target)
''')
        self.archive(self.base / "source.tar.gz", {"Hacksfield-main/package.json": '{"name":"hacksfield"}', "Hacksfield-main/package-lock.json": '{}'})

    def tearDown(self):
        self.temp.cleanup()

    def make(self, name, content):
        p = self.bin / name
        p.write_text(content)
        p.chmod(0o755)

    def archive(self, path, files):
        with tarfile.open(path, "w:gz") as archive:
            for name, text in files.items():
                raw = text.encode()
                info = tarfile.TarInfo(name)
                info.mode = 0o755 if name.endswith(("/node", "/npm")) else 0o644
                info.size = len(raw)
                archive.addfile(info, io.BytesIO(raw))

    def run_installer(self, *args):
        return subprocess.run(["/bin/bash", str(ROOT / "install.sh"), *args], env=self.env, text=True, capture_output=True, timeout=15)

    def calls(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_fresh_install_builds_and_starts_with_its_own_local_data(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual([c["args"] for c in calls], [["ci", "--ignore-scripts", "--include=dev"], ["run", "build"], ["start", "--", "-p", "3000"]])
        self.assertTrue(all(c["cwd"] == str(self.target.resolve()) for c in calls))
        self.assertTrue(all(c["team"] is None and c["publicTeam"] is None for c in calls))
        self.assertEqual(calls[-1]["data"], str(self.target.resolve() / "data"))
        self.assertTrue((self.target / "start.sh").is_file())
        self.assertFalse((self.target / ".env.local").exists())

    def test_existing_directory_is_never_overwritten(self):
        self.target.mkdir()
        sentinel = self.target / "my-private-settings"
        sentinel.write_text("keep this")
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("already exists", result.stderr)
        self.assertEqual(sentinel.read_text(), "keep this")
        self.assertEqual(self.calls(), [])

    def test_failed_dependency_install_never_starts_the_app(self):
        self.env["INSTALL_TEST_FAIL_CI"] = "1"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([c["args"] for c in self.calls()], [["ci", "--ignore-scripts", "--include=dev"]])

    def test_private_node_runtime_is_verified_and_bad_downloads_are_rejected(self):
        self.env["INSTALL_TEST_NODE_VERSION"] = "v20.19.2"
        prefix = "node-v24.22.3-linux-x64"
        self.archive(self.base / "node.tar.gz", {prefix + "/bin/node": self.node.replace('${INSTALL_TEST_NODE_VERSION:-v24.22.3}', 'v24.22.3'), prefix + "/bin/npm": self.npm})
        digest = hashlib.sha256((self.base / "node.tar.gz").read_bytes()).hexdigest()
        manifest = self.base / "SHASUMS256.txt"
        manifest.write_text(digest + "  " + prefix + ".tar.gz\n")
        result = self.run_installer("--no-start")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.target / ".hacksfield/runtime/bin/node").exists())
        self.assertNotIn(["start", "--", "-p", "3000"], [c["args"] for c in self.calls()])
        self.env["HACKSFIELD_INSTALL_DIR"] = str(self.base / "bad-checksum")
        manifest.write_text("0" * 64 + "  " + prefix + ".tar.gz\n")
        result = self.run_installer("--no-start")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum", result.stderr.lower())

    def test_apple_silicon_can_bootstrap_a_private_runtime(self):
        self.env.update(INSTALL_TEST_NODE_VERSION="v18.20.0", INSTALL_TEST_OS="Darwin", INSTALL_TEST_ARCH="arm64")
        prefix = "node-v24.22.3-darwin-arm64"
        self.archive(self.base / "node.tar.gz", {prefix + "/bin/node": self.node.replace('${INSTALL_TEST_NODE_VERSION:-v24.22.3}', 'v24.22.3'), prefix + "/bin/npm": self.npm})
        digest = hashlib.sha256((self.base / "node.tar.gz").read_bytes()).hexdigest()
        (self.base / "SHASUMS256.txt").write_text(digest + "  " + prefix + ".tar.gz\n")
        result = self.run_installer("--no-start")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.target / ".hacksfield/runtime/bin/node").exists())


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
