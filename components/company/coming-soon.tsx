// S2-08 · A placeholder for the company pages other tasks fill in. Remove it from a page in that task.
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";

export async function ComingSoon({ page }: { page: "scan" | "myCompany" }) {
  const t = await getTranslations(`company.pages.${page}`);
  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground">{t("soon")}</p>
    </PageContainer>
  );
}
