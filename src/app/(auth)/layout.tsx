import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory">
      <div className="container-page flex min-h-screen flex-col items-center justify-center py-10">
        <Link href="/" aria-label="Fodan Sunday School Academy home" className="mb-6"><Logo placement="login" height={120} alt="Fodan Sunday School Academy" /></Link>
        <main id="main" className="w-full max-w-2xl">{children}</main>
        <p className="mt-8 text-xs text-mist"><Link href="/p/privacy">Privacy</Link> · <Link href="/p/terms">Terms</Link> · <Link href="/contact">Help</Link></p>
      </div>
    </div>
  );
}
