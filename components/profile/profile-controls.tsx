"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
export function ProfileControls({ hidden }: { hidden: boolean }) {
  const t = useTranslations("myProfile");
  const router = useRouter();
  const [value, setValue] = useState(hidden);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function toggle() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/profile/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !value }), signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (!response.ok || typeof result.hidden !== "boolean") throw new Error("visibility");
      setValue(result.hidden); router.refresh();
    } catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-2"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" role="switch" checked={value} disabled={busy} onChange={() => void toggle()} className="size-6" />{t("hide")}</label><p className="text-sm text-muted-foreground">{t(value ? "hiddenHint" : "visibleHint")}</p>{failed && <p role="alert">{t("failed")}</p>}</div>;
}
