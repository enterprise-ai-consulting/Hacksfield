// Run only from personal_byteplus.py, which supplies an isolated local provider.
import { launch, scenario } from "./ui/browser.mjs";
if (process.env.PARALLAX_TEST_BYTEPLUS !== "1") throw new Error("Use tests/run.py tests/personal_byteplus.py with CHROME_BIN set.");
const [base, out] = process.argv.slice(2);
const b = await launch({ out });
let ok = false;
try {
  ok = await scenario(b, [
    ["personal settings show the provider without subscription prompts", async () => {
      await b.goto(`${base}/settings/provider`);
      await b.until(`document.body.innerText.includes("Platform key saved")`);
      if (await b.evaluate(`!!document.querySelector('[data-closable="promo"]') || document.querySelectorAll('a[href="/pricing"]').length > 0`)) throw new Error("financial promotion remains in the shell");
      await b.shot("01-settings");
    }],
    ["saving a key clears the password and never returns it", async () => {
      await b.click('input[name="byteplus-api-key"]');
      await b.type("test-byteplus-platform-secret");
      await b.click("button", "Save connection");
      await b.until(`document.body.innerText.includes("New generations use these settings immediately")`);
      if (await b.evaluate(`document.querySelector('input[type="password"]').value !== ""`)) throw new Error("password was not cleared");
      const exposed = await b.evaluate(`fetch('/api/settings/provider').then(r => r.text()).then(t => t.includes('test-byteplus-platform-secret'))`);
      if (exposed) throw new Error("settings exposed the credential");
    }],
    ["image studio defaults to direct Seedream and displays provider dollars", async () => {
      await b.goto(`${base}/image`);
      await b.until(`!!document.querySelector('button[aria-label="Model: Seedream 5.5"]')`);
      if (!(await b.evaluate(`!!document.querySelector('button[aria-label="Generate, $0.035 provider cost"]')`))) throw new Error("provider price missing");
    }],
    ["a browser generation reaches the provider and stores an image", async () => {
      await b.click("textarea");
      await b.type("A mountain lake from the browser");
      await b.click("button", "Generate");
      await b.until(`document.querySelectorAll('ul[aria-label="Your images"] img').length >= 1`, 20000, "provider image");
      await b.shot("02-image");
    }],
    ["video studio offers direct Seedance", async () => {
      await b.goto(`${base}/video`);
      await b.until(`document.body.innerText.includes("Seedance 2.5")`);
      await b.shot("03-video");
    }],
    ["speech generates an audio player through its own provider", async () => {
      await b.goto(`${base}/audio`);
      await b.until(`!!document.querySelector('button[aria-label="Model: Seed Speech 2.0"]')`);
      await b.click("#audio-form textarea");
      await b.type("Hello from the native Speech studio.");
      await b.click("button", "Generate");
      await b.until(`!!document.querySelector('ul[aria-label="Your audio"] audio')`, 20000, "speech audio player");
      await b.until(`document.querySelector('ul[aria-label="Your audio"] audio')?.duration > 0`, 10000, "playable speech metadata");
      await b.shot("04-speech");
    }],
    ["music shows the short clip limits and produces an MP3 player", async () => {
      await b.click('[role="tab"]', "Music");
      await b.until(`!!document.querySelector('button[aria-label="Model: Seedance 2.5 Soundtrack"]')`);
      if (!(await b.evaluate(`document.querySelector('#audio-form').innerText.includes('4–15 second')`))) throw new Error("music duration limit missing");
      await b.click("#audio-form textarea");
      await b.type("A bright piano melody");
      await b.click("button", "Generate");
      await b.until(`document.querySelectorAll('ul[aria-label="Your audio"] audio').length >= 2`, 20000, "music audio player");
      await b.until(`document.querySelector('ul[aria-label="Your audio"] audio')?.duration > 0`, 10000, "playable music metadata");
      await b.shot("05-music");
    }],
    ["pricing opens connection settings with no subscription checkout", async () => {
      await b.goto(`${base}/pricing`);
      await b.until(`location.pathname === "/settings/provider"`);
      await b.until(`document.querySelector("h1")?.textContent === "Generation settings"`);
    }],
  ]);
} finally {
  await b.close();
}
process.exit(ok ? 0 : 1);
