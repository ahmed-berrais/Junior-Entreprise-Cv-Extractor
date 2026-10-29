"use client";

import { useId, useRef } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { Button } from "@/components/ui/button";
import type { CandidateProfile } from "@/lib/profile/schema.gen";

export type ReviewSections = Pick<CandidateProfile, "education" | "experience" | "projects" | "languages" | "certifications">;

export const emptySections: ReviewSections = {
  education: [], experience: [], projects: [], languages: [], certifications: [],
};

type Section = keyof ReviewSections;
type Copy = typeof en.reviewSections;
type Field = { name: string; required?: boolean; type?: "month" | "year" | "textarea" };
const fields: Record<Section, Field[]> = {
  education: [{ name: "school", required: true }, { name: "degree", required: true }, { name: "field" }, { name: "start", type: "month" }, { name: "end", type: "month" }],
  experience: [{ name: "company", required: true }, { name: "role", required: true }, { name: "start", type: "month" }, { name: "end", type: "month" }, { name: "description", type: "textarea" }],
  projects: [{ name: "name", required: true }, { name: "description", type: "textarea" }, { name: "technologies" }],
  languages: [{ name: "language", required: true }, { name: "level", required: true }],
  certifications: [{ name: "name", required: true }, { name: "issuer" }, { name: "year", type: "year" }],
};

function RepeatableSection({ name, copy, disabled }: { name: Section; copy: Copy; disabled: boolean }) {
  const { control, register, getFieldState, formState, getValues } = useFormContext<ReviewSections>();
  const { fields: items, append, remove } = useFieldArray({ control, name });
  const values = useWatch({ control, name });
  const container = useRef<HTMLElement>(null);
  const sectionId = useId();
  return (
    <section ref={container} aria-labelledby={`${name}-title`} className="min-w-0 space-y-3">
      <h2 id={`${name}-title`} className="text-xl font-semibold">{copy.sections[name]}</h2>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
      {items.map((item, index) => {
        const label = `${copy.sections[name]} ${index + 1}`;
        const summary = Object.values(values?.[index] ?? {}).find(Boolean);
        return (
          <details key={item.id} className="rounded-lg border p-3" open={undefined}>
            <summary className="min-h-11 cursor-pointer break-words py-2 font-medium">{label}{summary ? ` · ${summary}` : ""}</summary>
            <fieldset disabled={disabled} className="grid min-w-0 gap-4 pt-3 sm:grid-cols-2">
              <legend className="sr-only">{label}</legend>
              {fields[name].map((field) => {
                const path = `${name}.${index}.${field.name}` as Parameters<typeof register>[0];
                const error = getFieldState(path, formState).error;
                const id = `${sectionId}-${index}-${field.name}`;
                const props = {
                  id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined,
                  className: "w-full min-w-0 rounded-md border bg-background p-3 text-base",
                  ...register(path, {
                    setValueAs: field.name === "technologies" ? (value: string | string[]) => Array.isArray(value) ? value : value.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
                    validate: (value) => {
                      const text = String(value ?? "").trim();
                      if (field.required && !text) return copy.required;
                      if (!text) return true;
                      if (field.type === "year" && !/^\d{4}$/.test(text)) return copy.invalidYear;
                      if (field.name === "end" && text === "present") return true;
                      if (field.type === "month" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return copy.invalidMonth;
                      if (field.name === "end") {
                        const start = name === "education" || name === "experience" ? getValues()[name][index]?.start : undefined;
                        if (start && text < String(start)) return copy.invalidRange;
                      }
                      return true;
                    },
                  }),
                };
                return (
                  <div key={field.name} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                    <label htmlFor={id} className="mb-1 block text-sm font-medium">
                      {copy.fields[field.name as keyof Copy["fields"]]} {field.required ? copy.requiredMark : copy.optionalMark}
                    </label>
                    {field.type === "textarea" ? <textarea {...props} rows={4} /> : <input {...props} type={field.type === "month" && field.name !== "end" ? "month" : "text"} inputMode={field.type === "year" ? "numeric" : undefined} />}
                    {error && <p id={`${id}-error`} className="mt-1 text-sm text-destructive">{error.message}</p>}
                  </div>
                );
              })}
              <Button type="button" variant="destructive" className="min-h-11" aria-label={`${copy.remove} ${label}`} onClick={() => remove(index)}>{copy.remove}</Button>
            </fieldset>
          </details>
        );
      })}
      <Button type="button" disabled={disabled} variant="outline" className="min-h-11" aria-label={`${copy.add} ${copy.sections[name]}`} onClick={() => {
        const blank = Object.fromEntries(fields[name].map((field) => [field.name, field.name === "technologies" ? [] : ""]));
        append(blank as never, { shouldFocus: false });
        requestAnimationFrame(() => {
          const added = container.current?.querySelector("details:last-of-type");
          added?.setAttribute("open", "");
          added?.querySelector("input, textarea")?.scrollIntoView({ block: "nearest" });
          (added?.querySelector("input, textarea") as HTMLElement | null)?.focus();
        });
      }}>{copy.add}</Button>
    </section>
  );
}

/** Place inside S1-30's FormProvider; keep shouldUnregister=false so collapsed items are retained. */
export function RepeatableSections({ locale = "en" }: { locale?: "en" | "fr" }) {
  const { formState: { isSubmitting } } = useFormContext<ReviewSections>();
  const copy = (locale === "fr" ? fr : en).reviewSections;
  return <div className="space-y-8">{(Object.keys(fields) as Section[]).map((name) => <RepeatableSection key={name} name={name} copy={copy} disabled={isSubmitting} />)}</div>;
}
