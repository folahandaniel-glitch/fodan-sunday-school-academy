"use client";
import { useState } from "react";
import { ActionForm } from "./forms";
import { enableMfaAction, startMfaAction } from "@/app/actions/auth";

export function MfaSetup() {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!setup) return <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={async () => { setBusy(true); try { setSetup(await startMfaAction()); } finally { setBusy(false); } }}>{busy ? "Preparing…" : "Set up"}</button>;
  return (
    <div className="mt-3 space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm"><li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</li><li>Add an account manually and enter this key: <code className="select-all rounded bg-gray-100 px-1 py-0.5 font-mono text-sm">{setup.secret}</code></li><li>Type the 6-digit code it shows below.</li></ol>
      <ActionForm action={enableMfaAction} submit="Turn on">
        <div><label className="label" htmlFor="mfa-code">6-digit code</label><input id="mfa-code" name="code" className="input" inputMode="numeric" autoComplete="one-time-code" required /></div>
      </ActionForm>
    </div>
  );
}
