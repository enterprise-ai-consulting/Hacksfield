"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { errorMessage } from "@/lib/api";
import { logIn, useSession } from "@/lib/session";
import { SelfHostInvite } from "./self-host-invite";

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
    <main className="min-h-screen bg-page px-5 py-8 text-text-primary sm:px-8 lg:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10 flex items-center gap-3 text-brand lg:mb-16"><LogoMark size={34} /><span className="text-3xl font-semibold">Hacksfield</span></div>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:gap-16">
          <SelfHostInvite />
          <section aria-labelledby="team-sign-in" className="w-full rounded-3xl border border-border-default bg-surface-secondary p-7 sm:p-8">
            <h2 id="team-sign-in" className="text-2xl font-semibold">EAIC team sign-in</h2>
            <p className="mt-2 text-sm text-text-secondary">Use your invited work account to open the studio.</p>
            <form onSubmit={submit} className="mt-7 flex flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm">Work email
                <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl border border-border-default bg-page px-3 text-base" />
              </label>
              <label className="flex flex-col gap-2 text-sm">Password
                <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded-xl border border-border-default bg-page px-3 text-base" />
              </label>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button type="submit" disabled={busy} className="h-12 rounded-xl bg-brand text-base font-semibold text-black disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
            </form>
            <p className="mt-6 text-xs leading-5 text-text-secondary">Membership-free studio. Provider usage uses the shared studio budget.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
