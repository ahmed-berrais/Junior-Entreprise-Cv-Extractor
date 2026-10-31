// S2-08 · Who may enter the company space, read once per page by app/company/layout.tsx.
// Same rule as the database (is_active_company): the role is "company" AND the company row exists
// AND the club hasn't turned it off. Read with the company's own client, so the access rules apply.
import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CompanyAccess =
  | { ok: true; name: string }
  | { ok: false; reason: "not_company" | "no_row" | "disabled" };

export async function companyAccess(): Promise<CompanyAccess> {
  const user = await getCurrentUser();
  if (user?.role !== "company") return { ok: false, reason: "not_company" };
  const { data } = await (await createClient())
    .from("companies").select("name, disabled").eq("user_id", user.id).maybeSingle();
  if (!data) return { ok: false, reason: "no_row" };
  if (data.disabled) return { ok: false, reason: "disabled" };
  return { ok: true, name: data.name };
}
