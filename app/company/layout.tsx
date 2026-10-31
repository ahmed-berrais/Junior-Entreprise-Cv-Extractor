// S2-08 · The frame every company page lives in: the company navigation (components/company/
// company-nav.tsx) around the page. Only an active company gets in (lib/company.ts); anyone else
// sees why, and no company page is rendered. Reads the login cookie, so it sits inside <Suspense>.
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
import { CompanyNav } from "@/components/company/company-nav";
import { companyAccess } from "@/lib/company";

export default async function CompanyLayout({ children }: LayoutProps<"/company">) {
  const t = await getTranslations("company");
  return (
    <Suspense fallback={<PageContainer><p role="status">{t("loading")}</p></PageContainer>}>
      <CompanyGate>{children}</CompanyGate>
    </Suspense>
  );
}

async function CompanyGate({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("company");
  const access = await companyAccess();
  if (!access.ok) {
    const message = { not_company: t("notCompany"), no_row: t("noRow"), disabled: t("disabled") }[access.reason];
    return (
      <PageContainer className="max-w-xl justify-center">
        <p role="alert" className="text-center">{message}</p>
      </PageContainer>
    );
  }
  return (
    <>
      <CompanyNav companyName={access.name} />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
