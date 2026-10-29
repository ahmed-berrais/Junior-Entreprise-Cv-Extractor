"use client";

import { useRef, useState } from "react";
import { FormProvider, useForm, type FieldPath } from "react-hook-form";
import { useRouter } from "next/navigation";
import { profileSchema, profileDomains, type CandidateProfile } from "@/lib/profile/schema.gen";
import { saveProfileDraft } from "@/app/candidate/review/actions";
import { RepeatableSections } from "./repeatable-sections";
import { Button } from "@/components/ui/button";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

export function ProfileReviewForm({ initialValues, updatedAt, locale = "en", saveDraftAction = saveProfileDraft }: {
  initialValues: CandidateProfile; updatedAt: string; locale?: "en" | "fr";
  saveDraftAction?: typeof saveProfileDraft;
}) {
  const copy = (locale === "fr" ? fr : en).review;
  const router = useRouter();
  const form = useForm<CandidateProfile>({ defaultValues: initialValues, shouldUnregister: false, shouldFocusError: false });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [skill, setSkill] = useState("");
  const [version, setVersion] = useState(updatedAt);
  const locked = useRef(false);
  const formElement = useRef<HTMLFormElement>(null);
  const skills = form.watch("skills");

  const personal = ["basics.name", "basics.email", "basics.phone", "basics.city", "basics.country", "basics.links.linkedin", "basics.links.github", "basics.links.portfolio"] as const;
  const about = ["basics.headline", "basics.summary", "availability"] as const;
  function input(path: FieldPath<CandidateProfile>) {
    const error = form.getFieldState(path, form.formState).error;
    const initiallyEmpty = !path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, initialValues);
    const id = path.replaceAll(".", "-");
    const label = copy.fields[path as keyof typeof copy.fields];
    const props = { id, ...form.register(path), "aria-invalid": Boolean(error), "aria-describedby": `${id}-hint`, className: "w-full rounded-md border bg-background p-3 text-base" };
    return <div key={path} className={path === "basics.summary" ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {path === "basics.summary" ? <textarea {...props} rows={5} /> : <input {...props} type={path === "basics.email" ? "email" : path === "basics.phone" ? "tel" : "text"} />}
      <p id={`${id}-hint`} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error ? error.message || copy.invalidField : initiallyEmpty ? copy.missing : ""}</p>
    </div>;
  }

  function focusErrors() {
    requestAnimationFrame(() => {
      const invalid = formElement.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
      invalid?.forEach((field) => field.closest("details")?.setAttribute("open", ""));
      invalid?.[0]?.focus();
    });
  }

  async function persist(approve: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setStatus(""); setFailed(false);
    form.clearErrors();
    try {
      // Defaults allow incomplete drafts; registered section rules run on approval only.
      const values = form.getValues();
      const parsed = profileSchema.safeParse(values);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => form.setError(issue.path.join(".") as FieldPath<CandidateProfile>, { type: "schema", message: copy.invalidField }));
        setFailed(true); setStatus(copy.invalid); focusErrors(); return;
      }
      if (approve) {
        if (!await form.trigger()) { setFailed(true); setStatus(copy.invalid); focusErrors(); return; }
        for (const path of ["basics.name", "basics.email"] as const) {
          if (!parsed.data.basics[path === "basics.name" ? "name" : "email"].trim()) form.setError(path, { type: "required", message: copy.required });
        }
        if (!parsed.data.basics.name.trim() || !parsed.data.basics.email.trim()) {
          setFailed(true); setStatus(copy.invalid); focusErrors(); return;
        }
      }
      const saved = await saveDraftAction(parsed.data, version);
      if (!saved.ok) { setFailed(true); setStatus(copy[saved.reason]); return; }
      setVersion(saved.updatedAt);
      // Reset only after persistence succeeds; deletions are saved as replacement arrays.
      form.reset(parsed.data);
      setStatus(copy.saved);
      if (approve) {
        // S1-32 validates the just-saved draft server-side and returns a success-page URL.
        const response = await fetch("/api/profile/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updated_at: saved.updatedAt }) });
        if (!response.ok) { setFailed(true); setStatus(response.status === 404 ? copy.approvalUnavailable : copy.approvalFailed); return; }
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("redirect" in result) || typeof result.redirect !== "string" || !result.redirect.startsWith("/candidate/") || result.redirect.includes("\\")) {
          setFailed(true); setStatus(copy.approvalFailed); return;
        }
        router.push(result.redirect);
      }
    } catch { setFailed(true); setStatus(copy.failed); }
    finally { locked.current = false; setBusy(false); }
  }

  return <FormProvider {...form}><form ref={formElement} noValidate onSubmit={(event) => { event.preventDefault(); void persist(false); }} className="space-y-8">
    <header><h1 className="text-3xl font-semibold">{copy.title}</h1><p className="mt-2 text-muted-foreground">{copy.intro}</p></header>
    <fieldset disabled={busy} className="min-w-0 space-y-8">
      <section aria-labelledby="personal-title"><h2 id="personal-title" className="mb-4 text-xl font-semibold">{copy.personal}</h2><div className="grid gap-4 sm:grid-cols-2">{personal.map(input)}</div></section>
      <section aria-labelledby="about-title"><h2 id="about-title" className="mb-4 text-xl font-semibold">{copy.about}</h2><div className="grid gap-4 sm:grid-cols-2">{about.map(input)}</div></section>
      <section aria-labelledby="skills-title" className="space-y-3"><h2 id="skills-title" className="text-xl font-semibold">{copy.skills}</h2>
        <ul className="flex flex-wrap gap-2">{skills.map((value, index) => <li key={`${value}-${index}`}><Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal break-words" aria-label={`${copy.removeSkill} ${value}`} onClick={() => form.setValue("skills", skills.filter((_, item) => item !== index), { shouldDirty: true })}>{value} ×</Button></li>)}</ul>
        <label htmlFor="new-skill" className="block text-sm font-medium">{copy.addSkill}</label>
        <div className="flex flex-col gap-2 sm:flex-row"><input id="new-skill" value={skill} onChange={(event) => setSkill(event.target.value)} className="min-w-0 flex-1 rounded-md border p-3 text-base" /><Button type="button" variant="outline" className="min-h-11" onClick={() => { const value = skill.trim(); if (value && !skills.some((item) => item.toLowerCase() === value.toLowerCase())) form.setValue("skills", [...skills, value], { shouldDirty: true }); setSkill(""); }}>{copy.addSkill}</Button></div>
      </section>
      <section aria-labelledby="classification-title" className="space-y-3"><h2 id="classification-title" className="text-xl font-semibold">{copy.classification}</h2><div className="grid gap-4 sm:grid-cols-2">
        <label>{copy.domain}<select {...form.register("classification.domain", { setValueAs: (value) => value || null })} className="mt-1 w-full rounded-md border bg-background p-3 text-base"><option value="">{copy.unknown}</option>{profileDomains.map((domain) => <option key={domain} value={domain}>{copy.domains[domain]}</option>)}</select></label>
        <label>{copy.seniority}<select {...form.register("classification.seniority", { setValueAs: (value) => value || null })} className="mt-1 w-full rounded-md border bg-background p-3 text-base"><option value="">{copy.unknown}</option>{(["student", "junior", "experienced"] as const).map((value) => <option key={value} value={value}>{copy.seniorities[value]}</option>)}</select></label>
      </div></section>
      <RepeatableSections locale={locale} />
    </fieldset>
    <div className="space-y-3 border-t py-4"><p role={failed ? "alert" : "status"} aria-live="polite">{busy ? copy.saving : status}</p><div className="flex flex-col gap-3 sm:flex-row"><Button type="submit" disabled={busy} className="min-h-11" variant="outline">{copy.save}</Button><Button type="button" disabled={busy} className="min-h-11" onClick={() => void persist(true)}>{copy.approve}</Button></div></div>
  </form></FormProvider>;
}
