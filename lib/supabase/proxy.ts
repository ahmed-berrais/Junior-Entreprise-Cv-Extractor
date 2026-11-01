// Called by proxy.ts on every page request: refreshes the login session before it expires
// and passes the fresh cookies on to the page and back to the browser.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { asRole, loginFor, pageRedirect, requiredRole } from "@/lib/access";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (requiredRole(request.nextUrl.pathname)) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return response;
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Asking for the user is what triggers the refresh. Nothing may run between creating the
  // client and this call, or users get logged out at random.
  const { data: { user } } = await supabase.auth.getUser();
  let role = asRole(user?.app_metadata?.role);
  let disabled = false;
  if (role === "company" && user) {
    const company = await supabase.from("companies").select("disabled").eq("user_id", user.id).maybeSingle();
    disabled = Boolean(company.error || !company.data || company.data.disabled);
    if (disabled) role = null;
  }
  const path = request.nextUrl.pathname;
  const required = requiredRole(path);
  let blocked: NextResponse | null = null;
  if (path.startsWith("/api/")) {
    if (required && required !== role) blocked = NextResponse.json({ error: !user ? "not_logged_in" : required === "candidate" ? "not_candidate" : "forbidden" }, { status: user ? 403 : 401 });
  } else {
    const redirect = pageRedirect(path, role);
    if (redirect) blocked = NextResponse.redirect(new URL(disabled ? `${loginFor.company}?error=disabled` : redirect, request.url));
  }
  if (blocked) {
    response.cookies.getAll().forEach(cookie => blocked!.cookies.set(cookie));
    return blocked;
  }
  return response;
}
