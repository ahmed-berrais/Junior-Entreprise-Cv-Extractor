// Next.js 16 "proxy" (it was called middleware before): runs before every page request.
// Keeps login fresh and gates each role's pages and APIs (S2-01).
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Exclude framework assets. Do not exclude arbitrary image suffixes: a URL
  // such as /p/private.png or /api/admin/export.png must still pass role checks.
  // There are no public images yet; add explicit protected-prefix matchers
  // before introducing a public-image optimization, so it cannot bypass Auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
