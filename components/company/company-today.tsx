// S3-20 · "My company": today's numbers and the last candidates scanned (achraf's S2-02 mockup, screen 2).
// Everything comes from company_stats() (S3-19), called as the logged-in company, so RLS keeps it to
// its own events. "Today" starts at midnight Tunisia time, in the database. Reads the login cookie:
// the company layout already puts every page inside <Suspense>.
import Link from "next/link";
import { connection } from "next/server";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronRightIcon, ScanLineIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type CompanyStats = {
  views_today: number;
  scans_today: number;
  last_scanned: { public_id: string; name: string | null; school: string | null; scanned_at: string }[];
};

export async function CompanyToday() {
  const t = await getTranslations("company.today");
  const format = await getFormatter();
  const { data, error } = await (await createClient()).rpc("company_stats");
  if (error || !data) return <p role="alert" className="text-destructive">{t("error")}</p>;

  const stats = data as CompanyStats;
  await connection(); // "now" is per request (Cache Components)
  const now = new Date();
  const tiles = [
    { label: t("viewsToday"), value: stats.views_today },
    { label: t("scansToday"), value: stats.scans_today },
  ];

  return (
    <section aria-labelledby="company-today" className="flex flex-col gap-4">
      <h2 id="company-today" className="sr-only">{t("title")}</h2>
      <dl className="grid grid-cols-2 gap-3">
        {tiles.map(({ label, value }) => (
          <div key={label} className="flex flex-col-reverse justify-end gap-1 rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-heading text-3xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="font-heading text-lg font-semibold">{t("lastScanned")}</h3>
      {stats.last_scanned.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed bg-card p-6">
          <p>{t("empty")}</p>
          <Link href="/company/scan" className={buttonVariants()}>
            <ScanLineIcon data-icon="inline-start" aria-hidden="true" />
            {t("scan")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {stats.last_scanned.map((p) => (
            <li key={p.public_id}>
              {/* The whole row opens the profile: a small link would squeeze the name on a phone. */}
              <Link
                href={`/p/${p.public_id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.name || t("noName")}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[p.school, format.relativeTime(new Date(p.scanned_at), now)].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
