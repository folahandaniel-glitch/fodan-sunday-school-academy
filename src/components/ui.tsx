import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-mist">
            {crumbs.map((c, i) => (<span key={i}>{i > 0 && " / "}{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</span>))}
          </nav>
        )}
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-mist">{sub}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const Card = ({ className, children, ...p }: ComponentProps<"div">) => <div className={clsx("card card-pad", className)} {...p}>{children}</div>;

export function Stat({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const inner = (<><div className="text-xs font-semibold uppercase tracking-wide text-mist">{label}</div><div className="mt-1 font-display text-3xl text-navy">{value}</div>{sub && <div className="mt-1 text-xs text-mist">{sub}</div>}</>);
  return href ? <Link href={href} className="card card-pad card-hover block no-underline">{inner}</Link> : <div className="card card-pad">{inner}</div>;
}

export function Badge({ tone = "default", children }: { tone?: "default" | "ok" | "warn" | "bad" | "info"; children: ReactNode }) {
  return <span className={clsx("badge", tone !== "default" && `badge-${tone}`)}>{children}</span>;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode }) {
  return <div role={tone === "error" ? "alert" : "status"} className={clsx("alert", `alert-${tone}`)}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
      <p className="font-display text-lg text-navy">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-mist">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, base, params = {} }: { page: number; pageSize: number; total: number; base: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v) q.set(k, v); q.set("page", String(p)); return `${base}?${q}`; };
  return (
    <nav aria-label="Pagination" className="no-print mt-4 flex items-center justify-between text-sm">
      <span className="text-mist">Page {page} of {pages} ({total.toLocaleString()} total)</span>
      <span className="flex gap-2">
        {page > 1 ? <Link className="btn btn-light btn-sm" href={href(page - 1)}>Previous</Link> : <span className="btn btn-light btn-sm" aria-disabled="true">Previous</span>}
        {page < pages ? <Link className="btn btn-light btn-sm" href={href(page + 1)}>Next</Link> : <span className="btn btn-light btn-sm" aria-disabled="true">Next</span>}
      </span>
    </nav>
  );
}

export const Table = ({ children, caption }: { children: ReactNode; caption?: string }) => (
  <div className="card overflow-x-auto"><table className="table">{caption && <caption className="sr-only">{caption}</caption>}{children}</table></div>
);

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (<div><label className="label" htmlFor={htmlFor}>{label}</label>{children}{hint && <p className="hint">{hint}</p>}</div>);
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"} className="progress"><span style={{ width: `${v}%` }} /></div>;
}

export function Tabs({ items, current }: { items: { label: string; href: string; key: string }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? "page" : undefined} className={clsx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold no-underline", i.key === current ? "border-gold text-navy" : "border-transparent text-mist hover:text-navy")}>{i.label}</Link>
      ))}
    </nav>
  );
}

export const statusTone = (s: string): "ok" | "warn" | "bad" | "info" | "default" =>
  (["published", "active", "approved", "completed", "paid", "success", "delivered", "present", "pass", "open", "graded", "reviewed"].includes(s) ? "ok"
    : ["in_review", "pending", "draft", "scheduled", "unverified", "held", "queued", "in_progress", "unpublished", "pending_review", "upcoming", "late", "trialing", "grace"].includes(s) ? "warn"
    : ["suspended", "failed", "rejected", "cancelled", "absent", "fail", "expired", "closed", "locked", "revoked", "mismatch"].includes(s) ? "bad" : "default");
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={statusTone(status)}>{status.replace(/_/g, " ")}</Badge>;
