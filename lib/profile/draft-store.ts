import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateProfile } from "./schema.gen";

export type SaveResult = { ok: true; updatedAt: string } | { ok: false; reason: "unauthorized" | "invalid" | "failed" | "conflict" };

/** Receives the verified session user ID from the server action, never from form data. */
export async function updateDraft(client: SupabaseClient, userId: string, input: CandidateProfile, updatedAt: string): Promise<SaveResult> {
  const { data: profile, error: profileError } = await client.from("profiles").select("looking_for").eq("user_id", userId).maybeSingle();
  if (profileError) return { ok: false, reason: "failed" };
  const data = { ...input, looking_for: profile?.looking_for ?? null };
  const { data: saved, error } = await client.from("profile_drafts")
    .update({ data }).eq("user_id", userId).eq("updated_at", updatedAt)
    .select("updated_at").maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  if (!saved) return { ok: false, reason: "conflict" };
  return { ok: true, updatedAt: saved.updated_at as string };
}
