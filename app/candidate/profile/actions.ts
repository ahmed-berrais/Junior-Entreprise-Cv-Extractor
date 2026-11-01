"use server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkApproval } from "@/lib/profile/approval";
import type { SaveResult } from "@/lib/profile/draft-store";

export async function saveApprovedProfile(input: unknown, updatedAt: string): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate" || !user.emailConfirmed) return { ok: false, reason: "unauthorized" };
  const serialized = JSON.stringify(input);
  if (typeof updatedAt !== "string" || !updatedAt || updatedAt.length > 64 || !serialized || serialized.length > 500_000) return { ok: false, reason: "invalid" };
  const client = await createClient();
  const profile = await client.from("profiles").select("looking_for").eq("user_id", user.id).maybeSingle();
  if (profile.error || !profile.data) return { ok: false, reason: "failed" };
  const check = checkApproval(typeof input === "object" && input ? { ...input, looking_for: profile.data.looking_for } : null);
  if (!check.ok) return { ok: false, reason: "invalid" };
  const { data, error } = await createAdminClient().rpc("edit_approved_profile", { p_user_id: user.id, p_data: check.profile, p_updated_at: updatedAt });
  if (error) return { ok: false, reason: "failed" };
  return data ? { ok: true, updatedAt: data } : { ok: false, reason: "conflict" };
}
