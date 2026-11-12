import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, ChurchPicker, PasswordInput } from "@/components/forms";
import { registerMemberAction } from "@/app/actions/auth";
import { getSetting } from "@/server/settings";
import { Alert } from "@/components/ui";
import { getT } from "@/server/ui-text";

export const metadata: Metadata = { title: "Create a member account" };
export const dynamic = "force-dynamic";

export default async function Register() {
  const f = await getSetting("features");
  const t = await getT();
  if (!f.memberRegistrationOpen) return <Alert tone="warn">{t("Member registration is currently closed. Please contact the Academy.")}</Alert>;
  return (
    <div className="card card-pad mx-auto max-w-xl">
      <h1 className="text-2xl">{t("Create a member account")}</h1>
      <p className="mt-1 text-sm text-mist">{t("Choose your church. You will only see your own church's classes and lessons, once its administrator approves you. Every member can take part in the community forum straight away.")}</p>
      <ActionForm action={registerMemberAction} submit={t("Create my account")} className="mt-4" submitClass="w-full">
        <div><label className="label" htmlFor="fullName">{t("Full name")}</label><input id="fullName" name="fullName" className="input" required minLength={2} maxLength={120} autoComplete="name" /></div>
        <div><label className="label" htmlFor="email">{t("Email")}</label><input id="email" name="email" type="email" className="input" required autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">{t("Password")}</label><PasswordInput id="password" autoComplete="new-password" minLength={8} /><p className="hint">{t("At least 8 characters with a letter and a number. Avoid your name or common passwords.")}</p></div>
        <fieldset><legend className="label">{t("I am joining as")}</legend>
          <label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="role" value="learner" defaultChecked /> {t("A learner")}</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="role" value="teacher" /> {t("A Sunday school teacher")}</label>
          <p className="hint">{t("Teachers are approved by the church administrator.")}</p></fieldset>
        <ChurchPicker />
        <div><label className="label" htmlFor="joinCode">{t("Church join code (optional)")}</label><input id="joinCode" name="joinCode" className="input uppercase" autoComplete="off" placeholder="XXXX-XXXX" /><p className="hint">{t("If your church gave you a code, enter it to be approved immediately.")}</p></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="isThirteenOrOlder" className="mt-1 h-4 w-4" required /> <span>{t("I am 13 or older. (Younger children are registered by their church.)")}</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4" required /> <span>{t("I accept the")} <Link href="/p/terms">{t("terms of service")}</Link> {t("and")} <Link href="/p/privacy">{t("privacy notice")}</Link>.</span></label>
      </ActionForm>
      <p className="mt-4 text-sm text-mist">{t("Already have an account?")} <Link href="/login" className="font-semibold">{t("Sign in")}</Link>. {t("Church leader?")} <Link href="/register/church" className="font-semibold">{t("Register your church")}</Link>.</p>
    </div>
  );
}
