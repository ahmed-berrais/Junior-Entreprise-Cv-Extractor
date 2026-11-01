// S2-11 · Who may see a profile at /p/<public_id>, decided on the server BEFORE any profile is read
// (Ahmed's note: if the data is fetched and then hidden, it has already reached the browser).
//
//   logged out, or a role with no right to it      → "gate": no database read at all
//   an active company, or the admin               → the full profile, or "not_found"
//   a disabled company (or one without its row)   → "disabled": no profile read
//   a candidate                                   → their own profile ("own"), or the gate
//
// Every read uses the visitor's own Supabase client, so the database's access rules (RLS) still
// decide on top of this: a company only ever reads approved, visible profiles; a candidate only
// their own row. A candidate asking for someone else's link gets the gate, not a 404, so the page
// never says whether a link exists to someone who can't open it.
import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CandidateProfile } from "@/lib/profile/schema.gen";

export type ProfileRecord = {
  public_id: string;
  status: "draft" | "approved";
  hidden: boolean;
  looking_for: "pfe" | "internship" | "job" | null;
  approved_at: string | null;
  data: Partial<CandidateProfile>;
};

export type ProfileView =
  | { kind: "full"; profile: ProfileRecord; viewer: "company" | "admin" }
  | { kind: "own"; profile: ProfileRecord }
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "gate" };

// public_id is 22 URL-safe characters (new_public_id() in the database). Anything else can't exist.
const PUBLIC_ID = /^[A-Za-z0-9_-]{22}$/;
const COLUMNS = "public_id, status, hidden, looking_for, approved_at, data";

export async function loadProfileView(publicId: string): Promise<ProfileView> {
  const user = await getCurrentUser();
  if (!user?.role) return { kind: "gate" };

  const supabase = await createClient();

  if (user.role === "company") {
    // RLS lets a company read its own companies row: it must exist and not be turned off.
    const { data: company } = await supabase.from("companies").select("disabled").eq("user_id", user.id).maybeSingle();
    if (!company || company.disabled) return { kind: "disabled" };
  }

  if (user.role === "company" || user.role === "admin") {
    if (!PUBLIC_ID.test(publicId)) return { kind: "not_found" };
    const { data } = await supabase.from("profiles").select(COLUMNS).eq("public_id", publicId).maybeSingle();
    return data ? { kind: "full", profile: data as ProfileRecord, viewer: user.role } : { kind: "not_found" };
  }

  if (user.role === "candidate" && PUBLIC_ID.test(publicId)) {
    // Filtered by the candidate's own id too, so this can only ever match their own row.
    const { data } = await supabase
      .from("profiles").select(COLUMNS).eq("public_id", publicId).eq("user_id", user.id).maybeSingle();
    if (data) return { kind: "own", profile: data as ProfileRecord };
  }
  return { kind: "gate" };
}
