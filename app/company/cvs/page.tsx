// Landing point for company login until S2-10's CV grid is integrated.
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
export default async function Page() {
  const t = await getTranslations("myProfile");
  return <PageContainer><p>{t("browsePending")}</p></PageContainer>;
}
