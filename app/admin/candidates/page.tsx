// S2-06 · /admin/candidates — every candidate with a profile, newest first, and "Delete" for junk
// or abuse (with a confirmation). Admin only: checked before anything is read.
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/site/page-container";
import { AdminNav } from "@/components/admin/admin-nav";
import { isAdmin, loadCandidates } from "@/lib/admin";
import { DeleteProfileButton } from "./delete-profile-button";

export default async function AdminCandidatesPage() {
  const t = await getTranslations("admin");
  return (
    <PageContainer>
      <Suspense fallback={<p role="status">{t("loading")}</p>}>
        <Candidates />
      </Suspense>
    </PageContainer>
  );
}

async function Candidates() {
  const t = await getTranslations("admin");
  if (!(await isAdmin())) return <p role="alert">{t("notAdmin")}</p>;

  const candidates = await loadCandidates();
  const format = await getFormatter();

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">{t("candidates.title")}</h1>
          <p className="text-muted-foreground">{t("candidates.intro")}</p>
        </div>
        <AdminNav current="candidates" />
      </header>

      {candidates === null ? (
        <p role="alert">{t("overview.unavailable")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">{t("candidates.count", { count: candidates.length })}</p>
          {candidates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("candidates.name")}</th>
                    <th className="px-4 py-3 font-medium">{t("candidates.email")}</th>
                    <th className="px-4 py-3 font-medium">{t("candidates.status")}</th>
                    <th className="px-4 py-3 font-medium">{t("candidates.lookingFor")}</th>
                    <th className="px-4 py-3 font-medium">{t("candidates.created")}</th>
                    <th className="px-4 py-3"><span className="sr-only">{t("candidates.delete")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.user_id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{c.name || <span className="text-muted-foreground">{t("candidates.noName")}</span>}</td>
                      <td className="px-4 py-3 break-all">{c.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={c.status === "approved" ? "default" : "secondary"}>
                            {t(`candidates.${c.status}`)}
                          </Badge>
                          {c.hidden && <Badge variant="outline">{t("candidates.hidden")}</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{c.looking_for ? t(`candidates.lookingForValues.${c.looking_for}`) : "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format.dateTime(new Date(c.created_at), { dateStyle: "short", timeZone: "Africa/Tunis" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeleteProfileButton userId={c.user_id} who={c.name || c.email} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
