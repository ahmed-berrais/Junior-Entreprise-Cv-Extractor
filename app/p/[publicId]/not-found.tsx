// S2-11 · An unknown /p/<public_id>, for a company or the admin (others never learn whether a link exists).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchXIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/site/page-container";

export default async function ProfileNotFound() {
  const t = await getTranslations("profilePage.notFound");
  return (
    <PageContainer data-view="not_found" className="max-w-xl items-center justify-center text-center">
      <SearchXIcon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("text")}</p>
      <Link href="/company/cvs" className={buttonVariants({ variant: "outline" })}>{t("back")}</Link>
    </PageContainer>
  );
}
