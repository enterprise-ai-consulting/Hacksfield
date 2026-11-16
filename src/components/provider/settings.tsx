"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, errorMessage, fetcher } from "@/lib/api";
import { Button } from "@/ui";

interface Settings {
  configured: boolean;
  speechConfigured: boolean;
  audioConfigured: boolean;
  decartConfigured: boolean;
  speechAppId: string;
  dailyBudgetUsd: number;
  committedUsd: number;
  mode: "live" | "demo";
  imageModel: string;
  videoModel: string;
  storageConfigured: boolean;
  storageBucket: string;
  assistant: "codex-subscription" | "demo";
}

const field = "h-11 w-full rounded-lg border border-border-default bg-surface-field px-3 text-sm text-text-primary outline-none focus:border-brand";

export function ProviderSettings() {
  const { data, error, mutate } = useSWR<Settings>("/api/settings/provider", fetcher);
  const [apiKey, setApiKey] = useState("");
  const [speechApiKey, setSpeechApiKey] = useState("");
  const [audioApiKey, setAudioApiKey] = useState("");
  const [decartApiKey, setDecartApiKey] = useState("");
  const [storage, setStorage] = useState({ tosAccessKeyId: "", tosSecretAccessKey: "", tosBucket: "" });
  const [speechAppId, setSpeechAppId] = useState<string>();
  const [budget, setBudget] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const next = await api<Settings>("/api/settings/provider", { method: "POST", body: { apiKey, speechApiKey, audioApiKey, decartApiKey, ...storage, ...(speechAppId === undefined ? {} : { speechAppId }), dailyBudgetUsd: Number(budget ?? data.dailyBudgetUsd) } });
      await mutate(next, { revalidate: false });
      setApiKey("");
      setSpeechApiKey("");
      setAudioApiKey("");
      setDecartApiKey("");
      setStorage({ tosAccessKeyId: "", tosSecretAccessKey: "", tosBucket: "" });
      setSaved(true);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10 sm:py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-brand">Your personal installation</p>
        <h1 className="font-display text-3xl leading-10 font-bold text-text-primary">Generation settings</h1>
        <p className="text-base leading-6 text-text-secondary">Hacksfield uses your provider account directly. There is no Hacksfield subscription, credit purchase, or markup.</p>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-primary p-5">
        <h2 className="text-lg leading-6 font-semibold text-text-primary">BytePlus images, video, speech and music</h2>
        <p className="text-sm leading-5 text-text-secondary">Your defaults are Seedream 5.5 for images and editing, Seedance 2.5 with sound for video, Seed Speech 2.0 for scripts, and Seedance 2.5 Soundtrack for short music clips. Apps, Cinema, Ads and Remix use the same direct connections. BytePlus applies eligible free allowances to the selected model first.</p>
        <p className="text-sm leading-5 text-text-secondary">Seedream 5.5 costs $0.020 or $0.035 per output image by pixel tier, plus $0.008 per input image before discounts. Each output layer is an image. Videos are billed by actual tokens; Generate shows a conservative reservation for your daily budget.</p>
        <p className="text-sm leading-5 text-text-secondary">The optional Seed Audio 1.0 model uses your free audio minutes, then costs $0.15 per minute. The app reserves $0.30 for its 120-second maximum and records the actual duration. Seedance 1.0 silent video and extra Seedream image models also remain selectable. A failed request never switches models automatically.</p>
        <p className="text-sm leading-5 text-text-secondary">All media tools share the rolling daily budget below. Local video resizing, cropping and frame interpolation have no provider charge. Transparent video cutouts are unavailable.</p>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-primary p-5">
        <h2 className="text-lg leading-6 font-semibold text-text-primary">Codex subscription assistant</h2>
        <p className="text-sm leading-5 text-text-secondary">{data?.assistant === "codex-subscription" ? "Supercomputer and ad copy use your existing ChatGPT sign-in through Hermes. Astra is the default assistant; Sol and Terra are selectable. Your plan’s usage limits apply. No paid API fallback is enabled." : "The Codex subscription adapter has not been enabled on this server."}</p>
        <p className="text-sm leading-5 text-text-secondary">BytePlus media and storage charges are separate from your Codex subscription. The assistant can use Hacksfield’s media tools and library; external email and computer integrations require their own connections.</p>
      </section>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-primary p-5">
          <h2 className="text-lg leading-6 font-semibold text-text-primary">Decart editing {data?.decartConfigured ? "— connected" : "— optional"}</h2>
          <p className="text-sm leading-5 text-text-secondary">Lucy 2.6 edits uploaded videos, Lucy VTON 3.6 changes outfits, Restyle 2 changes a clip’s visual style, and Lucy Image 2 edits images. Select Decart in the image or video studio. BytePlus stays the default.</p>
          <p className="text-sm leading-5 text-text-secondary">Lucy video edits and try-on cost $0.04 per second; Restyle costs $0.01 per second. Image edits cost $0.01 at 480p or $0.02 at 720p. Decart account credits apply first. Both providers share the daily media budget below. Clips are limited to 30 seconds and 30 MB.</p>
          <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
            Decart developer API key
            <input type="password" name="decart-api-key" autoComplete="off" spellCheck={false} value={decartApiKey} onChange={event => { setDecartApiKey(event.target.value); setSaved(false); }} placeholder={data?.decartConfigured ? "Decart key saved — leave blank to keep it" : "Enter your Decart developer API key"} className={field} />
            <span className="font-normal leading-5 text-text-secondary">Stored privately on this Mac. Saving checks your credit balance without generating anything. The API uses your Decart developer account.</span>
          </label>
        </section>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
          ModelArk platform API key
          <input type="password" name="byteplus-api-key" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setSaved(false); }} placeholder={data?.configured ? "Key saved — leave blank to keep it" : "Enter your platform API key"} className={field} />
          <span className="font-normal leading-5 text-text-secondary">Saved only on this Mac. A replacement key is checked with BytePlus before the saved connection changes. Your key is never returned to the browser.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
          Seed Audio API key (modern Speech key)
          <input type="password" name="byteplus-audio-api-key" autoComplete="off" spellCheck={false} value={audioApiKey} onChange={(event) => { setAudioApiKey(event.target.value); setSaved(false); }} placeholder={data?.audioConfigured ? "Audio key available — leave blank to keep it" : "Enter a modern Seed Speech API key"} className={field} />
          <span className="font-normal leading-5 text-text-secondary">Enables the Audio 1.0 free-minute pool. Stored separately so your working legacy speech connection stays intact.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
          Seed Speech API key or access token
          <input type="password" name="byteplus-speech-api-key" autoComplete="off" spellCheck={false} value={speechApiKey} onChange={(event) => { setSpeechApiKey(event.target.value); setSaved(false); }} placeholder={data?.speechConfigured ? "Speech key saved — leave blank to keep it" : "Enter your Seed Speech API key"} className={field} />
          <span className="font-normal leading-5 text-text-secondary">From Seed Speech → API Key in the BytePlus console. For existing applications, use the Access Token from the APP ID section with its APP ID below. Saved privately on this Mac.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
          Legacy Speech APP ID (optional)
          <input type="text" name="byteplus-speech-app-id" inputMode="numeric" autoComplete="off" value={speechAppId ?? data?.speechAppId ?? ""} onChange={(event) => { setSpeechAppId(event.target.value); setSaved(false); }} placeholder="Leave blank for a modern Speech API key" className={field} />
          <span className="font-normal leading-5 text-text-secondary">Use only with a legacy Access Token. Clear this field when switching to an API key.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-text-primary">
          Daily provider budget in USD
          <input type="number" name="daily-budget" min="0" step="0.01" required value={budget ?? String(data?.dailyBudgetUsd ?? 5)} onChange={(event) => { setBudget(event.target.value); setSaved(false); }} className={field} />
          <span className="font-normal leading-5 text-text-secondary">Stops new requests when the previous 24 hours of charges and active reservations reach this amount. Set zero to pause generation.</span>
        </label>
        <details className="rounded-xl border border-border-default p-4">
          <summary className="cursor-pointer text-sm font-medium text-text-primary">Private BytePlus storage for uploaded-video tools {data?.storageConfigured ? "— connected" : "— not connected"}</summary>
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm leading-5 text-text-secondary">Required for BytePlus video editing, extension, lip sync and motion references. Decart receives uploads directly. Use a private Johor TOS bucket with one-day cleanup and a key restricted to its parallax/ objects. Selected clips receive six-hour signed read links. Storage and transfer fees are outside the media budget.</p>
            {([ ["tosBucket", "Private bucket name"], ["tosAccessKeyId", "Restricted storage access key ID"], ["tosSecretAccessKey", "Restricted storage secret key"] ] as const).map(([name, label]) => (
              <label key={name} className="flex flex-col gap-2 text-sm font-medium text-text-primary">{label}
                <input type={name === "tosBucket" ? "text" : "password"} autoComplete="off" spellCheck={false} value={storage[name]} onChange={event => { setStorage(current => ({ ...current, [name]: event.target.value })); setSaved(false); }} placeholder={name === "tosBucket" && data?.storageBucket ? `${data.storageBucket} — leave blank to keep` : data?.storageConfigured ? "Saved — leave blank to keep" : label} className={field} />
              </label>
            ))}
          </div>
        </details>
        {data ? <p className="text-sm text-text-secondary">{data.configured ? "Platform key saved; model access is checked when you generate." : "A platform key is required before your first real generation."} Committed in the last 24 hours: ${data.committedUsd.toFixed(3)}. {data.mode === "demo" ? "This server is explicitly in demo mode." : "Real generation mode is enabled."}</p> : null}
        {data ? <p className="text-sm text-text-secondary">{data.speechConfigured ? "Speech key saved; voice access is checked when you generate." : "Add the separate Speech key to enable spoken audio."}</p> : null}
        {data ? <p className="text-sm text-text-secondary">{data.audioConfigured ? "Audio key saved; Audio 1.0 access is checked when you generate." : "Audio 1.0 needs a modern Speech key. Choosing it will pause with a settings message until connected."}</p> : null}
        {problem || error ? <p role="alert" className="text-sm leading-5 text-danger">{problem ?? errorMessage(error)}</p> : null}
        {saved ? <p role="status" className="text-sm leading-5 text-brand">Saved. New generations use these settings immediately.</p> : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="lime" disabled={busy || Boolean(error) || !data}>{busy ? "Saving…" : "Save connection"}</Button>
          <a href="/image" className="text-sm font-medium text-brand underline">Open image studio</a>
          <a href="/video" className="text-sm font-medium text-brand underline">Open video studio</a>
          <a href="/audio" className="text-sm font-medium text-brand underline">Open audio studio</a>
        </div>
      </form>
    </div>
  );
}
