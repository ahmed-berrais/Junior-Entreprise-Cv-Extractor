"use client";

import { useRef, useState } from "react";
import { FormProvider, useForm, type FieldPath } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ProfileSchema, type CandidateProfile } from "@/lib/profile/schema.gen";
import { DraftSchema, type ProfileDraft } from "@/lib/profile/draft-schema";
import { checkApproval } from "@/lib/profile/approval";
import { saveProfileDraft } from "@/app/candidate/review/actions";
import { RepeatableSections } from "./repeatable-sections";
import { Button } from "@/components/ui/button";
import { useMessages } from "next-intl";

type ProfilePath = FieldPath<ProfileDraft>;
export function ProfileReviewForm({ initialValues, updatedAt, saveDraftAction = saveProfileDraft, editingApproved = false }: {
  initialValues: ProfileDraft; updatedAt: string;
  saveDraftAction?: typeof saveProfileDraft;
  editingApproved?: boolean;
}) {
  // The texts of the language chosen in the header (S1-14). Keys have no dots: "basics.name" → "basics_name".
  const copy = useMessages().review;
  const profileCopy = useMessages().myProfile;
  const router = useRouter();
  const form = useForm<ProfileDraft>({ defaultValues: initialValues, shouldUnregister: false, shouldFocusError: false });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [skill, setSkill] = useState("");
  const [category, setCategory] = useState<CandidateProfile["skills"][number]["category"]>("technical");
  const [version, setVersion] = useState(updatedAt);
  const locked = useRef(false);
  const formElement = useRef<HTMLFormElement>(null);
  const skills = form.watch("skills");
  const personal = ["basics.name", "basics.email", "basics.phone", "basics.city", "basics.country"] as const;
  const about = ["basics.headline", "basics.summary", "availability"] as const;

  function input(path: typeof personal[number] | typeof about[number]) {
    const error = form.getFieldState(path, form.formState).error;
    const original = path === "availability" ? initialValues.availability : initialValues.basics[path.slice(7) as keyof CandidateProfile["basics"]];
    const id = path.replaceAll(".", "-");
    const props = { id, ...form.register(path, { setValueAs: (value: unknown) => typeof value === "string" ? value.trim() || null : value }), "aria-invalid": Boolean(error), "aria-describedby": `${id}-hint`, className: "w-full rounded-md border bg-background p-3 text-base" };
    return <div key={path} className={path === "basics.summary" ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{copy.fields[path.replace(".", "_") as keyof typeof copy.fields]}</label>
      {path === "basics.summary" ? <textarea {...props} rows={5} /> : <input {...props} type={path === "basics.email" ? "email" : path === "basics.phone" ? "tel" : "text"} />}
      <p id={`${id}-hint`} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error?.message || (!original ? copy.missing : "")}</p>
    </div>;
  }
  function focusErrors() {
    requestAnimationFrame(() => {
      const invalid = formElement.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
      invalid?.forEach((field) => field.closest("details")?.setAttribute("open", ""));
      invalid?.[0]?.focus();
    });
  }
  function markFields(paths: string[]) {
    for (const path of paths) form.setError(path as ProfilePath, { type: "validation", message: copy.invalidField });
    setFailed(true); setStatus(copy.invalid); focusErrors();
  }
  function addSkill() {
    const value = skill.trim();
    if (value && !skills.some((item) => item.name.toLowerCase() === value.toLowerCase())) form.setValue("skills", [...skills, { name: value, category }], { shouldDirty: true });
    setSkill("");
  }
  async function persist(approve: boolean) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFailed(false); setStatus(copy.saving); form.clearErrors();
    try {
      const parsed = (approve || editingApproved ? ProfileSchema : DraftSchema).safeParse(form.getValues());
      if (!parsed.success) {
        for (const issue of parsed.error.issues) form.setError(issue.path.join(".") as ProfilePath, { type: "schema", message: issue.code === "too_small" || issue.code === "invalid_type" ? copy.required : copy.invalidField });
        setFailed(true); setStatus(copy.invalid); focusErrors(); return;
      }
      if (approve || editingApproved) {
        const check = checkApproval(parsed.data);
        if (!check.ok) { markFields(check.fields); return; }
      }
      const saved = await saveDraftAction(parsed.data, version);
      if (!saved.ok) { setFailed(true); setStatus(copy[saved.reason]); return; }
      setVersion(saved.updatedAt); form.reset(parsed.data); setStatus(copy.saved);
      if (editingApproved) { router.push("/candidate/profile"); router.refresh(); return; }
      if (approve) {
        setStatus(copy.approving);
        const response = await fetch("/api/profile/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updated_at: saved.updatedAt }) });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 422 && result && typeof result === "object" && "fields" in result && Array.isArray(result.fields)) {
            markFields(result.fields.filter((field): field is string => typeof field === "string"));
          } else { setFailed(true); setStatus(response.status === 409 || response.status === 404 ? copy.conflict : response.status === 401 || response.status === 403 ? copy.unauthorized : copy.approvalFailed); }
          return;
        }
        if (!result || typeof result !== "object" || !("redirect" in result) || result.redirect !== "/candidate/approved") { setFailed(true); setStatus(copy.approvalFailed); return; }
        router.push(result.redirect);
      }
    } catch { setFailed(true); setStatus(copy.failed); }
    finally { locked.current = false; setBusy(false); }
  }
  return <FormProvider {...form}><form ref={formElement} noValidate onSubmit={(event) => { event.preventDefault(); void persist(false); }} className="space-y-8">
    <header><h1 className="text-3xl font-semibold">{editingApproved ? profileCopy.edit : copy.title}</h1><p className="mt-2 text-muted-foreground">{editingApproved ? profileCopy.editHint : copy.intro}</p><p className="mt-2 text-sm">{copy.approvalRequirements}</p></header>
    <fieldset disabled={busy} className="min-w-0 space-y-8">
      <section aria-labelledby="personal-title"><h2 id="personal-title" className="mb-4 text-xl font-semibold">{copy.personal}</h2><div className="grid gap-4 sm:grid-cols-2">{personal.map(input)}</div></section>
      <RepeatableSections linksOnly />
      <section aria-labelledby="about-title"><h2 id="about-title" className="mb-4 text-xl font-semibold">{copy.about}</h2><div className="grid gap-4 sm:grid-cols-2">{about.map(input)}</div></section>
      <section aria-labelledby="skills-title" className="space-y-3"><h2 id="skills-title" className="text-xl font-semibold">{copy.skills}</h2>
        <ul className="flex flex-wrap gap-2">{skills.map((value, index) => <li key={`${value.name}-${index}`}><Button type="button" variant="secondary" className="min-h-11 max-w-full whitespace-normal break-words" aria-label={`${copy.removeSkill} ${value.name}`} onClick={() => form.setValue("skills", skills.filter((_, item) => item !== index), { shouldDirty: true })}>{value.name} ×</Button></li>)}</ul>
        <label htmlFor="new-skill" className="block text-sm font-medium">{copy.addSkill}</label>
        <div className="flex flex-col gap-2 sm:flex-row"><input id="new-skill" value={skill} onChange={(event) => setSkill(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} className="min-w-0 flex-1 rounded-md border p-3 text-base" /><select aria-label={copy.skillCategory} value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="rounded-md border bg-background p-3 text-base">{ProfileSchema.shape.skills.element.shape.category.options.map((value) => <option key={value} value={value}>{copy.skillCategories[value]}</option>)}</select><Button type="button" variant="outline" className="min-h-11" onClick={addSkill}>{copy.addSkill}</Button></div>
      </section>
      <section aria-labelledby="classification-title" className="space-y-3"><h2 id="classification-title" className="text-xl font-semibold">{copy.classification}</h2><div className="grid gap-4 sm:grid-cols-2">
        <label>{copy.domain}<select {...form.register("classification.domain")} className="mt-1 w-full rounded-md border bg-background p-3 text-base">{ProfileSchema.shape.classification.shape.domain.options.map((domain) => <option key={domain} value={domain}>{copy.domains[domain]}</option>)}</select></label>
        <label>{copy.seniority}<select {...form.register("classification.seniority")} className="mt-1 w-full rounded-md border bg-background p-3 text-base">{ProfileSchema.shape.classification.shape.seniority.options.map((value) => <option key={value} value={value}>{copy.seniorities[value]}</option>)}</select></label>
        <label>{copy.yearsExperience}<input {...form.register("classification.years_experience", { setValueAs: (value: unknown) => value === "" || value === null ? null : Number(value) })} type="number" min={0} max={60} step={0.5} aria-invalid={Boolean(form.formState.errors.classification?.years_experience)} aria-describedby="years-error" className="mt-1 w-full rounded-md border bg-background p-3 text-base" /><span id="years-error" className="block text-sm text-destructive">{form.formState.errors.classification?.years_experience?.message}</span></label>
      </div></section>
      <RepeatableSections />
    </fieldset>
    <div className="space-y-3 border-t py-4"><p role={failed ? "alert" : "status"} aria-live="polite">{status}</p><div className="flex flex-col gap-3 sm:flex-row"><Button type="submit" disabled={busy} className="min-h-11" variant="outline">{editingApproved ? profileCopy.save : copy.save}</Button>{!editingApproved && <Button type="button" disabled={busy} className="min-h-11" onClick={() => void persist(true)}>{copy.approve}</Button>}</div></div>
  </form></FormProvider>;
}
