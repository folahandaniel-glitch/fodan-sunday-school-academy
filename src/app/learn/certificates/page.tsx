import Link from "next/link";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { myCertificates } from "@/server/services/certificates";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/text";

export const metadata: Metadata = { title: "Certificates" };
export const dynamic = "force-dynamic";

export default async function Certificates() {
  const { ctx } = await requireOrg("learn");
  const rows = await myCertificates(ctx);
  return (
    <>
      <PageHeader title="Certificates" sub="Certificates are issued by your church when you meet its completion requirements." />
      {rows.length === 0 ? <Empty title="No certificates yet">Keep attending, finish your lessons and take the final examination.</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">{rows.map((c) => { const d = c.data as { curriculum?: string; session?: string }; return (
          <li key={c.id} className="card card-pad"><h2 className="text-lg">{d.curriculum}</h2><p className="text-sm text-mist">{d.session} · issued {fmtDate(c.issuedAt)}</p><p className="mt-1 font-mono text-xs">{c.verificationCode}{c.revokedAt && " (revoked)"}</p>
            {!c.revokedAt && <Link className="btn btn-primary btn-sm mt-3" href={`/learn/certificates/${c.id}`}>View and print</Link>}</li>); })}</ul>
      )}
    </>
  );
}
