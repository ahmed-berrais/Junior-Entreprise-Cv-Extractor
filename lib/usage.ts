// S3-10 · Counts one AI call or email in usage_counters (supabase/migrations/20261107200000_usage_counters.sql).
// The worker counts its own Gemini calls (worker/cv_worker/usage.py) through the same SQL function.
// Never throws: a search or an email must not fail because the counter couldn't be written.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function countUsage(kind: string) {
  try {
    const { error } = await createAdminClient().rpc("count_usage", { p_kind: kind });
    if (error) throw error;
  } catch {
    console.warn(JSON.stringify({ event: "usage_count_failed", kind }));
  }
}

export async function usageToday(): Promise<{ kind: string; n: number }[]> {
  const { data, error } = await createAdminClient().rpc("usage_today");
  if (error) throw error;
  return data ?? [];
}
