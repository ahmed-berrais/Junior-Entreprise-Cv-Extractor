// Placeholder so everyone sees where their pages go. Replaced by the real page in its task.
// Texts always come from messages/ (en.json + fr.json), never typed in the page.
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function AdminPage() {
  const t = await getTranslations("placeholder");
  const profile = await getTranslations("myProfile");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-8">
      <p className="text-lg">{t("admin")}</p>
      <Link className={buttonVariants()} href="/admin/companies">{profile("manageCompanies")}</Link>
    </main>
  );
}
