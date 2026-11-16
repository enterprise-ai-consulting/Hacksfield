# Initial Hacksfield publication checks

Checked 16 November 2026 against a fresh source copy without the working
installation's environment file, credentials, database, generated media, or tunnel.

- Production build and TypeScript: passed.
- ESLint: passed.
- Unit checks: 49/49 passed, including default membership-free behaviour.
- Isolated API checks: 140/140 passed (96 developer/MCP checks and 44 personal-provider checks).
- Registry: all 11,878 model/control combinations have prices or explicit usage reservations.
- npm audit: zero reported vulnerabilities across the dependency tree after updating
  the TypeScript ESLint tooling and its vulnerable minimatch dependency.
- Publication-source secret scan: no findings. Two upstream documentation/test
  placeholder strings were replaced to avoid misleading generic-key alerts.
- Exact private-value comparison: no working-installation credentials or account
  settings found in any proposed publication file.
- Original upstream MIT licence: retained verbatim.

Tests used fake keys, mocked network calls and local provider stand-ins. No live
paid media or model generation was submitted. Provider permissions and output
quality still depend on the installing user's own accounts and chosen models.

The legacy upstream billing/API tests explicitly select compatibility mode; the
new regression test checks that an unconfigured Hacksfield installation defaults
to membership-free operation on both client and server.

Hacksfield does not bundle an authenticated provider connection. Configure your
own keys after installing; private runtime files are excluded from Git and archives.
