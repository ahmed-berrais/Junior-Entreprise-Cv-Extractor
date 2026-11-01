// Compatibility link: confirmation is also available directly on My profile.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/site/page-container";
import { DeleteAccount } from "@/components/profile/delete-account";
export default async function Page() {
  const t = await getTranslations("myProfile");
  return <PageContainer className="max-w-xl"><DeleteAccount /><Link href="/candidate/profile" className="underline">{t("back")}</Link></PageContainer>;
}
