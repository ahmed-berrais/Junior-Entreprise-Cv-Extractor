"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// S2-16 owns the API; this component follows its exact confirmation/redirect contract.
export function DeleteAccount() {
  const t = useTranslations("myProfile");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || confirmation !== "DELETE") return;
    lock.current = true; setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/candidate/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmation }), signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.redirect !== "/") throw new Error("deletion not confirmed");
      router.replace("/"); router.refresh();
    } catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!open) return <Button type="button" variant="destructive" onClick={() => setOpen(true)}>{t("delete")}</Button>;
  return <section className="space-y-4 rounded-xl border border-destructive p-5" aria-labelledby="delete-title">
    <h2 id="delete-title" className="text-xl font-semibold">{t("delete")}</h2>
    <p id="delete-warning">{t("deleteWarning")}</p>
    <form onSubmit={submit} className="space-y-3" aria-busy={busy}>
      <Label htmlFor="delete-confirmation">{t("deleteConfirm")}</Label>
      <Input id="delete-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} aria-describedby="delete-warning" />
      {failed && <p role="alert" className="text-destructive">{t("deleteFailed")}</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" variant="destructive" disabled={busy || confirmation !== "DELETE"}>{t(busy ? "deleteBusy" : "deleteSubmit")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setOpen(false); setConfirmation(""); setFailed(false); }}>{t("deleteCancel")}</Button></div>
    </form>
  </section>;
}
