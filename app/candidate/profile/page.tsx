import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileSchema } from "@/lib/profile/schema.gen";
import { ProfileView } from "@/components/profile/profile-view";
import { ProfileControls } from "@/components/profile/profile-controls";
import { DeleteAccount } from "@/components/profile/delete-account";
import { PageContainer } from "@/components/site/page-container";
import { buttonVariants } from "@/components/ui/button";

async function Content() {
  const t = await getTranslations("myProfile");
  const user = await getCurrentUser();
  if (user?.role !== "candidate") redirect("/candidate/login");
  const client = await createClient();
  const { data: profile, error } = await client.from("profiles").select("data,status,hidden").eq("user_id", user.id).maybeSingle();
  if (error) return <p role="alert">{t("failed")}</p>;
  if (!profile) return <><p>{t("noProfile")}</p><Link href="/candidate/upload" className={buttonVariants()}>{t("upload")}</Link><DeleteAccount /></>;
  const parsed = ProfileSchema.safeParse(profile.data);
  return <><header><h1 className="text-3xl font-semibold">{t("title")}</h1><p className="mt-2">{t("status")}: {t(profile.hidden ? "hidden" : profile.status === "approved" ? "approved" : "draft")}</p></header>
    <nav className="flex flex-wrap gap-3" aria-label={t("actions")}>
      <Link className={buttonVariants()} href={profile.status === "approved" ? "/candidate/profile/edit" : "/candidate/review"}>{t("edit")}</Link>
      {profile.status === "approved" && <Link className={buttonVariants({ variant: "outline" })} href="/candidate/approved">{t("qr")}</Link>}
      <Link className={buttonVariants({ variant: "outline" })} href="/candidate/upload">{t("upload")}</Link>
    </nav><p className="text-sm text-muted-foreground">{t("qrStable")}</p><ProfileControls hidden={profile.hidden} />
    {profile.status === "approved" && parsed.success ? <ProfileView profile={parsed.data} /> : <p>{t("draftHint")}</p>}
    <DeleteAccount />
  </>;
}
export default function Page() { return <PageContainer><Suspense fallback={null}><Content /></Suspense></PageContainer>; }
