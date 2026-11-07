// S3-10 · Today's AI calls and emails next to their free limits, on the admin overview.
// Reads with the service role, so it checks the admin itself; it must sit inside <Suspense> (rule 11).
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { usageToday } from "@/lib/usage";
import { DAILY_LIMITS, usageLevel } from "@/lib/usage-limits";

const LEVEL_STYLE = {
  ok: "",
  warning: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  danger: "bg-destructive/15 text-destructive",
};

export async function UsagePanel() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  const t = await getTranslations("usage");

  let rows: { kind: string; n: number }[];
  try {
    rows = await usageToday();
  } catch {
    return <p role="alert">{t("failed")}</p>;
  }
  // Every known limit shows, even at 0, so the admin sees what is watched.
  const counts = new Map(Object.keys(DAILY_LIMITS).map((kind) => [kind, 0]));
  for (const row of rows) counts.set(row.kind, row.n);

  return (
    <section className="w-full max-w-md" aria-labelledby="usage-title">
      <h2 id="usage-title" className="text-lg font-semibold">{t("title")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("since")}</p>
      <ul className="flex flex-col gap-1">
        {[...counts].map(([kind, n]) => {
          const limit = DAILY_LIMITS[kind];
          const level = usageLevel(n, limit);
          return (
            <li key={kind} className={`flex min-h-11 items-center justify-between gap-3 rounded-md px-3 ${LEVEL_STYLE[level]}`}>
              <span className="break-all">{kind}</span>
              <span className="whitespace-nowrap tabular-nums">
                {limit ? t("ofLimit", { n, limit }) : n}
                {level !== "ok" && <strong className="ml-2">{t(level)}</strong>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
