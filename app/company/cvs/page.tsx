// S2-10 · /company/cvs — the screen recruiters spend the most time on: every approved candidate as
// a card, newest first, more cards as they scroll. The company space's layout (S2-08) already checked
// that this is an active company. The cards come from the search API (components/company/cv-grid.tsx).
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
import { CvGrid } from "@/components/company/cv-grid";

export default async function CvsPage() {
  const t = await getTranslations("company.cvs");
  return (
    <PageContainer>
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <CvGrid />
    </PageContainer>
  );
}
