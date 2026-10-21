"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export function MobileNav({ links, signedIn, home }: { links: { label: string; href: string }[]; signedIn: boolean; home: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" className="btn btn-light btn-sm" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}<span className="sr-only sm:not-sr-only">Menu</span>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-white p-4 shadow-lg">
          <ul className="space-y-1">
            {links.map((l) => <li key={l.href}><Link onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-semibold text-navy no-underline hover:bg-brand-50" href={l.href}>{l.label}</Link></li>)}
            <li><Link onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 font-semibold text-navy no-underline hover:bg-brand-50" href="/forum">Community forum</Link></li>
          </ul>
          <div className="mt-3 flex gap-2">
            {signedIn ? <Link className="btn btn-primary flex-1" href={home}>My dashboard</Link> : (<><Link className="btn btn-light flex-1" href="/login">Sign in</Link><Link className="btn btn-primary flex-1" href="/register/church">Register church</Link></>)}
          </div>
        </div>
      )}
    </div>
  );
}
