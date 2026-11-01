// S2-06 · DELETE /api/admin/profiles/:userId — the admin deletes a junk or abusive profile.
// Profile, draft and CV jobs go in one database step (admin_delete_profile); the login stays.
// Any CV file still waiting in uploads-tmp is removed too (rule 2: no CV file is kept).
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error = (status: number, code: string) => Response.json({ error: code }, { status });

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await isAdmin())) return error(403, "not_admin");

  const { userId } = await params;
  if (!UUID.test(userId)) return error(404, "not_found");

  const admin = createAdminClient();
  const { data: files, error: failed } = await admin.rpc("admin_delete_profile", { p_user_id: userId });
  if (failed) return error(500, "delete_failed");
  if (files === null) return error(404, "not_found");

  if (Array.isArray(files) && files.length) {
    // The profile is already gone, so this can't be undone: if storage fails, say so in the server log
    // with the paths, so the admin can remove them by hand in the Supabase dashboard.
    const { error: storageFailed } = await admin.storage.from("uploads-tmp").remove(files as string[]);
    if (storageFailed) console.error("admin delete: CV files left in uploads-tmp", files, storageFailed.message);
  }
  return new Response(null, { status: 204 });
}
