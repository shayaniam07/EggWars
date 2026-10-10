"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";

/** Admin sign-in. The real permission check happens server-side. */
export default function AdminLogin({ signedInAs }: { signedInAs: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ew-bg grid min-h-[100dvh] place-items-center p-4">
      <div className="ew-pop w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/85 p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="text-5xl">🛡️</div>
          <h1 className="mt-2 text-xl font-black uppercase tracking-widest text-rose-300">Admin Panel</h1>
          {signedInAs && (
            <p className="mt-1 text-[11px] text-amber-300">
              Signed in as {signedInAs} — this account has no administrator role.
            </p>
          )}
        </div>
        <div className="space-y-3">
          <Field label="Admin email">
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@eggwars.gg" />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300">{error}</p>}
          <Btn className="w-full" variant="danger" loading={busy} onClick={submit}>Sign in</Btn>
          <Btn className="w-full" variant="ghost" onClick={() => router.push("/")}>← Back to game</Btn>
        </div>
      </div>
    </div>
  );
}
