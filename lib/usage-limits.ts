// S3-10 · The free daily limits the admin overview compares today's counts with.
// Copied from docs/AI_LIMITS.md: change both when a plan changes. A kind without a limit here
// (a renamed model, the auth emails) is shown as a plain count.
export const DAILY_LIMITS: Record<string, number> = {
  "gemini-3.5-flash-lite": 500,
  "gemini-3.5-flash": 20,
  "gemini-embedding-001": 1000,
  "email:company": 500, // Gmail SMTP, personal account
};

export type UsageLevel = "ok" | "warning" | "danger";

// Orange from 70% of a limit, red from 90%.
export function usageLevel(n: number, limit: number | undefined): UsageLevel {
  if (!limit) return "ok";
  return n >= limit * 0.9 ? "danger" : n >= limit * 0.7 ? "warning" : "ok";
}
