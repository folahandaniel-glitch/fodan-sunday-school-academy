import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Verify a certificate" };

export default async function VerifyIndex() {
  const pt = (await getSetting("pageText")).verify;
  async function go(fd: FormData) { "use server"; const c = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""); if (c) redirect(`/verify/${c}`); }
  return (
    <div className="container-page max-w-xl py-14">
      <h1 className="text-3xl">{pt.title}</h1>
      <p className="mt-2 text-mist">{pt.intro}</p>
      <form action={go} className="mt-6 space-y-3"><label className="label" htmlFor="code">Verification code</label><input id="code" name="code" className="input" required autoComplete="off" /><button className="btn btn-primary">Verify</button></form>
    </div>
  );
}
