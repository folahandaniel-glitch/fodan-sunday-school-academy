import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSetting } from "@/server/settings";
import { getT } from "@/server/ui-text";

export const metadata: Metadata = { title: "Verify a certificate" };

export default async function VerifyIndex() {
  const pt = (await getSetting("pageText")).verify;
  const t = await getT();
  async function go(fd: FormData) { "use server"; const c = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""); if (c) redirect(`/verify/${c}`); }
  return (
    <div className="container-page max-w-xl py-14">
      <h1 className="text-3xl">{pt.title}</h1>
      <p className="mt-2 text-mist">{pt.intro}</p>
      <form action={go} className="mt-6 space-y-3"><label className="label" htmlFor="code">{t("Verification code")}</label><input id="code" name="code" className="input" required autoComplete="off" /><button className="btn btn-primary">{t("Verify")}</button></form>
    </div>
  );
}
