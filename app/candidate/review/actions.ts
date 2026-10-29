"use server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/profile/schema.gen";
import { updateDraft, type SaveResult } from "@/lib/profile/draft-store";

export async function saveProfileDraft(input: unknown, updatedAt: string): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return { ok: false as const, reason: "unauthorized" };
  if (typeof updatedAt !== "string" || updatedAt.length > 64) return { ok: false as const, reason: "invalid" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success || JSON.stringify(input).length > 500_000) return { ok: false as const, reason: "invalid" };
  return updateDraft(await createClient(), user.id, parsed.data, updatedAt);
}
