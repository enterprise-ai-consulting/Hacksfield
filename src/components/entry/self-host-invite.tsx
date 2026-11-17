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
    <section aria-labelledby="private-studio-heading" className="min-w-0 px-6 py-7 sm:p-8">
      <h1 id="private-studio-heading" className="text-3xl leading-tight font-semibold tracking-tight">This studio is for EAIC.</h1>
      <p className="mt-3 text-sm leading-6 text-text-nav">This installation is reserved for the EAIC team. Hacksfield itself is fully open source and free to install, customise and host yourself.</p>

      <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-1">
          <h2 className="text-sm font-semibold">Run your own Hacksfield</h2>
          <button onClick={copyCommand} type="button" aria-label={copied ? "Command copied" : "Copy install command"} aria-live="polite" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-brand transition-colors hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre tabIndex={0} aria-label="Hacksfield install command" className="overflow-x-auto px-4 py-4 font-mono text-xs leading-6 text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"><code>{selfHost.command}</code></pre>
        <p className="px-4 pb-4 text-xs leading-5 text-text-nav">Paste into Terminal on macOS or Linux to install and start your own local copy.</p>
      </div>
      {copyError && <p role="status" className="mt-3 text-sm text-text-secondary">Select the command above and copy it manually.</p>}

      <p className="mt-4 text-xs leading-5 text-text-nav">No Hacksfield membership fee. Connect your own provider accounts; image, video and audio providers may charge for usage.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium">
        <a href={selfHost.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-text-primary underline-offset-4 hover:underline"><CodeXml className="size-4" aria-hidden />Source &amp; setup guide</a>
        <a href={selfHost.scriptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-text-nav underline-offset-4 hover:text-text-primary hover:underline">Read the install script</a>
      </div>
    </section>
  );
}
