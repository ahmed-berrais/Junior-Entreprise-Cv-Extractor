// Who is logged in, and as what. Use this everywhere instead of reading the session yourself.
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asRole } from "@/lib/access";

export type Role = "candidate" | "company" | "admin";

export async function getCurrentUser() {
  // Who is logged in is only known at request time: tells Next.js not to prerender what follows
  // (Supabase reads the clock to check the session, which Cache Components refuses while prerendering).
  await connection();
  const supabase = await createClient();
  // getUser() asks Supabase Auth to confirm the session, so a forged cookie is refused.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  // The role lives in app_metadata, which only the server can set. Never user_metadata:
  // users can edit that themselves.
  const role = asRole(data.user.app_metadata?.role);
  let disabled = false;
  if (role === "company") {
    const company = await supabase.from("companies").select("disabled").eq("user_id", data.user.id).maybeSingle();
    disabled = Boolean(company.error || !company.data || company.data.disabled);
  }
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    role,
    disabled,
    // False until the candidate clicks the link in the confirmation email.
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
}
