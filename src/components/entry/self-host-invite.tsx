"use client";

import { Check, CodeXml, Copy } from "lucide-react";
import { useState } from "react";
import { selfHost } from "@/content/self-host";

export function SelfHostInvite() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(selfHost.command);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <section aria-labelledby="private-studio-heading" className="min-w-0 py-2 lg:py-6">
      <h1 id="private-studio-heading" className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">This studio is for EAIC.</h1>
      <p className="mt-5 max-w-xl text-lg leading-7 text-text-secondary">This installation is reserved for the EAIC team. Hacksfield itself is fully open source and free to install, customise and host yourself.</p>

      <div className="mt-9 overflow-hidden rounded-2xl border border-border-default bg-surface-primary">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-4">
          <h2 className="font-semibold">Run your own Hacksfield</h2>
          <button onClick={copyCommand} type="button" aria-live="polite" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-brand transition-colors hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy command"}
          </button>
        </div>
        <pre tabIndex={0} aria-label="Hacksfield install command" className="overflow-x-auto px-5 py-6 font-mono text-sm leading-6 text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"><code>{selfHost.command}</code></pre>
        <p className="px-5 pb-5 text-sm leading-5 text-text-secondary">Paste into Terminal on macOS or Linux. It installs a separate copy in your home folder and starts your local studio.</p>
      </div>
      {copyError && <p role="status" className="mt-3 text-sm text-text-secondary">Select the command above and copy it manually.</p>}

      <p className="mt-5 max-w-xl text-sm leading-6 text-text-secondary">No Hacksfield membership fee. Connect your own provider accounts; image, video and audio providers may charge for usage.</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium">
        <a href={selfHost.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-text-primary underline-offset-4 hover:underline"><CodeXml className="size-4" aria-hidden />Source &amp; setup guide</a>
        <a href={selfHost.scriptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">Read the install script</a>
      </div>
    </section>
  );
}
