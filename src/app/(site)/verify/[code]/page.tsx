import Link from "next/link";
import type { Metadata } from "next";
import { verifyCertificate } from "@/server/services/certificates";
import { Alert } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Verify({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).slice(0, 40);
  const c = await verifyCertificate(code);
  return (
    <div className="container-page max-w-xl py-14">
      <h1 className="text-3xl">Certificate verification</h1>
      {!c ? <div className="mt-6"><Alert tone="error">No certificate was found with the code <strong>{code}</strong>. Check the code and try again.</Alert></div> : (
        <div className="card card-pad mt-6">
          {c.valid ? <Alert tone="ok">This certificate is genuine.</Alert> : <Alert tone="warn">This certificate was issued but has since been revoked.</Alert>}
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="text-mist">Awarded to</dt><dd className="font-semibold text-navy">{c.learner}</dd></div>
            <div><dt className="text-mist">Curriculum</dt><dd className="font-semibold text-navy">{c.curriculum}</dd></div>
            <div><dt className="text-mist">Session</dt><dd>{c.session}</dd></div>
            <div><dt className="text-mist">Church</dt><dd>{c.church}</dd></div>
            <div><dt className="text-mist">Issued</dt><dd>{fmtDate(c.issuedAt as Date)}</dd></div>
          </dl>
        </div>
      )}
      <p className="mt-6 text-sm"><Link href="/verify">Verify another certificate</Link></p>
    </div>
  );
}
