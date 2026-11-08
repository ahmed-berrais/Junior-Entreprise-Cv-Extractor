// S3-05 · A company's shortlist, one profile at a time.
//   PUT    /api/company/shortlist/<public_id>  { note }  adds the profile, or saves its note
//   DELETE /api/company/shortlist/<public_id>            removes it
// Active companies only (authorize, then the proxy before it). Every read and write uses the company's own
// client, so the database policies decide too (supabase/migrations/20261108100000_shortlists.sql):
// only a profile it may see, only its own rows. Notes are private: never logged.
import { authorize } from "@/lib/api-access";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_ID } from "@/lib/profile/view";
import { MAX_NOTE } from "@/lib/shortlist";

// The profile's id, if this company may see it (approved, not hidden): the profiles policy decides.
async function visibleProfile(publicId: string) {
  if (!PUBLIC_ID.test(publicId)) return { supabase: null, profileId: null };
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("user_id").eq("public_id", publicId).maybeSingle();
  return { supabase, profileId: (data?.user_id as string | undefined) ?? null };
}

export async function PUT(request: Request, { params }: RouteContext<"/api/company/shortlist/[publicId]">) {
  const access = await authorize(request, "company");
  if (access.response) return access.response;
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : body?.note === undefined ? "" : null;
  if (note === null || note.length > MAX_NOTE) return Response.json({ error: "invalid" }, { status: 400 });

  const { supabase, profileId } = await visibleProfile((await params).publicId);
  if (!supabase || !profileId) return Response.json({ error: "not_found" }, { status: 404 });

  // Update first, then add: an upsert would also rewrite the key columns, which the company may not update.
  const updated = await supabase.from("shortlists").update({ note, updated_at: new Date().toISOString() })
    .eq("company_id", access.user.id).eq("profile_id", profileId).select("profile_id");
  if (updated.error) return Response.json({ error: "failed" }, { status: 500 });
  if (updated.data.length === 0) {
    const added = await supabase.from("shortlists").insert({ company_id: access.user.id, profile_id: profileId, note });
    // 23505: added a moment ago by a second tab. The row is there, which is what was asked.
    if (added.error && added.error.code !== "23505") return Response.json({ error: "failed" }, { status: 500 });
  }
  return Response.json({ shortlisted: true, note });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/company/shortlist/[publicId]">) {
  const access = await authorize(request, "company");
  if (access.response) return access.response;
  const { supabase, profileId } = await visibleProfile((await params).publicId);
  if (!supabase || !profileId) return Response.json({ error: "not_found" }, { status: 404 });
  const { error } = await supabase.from("shortlists").delete().eq("company_id", access.user.id).eq("profile_id", profileId);
  return error ? Response.json({ error: "failed" }, { status: 500 }) : Response.json({ shortlisted: false });
}
