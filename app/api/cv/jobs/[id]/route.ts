// S1-23 · GET /api/cv/jobs/:id — where is my CV? Used by the "Processing your CV" screen (S1-29).
// Returns { status, position, error }. position is the place in the queue (1 = next), only while
// the job is queued. error is a code (lib/cv/job-errors.ts) the screen shows in the visitor's language.
// The job is read with the candidate's own client, so the database's access rules (RLS) decide who
// sees it: someone else's job id looks exactly like one that doesn't exist (404).
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobErrorCode } from "@/lib/cv/job-errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "not_logged_in" }, { status: 401 });
  if (user.role !== "candidate" || !user.emailConfirmed) return Response.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "not_found" }, { status: 404 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("extraction_jobs")
    .select("status, error_message, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!job) return Response.json({ error: "not_found" }, { status: 404 });

  let position: number | null = null;
  if (job.status === "queued") {
    // Other candidates' jobs are invisible to this user, so the count needs the service role.
    // Only a number leaves this function, never their data.
    const { count } = await createAdminClient()
      .from("extraction_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .lt("created_at", job.created_at);
    position = (count ?? 0) + 1;
  }
  return Response.json({ status: job.status, position, error: jobErrorCode(job.error_message) });
}
