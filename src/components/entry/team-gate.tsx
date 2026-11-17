"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { errorMessage } from "@/lib/api";
import { logIn, useSession } from "@/lib/session";
import { SelfHostInvite } from "./self-host-invite";
import { StudioBackdrop } from "./studio-backdrop";

/** The API enforces invitations independently of this sign-in screen. */
export function TeamGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await logIn({ email, password }); setPassword(""); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const teamBuild = process.env.NEXT_PUBLIC_HACKSFIELD_TEAM_MODE === "1";
  if ((!session.teamMode && !teamBuild) || session.member) return children;

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-page px-4 py-5 text-text-primary sm:px-8 sm:py-8">
      <StudioBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-brand backdrop-blur-xl"><LogoMark size={30} /><span className="text-2xl font-semibold">Hacksfield</span></div>
          <a href="#team-sign-in" className="inline-flex min-h-11 items-center rounded-full border border-white/15 bg-black/40 px-4 text-xs font-medium backdrop-blur-xl sm:hidden">Team sign-in</a>
        </header>
        <div className="flex flex-1 items-center justify-center py-7 sm:py-10">
        <div className="grid w-full max-w-[960px] overflow-hidden rounded-3xl border border-white/15 bg-[#101114]/85 shadow-[0_24px_100px_#00000080] backdrop-blur-xl sm:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <SelfHostInvite />
          <section aria-labelledby="team-sign-in" className="w-full border-t border-white/10 bg-white/[0.025] px-6 py-7 sm:border-t-0 sm:border-l sm:p-8">
            <h2 id="team-sign-in" className="scroll-mt-5 text-xl font-semibold">EAIC team sign-in</h2>
            <p className="mt-2 text-sm leading-5 text-text-nav">Use your invited work account to open the studio.</p>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm">Work email
                <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl border border-border-default bg-page px-3 text-base" />
              </label>
              <label className="flex flex-col gap-2 text-sm">Password
                <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded-xl border border-border-default bg-page px-3 text-base" />
              </label>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button type="submit" disabled={busy} className="h-12 rounded-xl bg-brand text-base font-semibold text-black disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            <p className="mt-5 text-xs leading-5 text-text-nav">Membership-free studio. Provider usage uses the shared studio budget.</p>
          </section>
        </div>
        </div>
      </div>
    </main>
  );
}
