// S2-11 · Who may see a profile at /p/<public_id>, decided on the server BEFORE any profile is read
// (Ahmed's note: if the data is fetched and then hidden, it has already reached the browser).
//
//   an active company, or the admin               → the full profile, or "not_found"
//   a disabled company (or one without its row)   → "disabled": no profile read
//   anyone else (logged out, a candidate)          → "gate": no database read at all
//
// The proxy (lib/access.ts, #29) already stops everyone but companies and the admin before this
// page: logged out → /company/login, a candidate → /candidate, a disabled company → the login with
// ?error=disabled. These checks stay as a second lock, so the page never relies on the proxy alone.
//
// Every read uses the visitor's own Supabase client, so the database's access rules (RLS) still
// decide on top of this: a company only ever reads approved, visible profiles.
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
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "gate" };

// public_id is 22 URL-safe characters (new_public_id() in the database). Anything else can't exist.
const PUBLIC_ID = /^[A-Za-z0-9_-]{22}$/;
const COLUMNS = "public_id, status, hidden, looking_for, approved_at, data";

export async function loadProfileView(publicId: string): Promise<ProfileView> {
  const user = await getCurrentUser();
  if (user?.role !== "company" && user?.role !== "admin") return { kind: "gate" };
  // getCurrentUser() already says whether the company is turned off or has no row (#29).
  if (user.role === "company" && user.disabled) return { kind: "disabled" };
  if (!PUBLIC_ID.test(publicId)) return { kind: "not_found" };

  const { data } = await (await createClient())
    .from("profiles").select(COLUMNS).eq("public_id", publicId).maybeSingle();
  return data ? { kind: "full", profile: data as ProfileRecord, viewer: user.role } : { kind: "not_found" };
}
