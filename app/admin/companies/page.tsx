import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanyManagement } from "@/components/company/company-management";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
async function Content() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/login");
  const client = await createClient();
  const { data, error } = await client.from("companies").select("user_id,name,email,sector,disabled,created_at").order("created_at", { ascending: false });
  if (error) { const t = await getTranslations("companies"); return <p role="alert">{t("failed")}</p>; }
  return <CompanyManagement initialRows={data ?? []} />;
}
export default function Page() { return <Suspense fallback={null}><Content /></Suspense>; }
