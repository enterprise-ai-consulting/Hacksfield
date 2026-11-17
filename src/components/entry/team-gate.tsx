"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { errorMessage } from "@/lib/api";
import { logIn, useSession } from "@/lib/session";

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

  if (session.loading) return process.env.NEXT_PUBLIC_HACKSFIELD_TEAM_MODE === "1"
    ? <div className="flex min-h-screen items-center justify-center bg-page text-text-secondary" role="status">Opening Hacksfield…</div>
    : children;
  if (!session.teamMode || session.member) return children;

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 text-text-primary">
      <section className="w-full max-w-md rounded-3xl border border-border-default bg-surface-secondary p-8 shadow-2xl">
        <div className="mb-7 flex items-center gap-3 text-brand"><LogoMark size={34} /><span className="text-3xl font-semibold">Hacksfield</span></div>
        <h1 className="text-2xl font-semibold">EAIC team sign-in</h1>
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
    </main>
  );
}
