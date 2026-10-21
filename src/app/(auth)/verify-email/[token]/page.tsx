import Link from "next/link";
import type { Metadata } from "next";
import { verifyEmail } from "@/server/services/auth";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyEmail({ params }: { params: Promise<{ token: string }> }) {
  const r = await verifyEmail((await params).token);
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">Confirm your email</h1>
      <div className="mt-3">{r.ok ? <Alert tone="ok">Thank you. Your email address is confirmed.</Alert> : <Alert tone="error">{r.error}</Alert>}</div>
      <p className="mt-4"><Link className="btn btn-primary" href="/login">Continue to sign in</Link></p>
    </div>
  );
}
