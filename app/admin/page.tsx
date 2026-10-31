// S2-06 · /admin — "is everything working?" at a glance, during the upload week and on fair day.
// The counts come from one database call; the failed extractions are the early-warning system:
// many failures with the same message mean the AI quota or a key is the problem, not the candidates.
// Admin only: the role is checked before anything is read (the reads skip the access rules).
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { PageContainer } from "@/components/site/page-container";
import { AdminNav } from "@/components/admin/admin-nav";
import { isAdmin, loadFailedJobs, loadStats, topErrors, type AdminStats } from "@/lib/admin";

export default async function AdminOverviewPage() {
  const t = await getTranslations("admin");
  return (
    <PageContainer>
      <Suspense fallback={<p role="status">{t("loading")}</p>}>
        <Overview />
      </Suspense>
    </PageContainer>
  );
}

const PEOPLE = ["candidates", "approved_profiles", "draft_profiles", "hidden_profiles", "companies"] as const;
const QUEUE = ["jobs_queued", "jobs_failed_today", "jobs_done_today"] as const;

async function Overview() {
  const t = await getTranslations("admin");
  if (!(await isAdmin())) return <p role="alert">{t("notAdmin")}</p>;

  const [stats, failed] = await Promise.all([loadStats(), loadFailedJobs()]);
  const format = await getFormatter();

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">{t("overview.title")}</h1>
          <p className="text-muted-foreground">{t("overview.intro")}</p>
        </div>
        <AdminNav current="overview" />
      </header>

      {!stats ? (
        <p role="alert">{t("overview.unavailable")}</p>
      ) : (
        <>
          <StatGroup title={t("overview.people")} keys={PEOPLE} stats={stats} />
          <StatGroup title={t("overview.queue")} keys={QUEUE} stats={stats} />
        </>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="failed-jobs">
        <div className="flex flex-col gap-1">
          <h2 id="failed-jobs" className="font-heading text-lg font-semibold">{t("overview.failedTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("overview.failedIntro")}</p>
        </div>

        {failed === null ? (
          <p role="alert">{t("overview.unavailable")}</p>
        ) : failed.length === 0 ? (
          <p className="text-muted-foreground">{t("overview.noFailed")}</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardDescription>{t("overview.topErrors", { count: failed.length })}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {topErrors(failed, t("overview.noMessage")).map((e) => (
                    <li key={e.message} className="flex items-start gap-3 text-sm">
                      <Badge variant="destructive">{e.count}×</Badge>
                      <span>{e.message}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("overview.when")}</th>
                    <th className="px-4 py-3 font-medium">{t("overview.candidate")}</th>
                    <th className="px-4 py-3 font-medium">{t("overview.kind")}</th>
                    <th className="px-4 py-3 font-medium">{t("overview.error")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("overview.attempts")}</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((job) => (
                    <tr key={job.id} className="border-b last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format.dateTime(new Date(job.failed_at), {
                          dateStyle: "short", timeStyle: "short", timeZone: "Africa/Tunis",
                        })}
                      </td>
                      <td className="px-4 py-3">{job.who ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{t(`overview.kinds.${job.kind}`)}</td>
                      <td className="px-4 py-3">{job.error_message || t("overview.noMessage")}</td>
                      <td className="px-4 py-3 text-right">{job.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

async function StatGroup({ title, keys, stats }: { title: string; keys: readonly (keyof AdminStats)[]; stats: AdminStats }) {
  const t = await getTranslations("admin.overview.stats");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {keys.map((key) => (
          <Card key={key} size="sm">
            <CardHeader>
              <CardDescription>{t(key)}</CardDescription>
              <p
                className={`font-heading text-3xl font-bold tabular-nums ${key === "jobs_failed_today" && stats[key] > 0 ? "text-destructive" : ""}`}
              >
                {stats[key]}
              </p>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
