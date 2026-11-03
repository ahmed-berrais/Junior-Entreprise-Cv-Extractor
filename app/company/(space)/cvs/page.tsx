// S2-10 · /company/cvs — the screen recruiters spend the most time on: every approved candidate as
// a card, newest first, more cards as they scroll. The company space's layout (S2-08) already checked
// that this is an active company. The cards come from the search API (components/company/cv-grid.tsx).
// S2-14 · The search bar and filters sit above the grid (components/company/cv-search.tsx). They read
// the URL, so they render inside <Suspense>. The domain list comes from the profile schema, here on the
// server, so the browser doesn't load the whole schema.
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
import { CvSearch } from "@/components/company/cv-search";
import { ProfileSchema } from "@/lib/profile/schema.gen";

const DOMAINS = ProfileSchema.shape.classification.shape.domain.options;

export default async function CvsPage() {
  const t = await getTranslations("company.cvs");
  return (
    <PageContainer>
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>}>
        <CvSearch domains={DOMAINS} />
      </Suspense>
    </PageContainer>
  );
}
