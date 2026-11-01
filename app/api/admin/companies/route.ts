import { authorize } from "@/lib/api-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompanyInput, accessCode } from "@/lib/company";
import { sendCompanyCode } from "@/lib/company-mail";

export async function GET(request: Request) {
  const access = await authorize(request, "admin");
  if (access.response) return access.response;
  const { data, error } = await createAdminClient().from("companies").select("user_id,name,email,sector,disabled,created_at").order("created_at", { ascending: false });
  return error ? Response.json({ error: "failed" }, { status: 500 }) : Response.json({ companies: data }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const access = await authorize(request, "admin");
  if (access.response) return access.response;
  const parsed = CompanyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { name, email, sector } = parsed.data;
  const admin = createAdminClient();
  const code = accessCode();
  const { data, error } = await admin.auth.admin.createUser({ email, password: code, email_confirm: true, app_metadata: { role: "company" } });
  if (error || !data.user) return Response.json({ error: error?.code === "email_exists" ? "emailUsed" : "failed" }, { status: 400 });
  const saved = await admin.from("companies").insert({ user_id: data.user.id, name, email, sector }).select("user_id,name,email,sector,disabled,created_at").single();
  if (saved.error) {
    await admin.auth.admin.deleteUser(data.user.id);
    return Response.json({ error: "failed" }, { status: 500 });
  }
  try { await sendCompanyCode(email, name, code); }
  catch { return Response.json({ company: saved.data, warning: "emailFailed" }, { status: 201 }); }
  return Response.json({ company: saved.data }, { status: 201 });
}
