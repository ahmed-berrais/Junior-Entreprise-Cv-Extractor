// S2-08 · Who may enter the company space, read once per page by app/company/(space)/layout.tsx.
// An active company (same rule as the database's is_active_company: the role is "company", the
// company row exists and the club hasn't turned it off), or the admin, who may browse the CVs
// (S2-13 gives them the search too). The admin never reaches Scan or My company: the proxy sends
// them back to /admin (lib/access.ts).
import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CompanyAccess =
  | { ok: true; as: "company"; name: string }
  | { ok: true; as: "admin" }
  | { ok: false; reason: "not_company" | "no_row" | "disabled" };

export async function companyAccess(): Promise<CompanyAccess> {
  const user = await getCurrentUser();
  if (user?.role === "admin") return { ok: true, as: "admin" };
  if (user?.role !== "company") return { ok: false, reason: "not_company" };
  // getCurrentUser() already says whether the company is turned off (or has no row), so the row is
  // only read here for the name shown in the navigation.
  if (user.disabled) return { ok: false, reason: "disabled" };
  const { data } = await (await createClient())
    .from("companies").select("name").eq("user_id", user.id).maybeSingle();
  if (!data) return { ok: false, reason: "no_row" };
  return { ok: true, as: "company", name: data.name };
}
