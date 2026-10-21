import type { Metadata } from "next";
import { ActionForm, PasswordInput } from "@/components/forms";
import { resetAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">Choose a new password</h1>
      <ActionForm action={resetAction} submit="Change password" className="mt-4" submitClass="w-full">
        <input type="hidden" name="token" value={token} />
        <div><label className="label" htmlFor="password">New password</label><PasswordInput id="password" autoComplete="new-password" minLength={8} /><p className="hint">At least 8 characters (12 for administrators) with a letter and a number.</p></div>
      </ActionForm>
    </div>
  );
}
