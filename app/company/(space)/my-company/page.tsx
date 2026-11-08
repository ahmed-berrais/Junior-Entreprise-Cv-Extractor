// S2-08 frame · S3-20 today's numbers and last scans. The company's own details are S2-09 (still a placeholder note).
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
import { CompanyToday } from "@/components/company/company-today";

export default async function Page() {
  const t = await getTranslations("company.pages.myCompany");
  return (
    <PageContainer>
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <CompanyToday />
      <p className="rounded-xl border border-dashed bg-card p-6 text-muted-foreground">{t("soon")}</p>
    </PageContainer>
  );
}
