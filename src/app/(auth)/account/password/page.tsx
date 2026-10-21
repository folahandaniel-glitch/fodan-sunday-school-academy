import type { Metadata } from "next";
import { ActionForm, PasswordInput } from "@/components/forms";
import { changePasswordAction } from "@/app/actions/auth";
import { requireUser } from "@/server/guards";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Change password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const first = (await searchParams).first === "1";
  await requireUser({ allowPasswordChange: true });
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">{first ? "Choose your own password" : "Change password"}</h1>
      {first && <div className="mt-3"><Alert tone="info">You signed in with a temporary password. Choose a new one to continue.</Alert></div>}
      <ActionForm action={changePasswordAction} submit="Change password" className="mt-4" submitClass="w-full">
        {first && <input type="hidden" name="first" value="1" />}
        {!first && <div><label className="label" htmlFor="current">Current password</label><PasswordInput id="current" name="current" /></div>}
        <div><label className="label" htmlFor="password">New password</label><PasswordInput id="password" autoComplete="new-password" minLength={8} /></div>
        <div><label className="label" htmlFor="confirm">Repeat new password</label><PasswordInput id="confirm" name="confirm" autoComplete="new-password" /></div>
      </ActionForm>
    </div>
  );
}
