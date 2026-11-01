// Run once with: node --env-file=.env.local --import tsx scripts/seed-admin.ts
// Supply ADMIN_EMAIL and ADMIN_PASSWORD privately. Never put them in this file.
import { createClient } from "@supabase/supabase-js";
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) throw new Error("Set Supabase keys, ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)");
async function seed() {
  const client = createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.admin.createUser({ email: ADMIN_EMAIL!, password: ADMIN_PASSWORD!, email_confirm: true, app_metadata: { role: "admin" } });
  if (error) throw new Error(`Admin creation failed (${error.code || error.status}). No existing user was promoted or changed.`);
  console.log("Administrator created. Sign in at /admin/login.");
}
void seed().catch(error => { console.error(error.message); process.exitCode = 1; });
