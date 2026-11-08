// S2-11 · A candidate's full profile, as companies see it at /p/<public_id>. Rendered on the server
// only from what lib/profile/view.ts allowed: no profile data travels to the browser as props.
// Every section is optional: a profile shows only what the candidate approved.
import { getFormatter, getTranslations } from "next-intl/server";
import {
  AwardIcon, BriefcaseIcon, ExternalLinkIcon, FolderIcon, GlobeIcon, GraduationCapIcon,
  LanguagesIcon, MailIcon, MapPinIcon, PhoneIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProfileRecord } from "@/lib/profile/view";

type T = Awaited<ReturnType<typeof getTranslations<"profilePage">>>;
type Fmt = Awaited<ReturnType<typeof getFormatter>>;

// "2024-09" → "Sep 2024", "2024" → "2024". Dates come from the schema as YYYY or YYYY-MM.
function monthYear(value: string | null | undefined, format: Fmt) {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  if (!month) return String(year);
  return format.dateTime(new Date(Date.UTC(year, month - 1, 1)), { month: "short", year: "numeric", timeZone: "UTC" });
}

function period(start: string | null | undefined, end: string | null | undefined, current: boolean | undefined, t: T, format: Fmt) {
  const from = monthYear(start, format);
  const to = current ? t("current") : monthYear(end, format);
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? null;
}

export async function CompanyProfileView({ profile, actions }: { profile: ProfileRecord; actions?: React.ReactNode }) {
  const t = await getTranslations("profilePage");
  const review = await getTranslations("review");
  const format = await getFormatter();
  const d = profile.data ?? {};
  const b = d.basics ?? ({} as NonNullable<typeof d.basics>);
  const where = [b.city, b.country].filter(Boolean).join(", ");
  const c = d.classification;

  const skillsBy = (category: string) => (d.skills ?? []).filter((s) => s.category === category);

  return (
    <article className="flex flex-col gap-6">
      {/* Header: who, what they look for, how to reach them */}
      <header className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">{b.name}</h1>
            {b.headline && <p className="text-lg text-muted-foreground">{b.headline}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {profile.looking_for && <Badge>{t(`lookingForValues.${profile.looking_for}`)}</Badge>}
          {c?.domain && <Badge variant="secondary">{review(`domains.${c.domain}`)}</Badge>}
          {c?.seniority && <Badge variant="outline">{review(`seniorities.${c.seniority}`)}</Badge>}
          {typeof c?.years_experience === "number" && c.years_experience > 0 && (
            <Badge variant="outline">{t("yearsExperience", { years: c.years_experience })}</Badge>
          )}
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {b.email && (
            <Line icon={<MailIcon />} label={t("email")}>
              <a href={`mailto:${b.email}`} className="break-all text-primary underline-offset-4 hover:underline">{b.email}</a>
            </Line>
          )}
          {b.phone && (
            <Line icon={<PhoneIcon />} label={t("phone")}>
              <a href={`tel:${b.phone.replace(/\s+/g, "")}`} className="text-primary underline-offset-4 hover:underline">{b.phone}</a>
            </Line>
          )}
          {where && <Line icon={<MapPinIcon />} label={t("location")}>{where}</Line>}
          {d.availability && <Line icon={<BriefcaseIcon />} label={t("availability")}>{d.availability}</Line>}
        </dl>

        {(b.links ?? []).length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t("links")}>
            {b.links!.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer nofollow"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
                  <GlobeIcon className="size-4" aria-hidden="true" />
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      {b.summary && (
        <Section title={t("about")}>
          <p className="leading-relaxed whitespace-pre-line">{b.summary}</p>
        </Section>
      )}

      {(d.experience ?? []).length > 0 && (
        <Section title={t("experience")} icon={<BriefcaseIcon />}>
          <ol className="flex flex-col gap-5">
            {d.experience!.map((e, i) => (
              <li key={i} className="flex flex-col gap-1">
                <p className="font-semibold">{e.position} · {e.company}</p>
                <p className="text-sm text-muted-foreground">
                  {[t(`experienceTypes.${e.type}`), period(e.start_date, e.end_date, e.current, t, format), e.location]
                    .filter(Boolean).join(" · ")}
                </p>
                {e.description && <p className="text-sm leading-relaxed whitespace-pre-line">{e.description}</p>}
                <Tags items={e.technologies} label={t("technologies")} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(d.education ?? []).length > 0 && (
        <Section title={t("education")} icon={<GraduationCapIcon />}>
          <ol className="flex flex-col gap-4">
            {d.education!.map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <p className="font-semibold">{e.institution}</p>
                {(e.degree || e.field) && <p className="text-sm">{[e.degree, e.field].filter(Boolean).join(", ")}</p>}
                <p className="text-sm text-muted-foreground">
                  {[period(e.start_date, e.end_date, e.current, t, format), e.grade && `${t("grade")} : ${e.grade}`]
                    .filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(d.projects ?? []).length > 0 && (
        <Section title={t("projects")} icon={<FolderIcon />}>
          <ul className="flex flex-col gap-5">
            {d.projects!.map((p, i) => (
              <li key={i} className="flex flex-col gap-1">
                <p className="font-semibold">
                  {p.name}
                  {p.date && <span className="font-normal text-muted-foreground"> · {monthYear(p.date, format)}</span>}
                </p>
                {p.description && <p className="text-sm leading-relaxed whitespace-pre-line">{p.description}</p>}
                <Tags items={p.technologies} label={t("technologies")} />
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                    {t("openProject")} <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(d.skills ?? []).length > 0 && (
        <Section title={t("skills")}>
          <div className="flex flex-col gap-3">
            {(["technical", "tool", "soft"] as const).map((category) =>
              skillsBy(category).length > 0 && (
                <div key={category} className="flex flex-col gap-1.5">
                  <p className="text-sm text-muted-foreground">{review(`skillCategories.${category}`)}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {skillsBy(category).map((s) => (
                      <li key={s.name} className="rounded-md bg-muted px-2 py-0.5 text-sm">{s.name}</li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {(d.languages ?? []).length > 0 && (
          <Section title={t("languages")} icon={<LanguagesIcon />}>
            <ul className="flex flex-col gap-1.5">
              {d.languages!.map((l) => (
                <li key={l.name} className="flex justify-between gap-4 text-sm">
                  <span className="font-medium">{l.name}</span>
                  {l.level && <span className="text-muted-foreground">{t(`levels.${l.level}`)}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(d.certifications ?? []).length > 0 && (
          <Section title={t("certifications")} icon={<AwardIcon />}>
            <ul className="flex flex-col gap-2">
              {d.certifications!.map((cert, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">{cert.name}</span>
                  {(cert.issuer || cert.date) && (
                    <span className="text-muted-foreground">
                      {" · "}{[cert.issuer, monthYear(cert.date, format)].filter(Boolean).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {profile.approved_at && (
        <p className="text-xs text-muted-foreground">
          {t("approvedOn", { date: format.dateTime(new Date(profile.approved_at), { dateStyle: "long", timeZone: "Africa/Tunis" }) })}
        </p>
      )}
    </article>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold [&_svg]:size-5 [&_svg]:text-primary">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="shrink-0 text-muted-foreground [&_svg]:size-4">
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Tags({ items, label }: { items?: string[]; label: string }) {
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5 pt-1" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="rounded-md bg-muted px-2 py-0.5 text-xs">{item}</li>
      ))}
    </ul>
  );
}
