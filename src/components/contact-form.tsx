import { ActionForm } from "./forms";
import { contactAction } from "@/app/actions/public";
import { getT } from "@/server/ui-text";

export async function ContactForm() {
  const t = await getT();
  return (
    <ActionForm action={contactAction} submit={t("Send message")} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="c-name">{t("Your name")}</label><input id="c-name" name="name" className="input" required maxLength={100} autoComplete="name" /></div>
        <div><label className="label" htmlFor="c-email">{t("Email")}</label><input id="c-email" name="email" type="email" className="input" required maxLength={200} autoComplete="email" /></div>
      </div>
      <div><label className="label" htmlFor="c-msg">{t("Message")}</label><textarea id="c-msg" name="message" className="input" rows={5} required minLength={10} maxLength={4000} /></div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
    </ActionForm>
  );
}
