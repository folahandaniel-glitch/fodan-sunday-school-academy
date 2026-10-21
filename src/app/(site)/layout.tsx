import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { getSetting } from "@/server/settings";
import { optionalUser, homeFor } from "@/server/guards";
import { MobileNav } from "@/components/mobile-nav";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [brand, nav, footer, contact, ann, user] = await Promise.all([getSetting("brand"), getSetting("nav"), getSetting("footer"), getSetting("contact"), getSetting("announcement"), optionalUser()]);
  const home = user ? await homeFor(user) : "/login";
  return (
    <>
      {ann.enabled && ann.text && (
        <div className="bg-gold-50 text-center text-sm text-navy"><div className="container-page py-2">{ann.href ? <Link href={ann.href} className="font-semibold">{ann.text}</Link> : ann.text}</div></div>
      )}
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="container-page flex items-center justify-between gap-3 py-2">
          <Link href="/" aria-label={`${brand.siteName} home`}><Logo placement="header-light" height={44} alt={brand.siteName} /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-navy no-underline hover:bg-brand-50">{n.label}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {user ? <Link className="btn btn-primary btn-sm" href={home}>My dashboard</Link> : (<><Link className="btn btn-light btn-sm" href="/login">Sign in</Link><Link className="btn btn-primary btn-sm" href="/register/church">Register church</Link></>)}
          </div>
          <MobileNav links={nav} signedIn={!!user} home={home} />
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-12 bg-navy text-white/85">
        <div className="container-page grid gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div><Logo placement="footer" height={46} alt={brand.siteName} /><p className="mt-3 max-w-md text-sm">{footer.about}</p></div>
          <div><h2 className="!font-sans !text-sm !text-gold uppercase tracking-wider">Explore</h2><ul className="mt-3 space-y-1 text-sm">{nav.map((n) => <li key={n.href}><Link className="!text-white/85" href={n.href}>{n.label}</Link></li>)}<li><Link className="!text-white/85" href="/forum">Community forum</Link></li></ul></div>
          <div><h2 className="!font-sans !text-sm !text-gold uppercase tracking-wider">Contact</h2><ul className="mt-3 space-y-1 text-sm"><li>{contact.email}</li>{contact.phone && <li>{contact.phone}</li>}<li><Link className="!text-white/85" href="/contact">Send a message</Link></li></ul>
            <ul className="mt-4 space-y-1 text-sm">{footer.links.map((l) => <li key={l.href}><Link className="!text-white/70" href={l.href}>{l.label}</Link></li>)}</ul></div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">© {new Date().getFullYear()} {footer.copyright} Sponsored by {brand.sponsor}.</div>
      </footer>
    </>
  );
}
