import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUTH_ACTIONS, authErrorCode, validateAuth, type AuthAction } from "@/lib/candidate-auth";
import { loadCandidateState, nextStep } from "@/lib/candidate/next-step";
import { countUsage } from "@/lib/usage";

export async function POST(request: NextRequest) {
  // Reject cross-site requests before touching cookies or sending email.
  const appOrigin = new URL(process.env.APP_URL || request.url).origin;
  if (request.headers.get("origin") !== appOrigin) return NextResponse.json({ error: "failed" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("action" in body) || !AUTH_ACTIONS.includes(body.action as AuthAction)) {
    return NextResponse.json({ error: "failed" }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const action = fields.action as AuthAction;
  const email = typeof fields.email === "string" ? fields.email.trim() : "";
  const password = typeof fields.password === "string" ? fields.password : "";
  const confirmation = typeof fields.confirmation === "string" ? fields.confirmation : "";
  const problem = validateAuth(action, email, password, confirmation);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const locale = fields.locale === "fr" ? "fr" : "en";
  const failure = (error: { code?: string; status?: number }) => NextResponse.json({ error: authErrorCode(error.code, error.status) }, { status: error.status === 429 ? 429 : 400 });

  try {
    const supabase = await createClient();
    const callback = new URL("/auth/callback", process.env.APP_URL || request.nextUrl.origin);
    callback.searchParams.set("lang", locale);
    if (action === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
      if (error) return failure(error);
      // Supabase may deliberately obfuscate an existing confirmed account.
      if (data.user?.identities?.length === 0) return NextResponse.json({ error: "emailUsed" }, { status: 400 });
      // Always show the confirmation message; even projects with confirmation off
      // must not accidentally leave signup as an implicit login.
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      else await countUsage("email:auth");  // no session = Supabase sent a confirmation email (S3-10)
      return NextResponse.json({ message: "checkEmail" });
    }
    if (action === "forgot") {
      callback.searchParams.set("flow", "recovery");
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
      if (error) return failure(error);
      // shortcut: Supabase answers OK for an unknown email too (no email sent), so a typo is counted.
      await countUsage("email:auth");
      return NextResponse.json({ message: "resetEmail" });
    }
    if (action === "logout") {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      return error ? failure(error) : NextResponse.json({ redirect: "/candidate/login" });
    }
    if (action === "reset") {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return NextResponse.json({ error: "invalidLink" }, { status: 401 });
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return failure(error);
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) return failure(signOutError);
      return NextResponse.json({ message: "passwordUpdated" });
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return failure(error);
    if (data.user?.app_metadata.role !== "candidate") {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json({ error: "wrongRole" }, { status: 403 });
    }
    // Upload, processing, review or QR page: wherever this candidate is in the flow.
    return NextResponse.json({ redirect: nextStep(await loadCandidateState(supabase, data.user.id)) });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
