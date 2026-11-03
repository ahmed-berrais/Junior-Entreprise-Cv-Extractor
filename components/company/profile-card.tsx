"use client";
// S2-10 · One candidate as a card in the CV grid: name, headline, email, city, domain and
// "looking for" as badges, and the top 5 skills. The whole card opens the full profile (S2-11).
// The data is the card shape the search API returns (lib/search/run-search.ts, toCard).
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MailIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SearchResponse } from "@/lib/search/run-search";

export type ProfileCardData = SearchResponse["results"][number];

const TOP_SKILLS = 5;

export function ProfileCard({ profile }: { profile: ProfileCardData }) {
  const t = useTranslations("company.cvs");
  const review = useTranslations("review");
  const upload = useTranslations("upload");
  const name = profile.name || t("noName");

  return (
    <Link
      href={`/p/${profile.public_id}`}
      aria-label={t("openProfile", { name })}
      className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-heading text-lg leading-snug font-semibold group-hover:text-primary">{name}</h2>
        {profile.headline && <p className="text-sm text-muted-foreground">{profile.headline}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {profile.domain && (
          <Badge variant="secondary">{review(`domains.${profile.domain}` as "domains.data_ai")}</Badge>
        )}
        {profile.looking_for && (
          <Badge>{upload(`choices.${profile.looking_for}` as "choices.pfe")}</Badge>
        )}
      </div>

      <dl className="flex flex-col gap-1 text-sm">
        {profile.email && (
          <div className="flex min-w-0 items-center gap-2">
            <dt><MailIcon className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{t("email")}</span></dt>
            <dd className="truncate">{profile.email}</dd>
          </div>
        )}
        {profile.city && (
          <div className="flex items-center gap-2">
            <dt><MapPinIcon className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{t("city")}</span></dt>
            <dd>{profile.city}</dd>
          </div>
        )}
      </dl>

      {profile.skills.length > 0 && (
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-label={t("skills")}>
          {profile.skills.slice(0, TOP_SKILLS).map((skill) => (
            <li key={skill} className="rounded-md bg-muted px-2 py-0.5 text-xs">{skill}</li>
          ))}
        </ul>
      )}
    </Link>
  );
}
