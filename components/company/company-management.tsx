"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CompanyRow } from "@/lib/company";
import { filterCompanies } from "@/lib/company-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/site/page-container";

export function CompanyManagement({ initialRows }: { initialRows: CompanyRow[] }) {
  const t = useTranslations("companies");
  const locale = useLocale();
  const [rows, setRows] = useState<CompanyRow[]>(initialRows);
  const [query, setQuery] = useState("");
  const visibleRows = filterCompanies(rows, query);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: "resend" | "disable"; name: string } | null>(null);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/companies", { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const result = await response.json();
    if (!response.ok) throw new Error("load");
    setRows(result.companies);
  }, []);
  async function run(path: string, body?: object, form?: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice(""); setFailed(false); setPending(null);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(40_000) });
      const result = await response.json();
      if (!response.ok) { setFailed(true); setNotice(["emailFailed", "invalid", "emailUsed", "disabled"].includes(result.error) ? result.error : "failed"); }
      else { setFailed(Boolean(result.warning)); setNotice(result.warning === "emailFailed" ? "emailFailed" : "success"); form?.reset(); }
      await load();
    } catch { setFailed(true); setNotice("failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { setFailed(true); setNotice("invalid"); return; }
    void run("/api/admin/companies", { name: data.get("name"), email, sector: data.get("sector") }, form);
  }
  return <PageContainer><h1 className="text-3xl font-semibold">{t("title")}</h1>
    <form onSubmit={add} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3" aria-busy={busy}>
      {(["name", "email", "sector"] as const).map(field => <div key={field} className="grid gap-2"><Label htmlFor={field}>{t(field)}</Label><Input id={field} name={field} type={field === "email" ? "email" : "text"} required maxLength={field === "email" ? 254 : 160} disabled={busy} /></div>)}
      <Button type="submit" disabled={busy} className="min-h-11 sm:col-span-3">{t("add")}</Button>
    </form>
    <p role={failed ? "alert" : "status"} aria-live="polite">{notice ? t(notice as "success") : busy ? t("loading") : ""}</p>
    {!busy && failed && <Button variant="outline" onClick={() => { setBusy(true); void load().then(() => { setFailed(false); setNotice(""); }).catch(() => setNotice("failed")).finally(() => setBusy(false)); }}>{t("retry")}</Button>}
    {pending && <section role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-text" className="space-y-3 rounded-lg border p-4">
      <h2 id="confirm-title" className="font-semibold">{t(pending.action)}</h2><p id="confirm-text">{t(pending.action === "resend" ? "confirmResend" : "confirmDisable", { name: pending.name })}</p>
      <div className="flex gap-3"><Button onClick={() => void run(`/api/admin/companies/${pending.id}/${pending.action}`)}>{t("confirm")}</Button><Button variant="outline" onClick={() => setPending(null)}>{t("cancel")}</Button></div>
    </section>}
    <div className="grid gap-2"><Label htmlFor="company-search">{t("search")}</Label><Input id="company-search" type="search" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><caption className="sr-only">{t("title")}</caption><thead className="bg-muted"><tr>{(["name", "email", "sector", "created", "status", "actions"] as const).map(key => <th scope="col" key={key} className="p-3">{t(key)}</th>)}</tr></thead><tbody>
      {visibleRows.map(row => <tr key={row.user_id} className="border-t"><td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.email}</td><td className="p-3">{row.sector}</td><td className="p-3 whitespace-nowrap">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.created_at))}</td><td className="p-3">{t(row.disabled ? "disabled" : "active")}</td><td className="p-3"><div className="flex gap-2"><Button variant="outline" disabled={busy || row.disabled} onClick={() => setPending({ id: row.user_id, action: "resend", name: row.name })}>{t("resend")}</Button><Button variant="outline" disabled={busy} onClick={() => row.disabled ? void run(`/api/admin/companies/${row.user_id}/enable`) : setPending({ id: row.user_id, action: "disable", name: row.name })}>{t(row.disabled ? "enable" : "disable")}</Button></div></td></tr>)}
      {!visibleRows.length && !busy && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{t(query.trim() ? "noResults" : "empty")}</td></tr>}
    </tbody></table></div>
  </PageContainer>;
}
