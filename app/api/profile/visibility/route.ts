import { authorize } from "@/lib/api-access";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const access = await authorize(request, "candidate");
  if (access.response) return access.response;
  const body = await request.json().catch(() => null);
  if (typeof body?.hidden !== "boolean") return Response.json({ error: "invalid" }, { status: 400 });
  const client = await createClient();
  const { data, error } = await client.from("profiles").update({ hidden: body.hidden }).eq("user_id", access.user.id).select("hidden").maybeSingle();
  if (error || !data) return Response.json({ error: "failed" }, { status: 500 });
  return Response.json(data);
}
