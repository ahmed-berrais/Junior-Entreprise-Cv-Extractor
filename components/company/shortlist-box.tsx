"use client";
// S3-05 · On a profile, for a company: "Add to shortlist", then a private note ("great CV, call back").
// Saved through /api/company/shortlist/<public_id>; only this company ever sees the note.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTE } from "@/lib/shortlist";

export function ShortlistBox({ publicId, initial }: { publicId: string; initial: { note: string } | null }) {
  const t = useTranslations("shortlist");
  const [listed, setListed] = useState(initial !== null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [savedNote, setSavedNote] = useState(initial?.note ?? "");
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function send(method: "PUT" | "DELETE", body?: { note: string }) {
    setStatus("busy");
    try {
      const response = await fetch(`/api/company/shortlist/${publicId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setListed(result.shortlisted);
      setNote(result.note ?? "");
      setSavedNote(result.note ?? "");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "busy";
  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      {!listed ? (
        <Button className="w-fit" disabled={busy} onClick={() => send("PUT")}>
          <StarIcon data-icon="inline-start" aria-hidden="true" />
          {t("add")}
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium">
              <StarIcon className="size-4 fill-current text-primary" aria-hidden="true" />
              {t("listed")}
            </p>
            <Button variant="ghost" disabled={busy} onClick={() => send("DELETE")}>{t("remove")}</Button>
          </div>
          <label htmlFor="shortlist-note" className="text-sm font-medium">{t("noteLabel")}</label>
          <Textarea
            id="shortlist-note"
            value={note}
            maxLength={MAX_NOTE}
            rows={3}
            placeholder={t("notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button className="w-fit" variant="outline" disabled={busy || note.trim() === savedNote}
            onClick={() => send("PUT", { note })}>
            {t("saveNote")}
          </Button>
        </>
      )}
      <p role="status" className="text-sm text-muted-foreground empty:hidden">
        {status === "saved" ? t(listed ? "saved" : "removed") : status === "error" ? t("error") : ""}
      </p>
    </section>
  );
}
