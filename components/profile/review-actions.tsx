"use client";

import { useRef, useState } from "react";
import { useFormContext, type FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/** S1-30 supplies persistence; S1-32 supplies the authenticated approval action. */
export function ReviewActions({ onSave, onApprove, locale = "en" }: {
  onSave: (values: FieldValues) => Promise<void>;
  onApprove: (values: FieldValues) => Promise<void>;
  locale?: "en" | "fr";
}) {
  const { getValues, handleSubmit, formState: { isSubmitting } } = useFormContext();
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState(false);
  const lock = useRef(false);
  const region = useRef<HTMLDivElement>(null);
  const copy = (locale === "fr" ? fr : en).reviewSections;

  async function run(kind: "save" | "approve") {
    if (lock.current || isSubmitting) return;
    lock.current = true;
    setBusy(kind);
    setMessage("");
    setInvalid(false);
    try {
      if (kind === "save") {
        // Drafts deliberately allow incomplete entries.
        await onSave(getValues());
        setMessage(copy.saved);
      } else {
        await handleSubmit(async (values) => {
          await onApprove(values);
          setMessage(copy.approved);
        }, () => {
          setInvalid(true);
          setMessage(copy.invalid);
          requestAnimationFrame(() => {
            const form = region.current?.closest("form");
            const errors = form?.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
            errors?.forEach((field) => field.closest("details")?.setAttribute("open", ""));
            errors?.[0]?.focus();
          });
        })();
      }
    } catch {
      setMessage(copy.failed);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  return (
    <div ref={region} className="space-y-3 border-t bg-background py-4">
      {message && <p role={invalid ? "alert" : "status"} aria-live="polite">{message}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="min-h-11" variant="outline" disabled={Boolean(busy) || isSubmitting} onClick={() => void run("save")}>{busy === "save" ? copy.saving : copy.save}</Button>
        <Button type="button" className="min-h-11" disabled={Boolean(busy) || isSubmitting} onClick={() => void run("approve")}>{busy === "approve" ? copy.approving : copy.approve}</Button>
      </div>
    </div>
  );
}
