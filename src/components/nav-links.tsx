"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BarChart3, Bell, BookOpen, Building2, CalendarDays, Check, ClipboardCheck, CreditCard, Globe, Home, MessageSquare, Palette, Pencil, Settings, ShieldCheck, Tag, TrendingUp, Upload, User, Users, type LucideIcon } from "lucide-react";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = { home: Home, book: BookOpen, calendar: CalendarDays, pencil: Pencil, clipboard: ClipboardCheck, chart: BarChart3, trend: TrendingUp, award: Award, chat: MessageSquare, bell: Bell, user: User, users: Users, check: Check, building: Building2, card: CreditCard, cog: Settings, tag: Tag, upload: Upload, globe: Globe, palette: Palette, shield: ShieldCheck };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const groups: (string | undefined)[] = [...new Set(items.map((i) => i.group))];
  return (
    <nav aria-label="Primary" className="space-y-3">
      {groups.map((g) => (
        <div key={g ?? "main"}>
          {g && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{g}</p>}
          <ul className="space-y-0.5">
            {items.filter((i) => i.group === g).map((i) => {
              const Icon = ICONS[i.icon ?? "home"] ?? Home;
              const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
              return <li key={i.href}><Link href={i.href} className="nav-link" aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden />{i.label}</Link></li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
