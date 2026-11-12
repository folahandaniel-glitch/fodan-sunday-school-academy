import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/forms";
import { forgotAction } from "@/app/actions/auth";
import { getT } from "@/server/ui-text";

export const metadata: Metadata = { title: "Reset your password" };

export default async function Forgot() {
  const t = await getT();
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">{t("Reset your password")}</h1>
      <p className="mt-1 text-sm text-mist">{t("Enter your email or username. If you registered without an email, ask your church administrator to reset it for you.")}</p>
      <ActionForm action={forgotAction} submit={t("Send reset link")} className="mt-4" submitClass="w-full">
        <div><label className="label" htmlFor="identifier">{t("Email or username")}</label><input id="identifier" name="identifier" className="input" required autoFocus /></div>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login">{t("Back to sign in")}</Link></p>
    </div>
  );
}
