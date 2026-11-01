import { z } from "zod";
import { authorize } from "@/lib/api-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessCode } from "@/lib/company";
import { sendCompanyCode } from "@/lib/company-mail";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const access = await authorize(request, "admin");
  if (access.response) return access.response;
  const { id, action } = await params;
  if (!z.uuid().safeParse(id).success || !["resend", "disable", "enable"].includes(action)) return Response.json({ error: "invalid" }, { status: 400 });
  const admin = createAdminClient();
  const { data: company, error } = await admin.from("companies").select("user_id,name,email,disabled").eq("user_id", id).maybeSingle();
  if (error) return Response.json({ error: "failed" }, { status: 500 });
  if (!company) return Response.json({ error: "notFound" }, { status: 404 });
  if (action === "resend") {
    if (company.disabled) return Response.json({ error: "disabled" }, { status: 409 });
    const account = await admin.auth.admin.getUserById(id);
    if (account.error || account.data.user?.app_metadata.role !== "company" || !account.data.user.email) return Response.json({ error: "failed" }, { status: 500 });
    const code = accessCode();
    const changed = await admin.auth.admin.updateUserById(id, { password: code });
    if (changed.error) return Response.json({ error: "failed" }, { status: 500 });
    try { await sendCompanyCode(account.data.user.email, company.name, code); }
    catch { return Response.json({ error: "emailFailed" }, { status: 502 }); }
    return Response.json({ ok: true });
  }
  // RLS and every request check this flag, including sessions issued before disable.
  const changed = await admin.from("companies").update({ disabled: action === "disable" }).eq("user_id", id).select("user_id,name,email,sector,disabled,created_at").single();
  return changed.error ? Response.json({ error: "failed" }, { status: 500 }) : Response.json({ company: changed.data });
}
