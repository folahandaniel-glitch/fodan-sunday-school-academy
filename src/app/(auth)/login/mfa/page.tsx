import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm } from "@/components/forms";
import { mfaAction } from "@/app/actions/auth";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Two-step verification" };
export const dynamic = "force-dynamic";

export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mfaOk) redirect("/app");
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">Two-step verification</h1>
      <p className="mt-1 text-sm text-mist">Enter the 6-digit code from your authenticator app.</p>
      <ActionForm action={mfaAction} submit="Verify" className="mt-4" submitClass="w-full">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div><label className="label" htmlFor="code">Code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" className="input text-center text-2xl tracking-widest" required autoFocus /></div>
      </ActionForm>
    </div>
  );
}
