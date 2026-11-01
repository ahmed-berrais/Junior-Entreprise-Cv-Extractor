"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/site/page-container";
import { homeFor } from "@/lib/access";
import { normalizeAccessCode } from "@/lib/company-login";

export function SpaceLoginForm({ role }: { role: "company" | "admin" }) {
  const t = useTranslations("spaceLogin");
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") === "disabled" ? "disabled" : "");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true; setBusy(true); setError("");
    try {
      const password = role === "company" ? normalizeAccessCode(form.get("password")) : form.get("password");
      const response = await fetch(`/api/${role}/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password }), signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (!response.ok) { setError(["disabled", "invalidCredentials", "rateLimit"].includes(result.error) ? result.error : "failed"); return; }
      if (result.redirect !== homeFor[role]) { setError("failed"); return; }
      router.replace(result.redirect); router.refresh();
    } catch { setError("failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <PageContainer className="max-w-md"><Card><CardHeader><CardTitle className="text-2xl">{t(role)}</CardTitle></CardHeader><CardContent>
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <div className="grid gap-2"><Label htmlFor="email">{t("email")}</Label><Input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" maxLength={254} required disabled={busy} /></div>
      <div className="grid gap-2"><Label htmlFor="password">{t(role === "company" ? "code" : "password")}</Label><Input id="password" name="password" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={256} required disabled={busy} /></div>
      {error && <p role="alert" className="text-destructive">{t(`errors.${error as "failed"}`)}</p>}
      <Button type="submit" className="min-h-11 w-full" disabled={busy}>{t(busy ? "working" : "submit")}</Button>
      {role === "company" && <p className="text-sm text-muted-foreground">{t("noCode")}</p>}
    </form>
  </CardContent></Card></PageContainer>;
}
