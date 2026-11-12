import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { getT } from "@/server/ui-text";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="min-h-screen bg-ivory">
      <div className="container-page flex min-h-screen flex-col items-center justify-center py-10">
        <Link href="/" aria-label={t("Fodan Sunday School Academy home")} className="mb-6"><Logo placement="login" height={120} alt={t("Fodan Sunday School Academy")} /></Link>
        <main id="main" className="w-full max-w-2xl">{children}</main>
        <p className="mt-8 text-xs text-mist"><Link href="/p/privacy">{t("Privacy")}</Link> · <Link href="/p/terms">{t("Terms")}</Link> · <Link href="/contact">{t("Help")}</Link></p>
      </div>
    </div>
  );
}
