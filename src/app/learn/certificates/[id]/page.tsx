import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg } from "@/server/guards";
import { certificateForPrint } from "@/server/services/certificates";
import { CertificateView } from "@/components/certificate";
import { NotFoundError, AccessError } from "@/server/org";
import { PrintButton } from "@/components/forms";

export const metadata: Metadata = { title: "Certificate" };
export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrg();
  let c;
  try { c = await certificateForPrint(ctx, (await params).id); } catch (e) { if (e instanceof NotFoundError || e instanceof AccessError) notFound(); throw e; }
  if (c.revokedAt) notFound();
  return (<><div className="no-print mb-4"><PrintButton label="Print or save as PDF" /></div><CertificateView code={c.verificationCode} data={c.data as never} issuedAt={c.issuedAt} /></>);
}
