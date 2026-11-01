import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileSchema } from "@/lib/profile/schema.gen";
import { ProfileReviewForm } from "@/components/profile/profile-review-form";
import { PageContainer } from "@/components/site/page-container";
import { saveApprovedProfile } from "../actions";
async function Content() {
  const t = await getTranslations("myProfile");
  const user = await getCurrentUser();
  if (user?.role !== "candidate") redirect("/candidate/login");
  const client = await createClient();
  const { data, error } = await client.from("profiles").select("data,status,updated_at").eq("user_id", user.id).maybeSingle();
  if (error) return <p role="alert">{t("failed")}</p>;
  if (!data || data.status !== "approved") redirect("/candidate/review");
  const parsed = ProfileSchema.safeParse(data.data);
  if (!parsed.success) return <p role="alert">{t("failed")}</p>;
  return <ProfileReviewForm initialValues={parsed.data} updatedAt={data.updated_at} saveDraftAction={saveApprovedProfile} editingApproved />;
}
export default function Page() { return <PageContainer className="max-w-4xl"><Suspense fallback={null}><Content /></Suspense></PageContainer>; }
