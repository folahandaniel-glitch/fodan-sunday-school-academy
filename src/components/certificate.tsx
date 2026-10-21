import { Logo } from "./logo";
import { getSetting } from "@/server/settings";
import { appUrl } from "@/server/url";
import { fmtDate } from "@/lib/text";

export async function CertificateView({ code, data, issuedAt }: { code: string; data: { learner?: string; curriculum?: string; session?: string; church?: string; finalPercent?: number | null }; issuedAt: Date | string | null }) {
  const [cert, brand] = await Promise.all([getSetting("certificate"), getSetting("brand")]);
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border-[10px] border-double border-gold bg-white p-8 text-center sm:p-12 print:border-[8px]">
      <Logo placement="certificate" height={110} alt={brand.siteName} className="mx-auto" />
      <p className="mt-6 text-sm uppercase tracking-[0.3em] text-gold-700">{cert.title}</p>
      <p className="mt-6 text-sm text-mist">This is to certify that</p>
      <p className="mt-2 font-display text-4xl text-navy sm:text-5xl">{data.learner}</p>
      <p className="mt-4 text-sm text-mist">has completed the Sunday school curriculum</p>
      <p className="mt-2 font-display text-2xl text-brand">{data.curriculum}</p>
      <p className="mt-2 text-sm">{data.session} · {data.church}</p>
      <div className="mt-10 grid grid-cols-2 items-end gap-6 text-sm">
        <div><p className="border-t border-ink pt-1 font-semibold">{cert.signatoryName}</p><p className="text-xs text-mist">{cert.signatoryTitle}</p></div>
        <div><p className="border-t border-ink pt-1 font-semibold">{fmtDate(issuedAt)}</p><p className="text-xs text-mist">Date issued</p></div>
      </div>
      <p className="mt-8 text-xs text-mist">Verification code <strong className="font-mono">{code}</strong> · {appUrl()}/verify/{code}</p>
      <p className="text-xs text-mist">{cert.footerNote}</p>
    </div>
  );
}
