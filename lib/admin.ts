// S2-06 · Shared by the admin pages and the admin API: who may use them, and what they read.
// The admin reads through the service role (createAdminClient), so ALWAYS check isAdmin first.
import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function isAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

// The counts on /admin, from one database call (admin_stats, supabase/migrations/..._admin_overview.sql).
export const STAT_KEYS = [
  "candidates", "approved_profiles", "draft_profiles", "hidden_profiles", "companies",
  "jobs_queued", "jobs_failed_today", "jobs_done_today",
] as const;
export type AdminStats = Record<(typeof STAT_KEYS)[number], number>;

export async function loadStats(): Promise<AdminStats | null> {
  const { data, error } = await createAdminClient().rpc("admin_stats");
  return error || !data ? null : (data as AdminStats);
}

export type AdminCandidate = {
  user_id: string;
  email: string;
  name: string | null;
  status: "draft" | "approved";
  hidden: boolean;
  looking_for: "pfe" | "internship" | "job" | null;
  created_at: string;
  approved_at: string | null;
};

export async function loadCandidates(): Promise<AdminCandidate[] | null> {
  const { data, error } = await createAdminClient().rpc("admin_candidates");
  return error ? null : ((data ?? []) as AdminCandidate[]);
}

export type FailedJob = {
  id: string;
  user_id: string;
  who: string | null;          // the candidate's name if known, else their email
  kind: "extract" | "embed";
  error_message: string | null;
  attempts: number;
  failed_at: string;
};

// Newest first (Ahmed's note: many failures with the same message = an AI quota or key problem).
export const FAILED_JOBS_SHOWN = 50;
export async function loadFailedJobs(): Promise<FailedJob[] | null> {
  const { data, error } = await createAdminClient().rpc("admin_failed_jobs", { p_limit: FAILED_JOBS_SHOWN });
  return error ? null : ((data ?? []) as FailedJob[]);
}

// The most frequent messages among the failures shown, most frequent first.
export function topErrors(jobs: FailedJob[], noMessage: string, max = 3) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const message = job.error_message?.trim() || noMessage;
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, max).map(([message, count]) => ({ message, count }));
}
