import "server-only";
import { sameOrigin } from "@/lib/api-access";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/access";
import { validateAuth } from "@/lib/candidate-auth";
import { normalizeAccessCode } from "@/lib/company-login";

export async function spaceLogin(request: Request, role: "company" | "admin") {
  if (!sameOrigin(request)) return Response.json({ error: "failed" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = role === "company" ? normalizeAccessCode(body?.password) : typeof body?.password === "string" ? body.password : "";
  if (validateAuth("login", email, password, "") || password.length > 256) return Response.json({ error: "invalidCredentials" }, { status: 400 });
  try {
    const client = await createClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) return Response.json({ error: error?.status === 429 ? "rateLimit" : "invalidCredentials" }, { status: error?.status === 429 ? 429 : 400 });
    if (data.user.app_metadata.role !== role) {
      await client.auth.signOut({ scope: "local" });
      return Response.json({ error: "invalidCredentials" }, { status: 403 });
    }
    if (role === "company") {
      const company = await client.from("companies").select("disabled").eq("user_id", data.user.id).maybeSingle();
      if (company.error || !company.data || company.data.disabled) {
        await client.auth.signOut({ scope: "local" });
        return Response.json({ error: company.data?.disabled ? "disabled" : "failed" }, { status: 403 });
      }
    }
    return Response.json({ redirect: homeFor[role] });
  } catch { return Response.json({ error: "failed" }, { status: 503 }); }
}
