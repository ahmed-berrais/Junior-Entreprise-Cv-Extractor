// S3-19 · Records that a company opened a full profile ("view") or opened it from the QR scanner ("scan").
// The profile page (S2-11) calls it for a company viewer, with the company's id from the login session:
//   kind = "scan" when the scanner (S3-01) opened /p/<public_id>?from=scan, otherwise "view".
// The database counts a view once per company, profile and day, and ignores a draft or hidden profile
// (supabase/migrations/20261107210000_profile_events.sql). Never throws: a profile must still open
// when the event can't be written.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProfileEventKind = "view" | "scan";

export const eventKind = (from: string | string[] | undefined): ProfileEventKind => (from === "scan" ? "scan" : "view");

export async function recordProfileEvent(companyId: string, publicId: string, kind: ProfileEventKind) {
  try {
    const { error } = await createAdminClient().rpc("record_profile_event", {
      p_company_id: companyId, p_public_id: publicId, p_kind: kind,
    });
    if (error) throw error;
  } catch {
    // No ids in the log: they point at a person.
    console.warn(JSON.stringify({ event: "profile_event_failed", kind }));
  }
}
