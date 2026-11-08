// S3-05 · "My shortlist": the candidates this company shortlisted, newest first, with its private notes.
// Read with the company's own client: RLS returns only its rows, and the !inner join drops a profile the
// candidate has hidden since. The whole row opens the profile, where the note can be changed.
import Link from "next/link";
import { connection } from "next/server";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRightIcon, FilesIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/site/page-container";
import { createClient } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/profile/schema.gen";

type Row = { note: string; created_at: string; profiles: { public_id: string; data: Partial<CandidateProfile> } };

export default async function Page() {
  const t = await getTranslations("shortlist");
  const format = await getFormatter();
  const { data, error } = await (await createClient()).from("shortlists")
    .select("note, created_at, profiles!inner(public_id, data)").order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  await connection(); // "now" is per request (Cache Components); the layout already wraps this in <Suspense>
  const now = new Date();

  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold">{t("pageTitle")}</h1>
      {error ? (
        <p role="alert" className="text-destructive">{t("loadError")}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed bg-card p-6">
          <p>{t("empty")}</p>
          <Link href="/company/cvs" className={buttonVariants()}>
            <FilesIcon data-icon="inline-start" aria-hidden="true" />
            {t("browse")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map(({ note, created_at, profiles: p }) => {
            const basics = p.data.basics;
            const school = p.data.education?.[0]?.institution;
            return (
              <li key={p.public_id}>
                <Link
                  href={`/p/${p.public_id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{basics?.name || t("noName")}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {[basics?.headline ?? school, format.relativeTime(new Date(created_at), now)].filter(Boolean).join(" · ")}
                    </span>
                    {note && <span className="line-clamp-2 text-sm">{note}</span>}
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
