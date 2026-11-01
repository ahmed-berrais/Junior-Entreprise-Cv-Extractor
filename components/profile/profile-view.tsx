import { getMessages } from "next-intl/server";
import type { CandidateProfile } from "@/lib/profile/schema.gen";

// Shared read-only presentation for candidates and company profile screens.
export async function ProfileView({ profile: p }: { profile: CandidateProfile }) {
  const copy = await getMessages();
  const fields = copy.reviewSections.fields;
  function value(key: string, input: unknown): React.ReactNode {
    if (input === null || input === undefined || input === false || input === "") return null;
    if (key === "url" && typeof input === "string") return /^https?:\/\//i.test(input) ? <a href={input} rel="noreferrer" target="_blank" className="underline break-all">{input}</a> : input;
    if (key === "type" || key === "level") return copy.reviewSections.options[input as keyof typeof copy.reviewSections.options] || String(input);
    if (typeof input === "boolean") return copy.myProfile.current;
    return Array.isArray(input) ? input.join(", ") : String(input);
  }
  const sections = { education: p.education, experience: p.experience, projects: p.projects, languages: p.languages, certifications: p.certifications, basics_links: p.basics.links };
  return <article className="space-y-7 rounded-xl border bg-card p-5 sm:p-8">
    <header><h2 className="text-2xl font-semibold">{p.basics.name}</h2><p className="text-lg text-muted-foreground">{p.basics.headline}</p></header>
    <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(p.basics).filter(([key]) => !["name", "headline", "links"].includes(key)).map(([key, input]) => input && <div key={key} className={key === "summary" ? "sm:col-span-2" : ""}><dt className="text-sm text-muted-foreground">{copy.review.fields[`basics_${key}` as keyof typeof copy.review.fields]}</dt><dd className="whitespace-pre-wrap break-words">{String(input)}</dd></div>)}
      <div><dt className="text-sm text-muted-foreground">{copy.review.fields.availability}</dt><dd>{p.availability || copy.review.unknown}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{copy.review.domain}</dt><dd>{copy.review.domains[p.classification.domain]}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{copy.review.seniority}</dt><dd>{copy.review.seniorities[p.classification.seniority]}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{copy.review.yearsExperience}</dt><dd>{p.classification.years_experience}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{copy.myProfile.lookingFor}</dt><dd>{p.looking_for ? copy.myProfile.opportunities[p.looking_for] : copy.review.unknown}</dd></div>
    </dl>
    <section><h3 className="mb-2 text-xl font-semibold">{copy.review.skills}</h3><ul className="flex flex-wrap gap-2">{p.skills.map((skill, i) => <li key={i} className="rounded-full bg-secondary px-3 py-1">{skill.name} · {copy.review.skillCategories[skill.category]}</li>)}</ul></section>
    {Object.entries(sections).map(([section, entries]) => entries.length > 0 && <section key={section}><h3 className="mb-3 text-xl font-semibold">{copy.reviewSections.sections[section as keyof typeof copy.reviewSections.sections]}</h3><div className="space-y-3">{entries.map((entry, i) => <dl key={i} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-2">{Object.entries(entry).map(([key, input]) => { const rendered = value(key, input); return rendered && <div key={key}><dt className="text-sm text-muted-foreground">{fields[key as keyof typeof fields]}</dt><dd className="whitespace-pre-wrap break-words">{rendered}</dd></div>; })}</dl>)}</div></section>)}
  </article>;
}
