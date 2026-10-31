// S2-13 · GET /api/search — the company search bar. Companies and the admin only.
// Query parameters: see lib/search/params.ts. Returns { results, total, page, degraded }:
// 20 cards per page; degraded is true when Gemini didn't answer and only words were searched.
//
// search_profiles runs with the company's own client, so the database's access rules apply on top
// of the check here: a disabled company finds nothing. Each search with text costs one Gemini
// embedding call (1,000 a day, shared with approvals: docs/AI_LIMITS.md), so the search page must
// not call this on every keystroke (S2-14).
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseSearchParams } from "@/lib/search/params";
import { embedQuery } from "@/lib/search/embed-query";
import { runSearch, SearchFailed } from "@/lib/search/run-search";

const error = (status: number, code: string, extra: object = {}) =>
  Response.json({ error: code, ...extra }, { status });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  // 403 for a logged-out visitor too: there's nothing here to log in for if you're a candidate.
  if (!user || (user.role !== "company" && user.role !== "admin")) return error(403, "not_allowed");

  const parsed = parseSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) return error(400, "invalid", { field: parsed.field });

  const supabase = await createClient();
  try {
    const result = await runSearch(parsed.value, {
      embed: (text) => embedQuery(text),
      search: (args) => supabase.rpc("search_profiles", args),
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof SearchFailed && e.code === "22023") return error(400, "invalid");
    return error(500, "failed");
  }
}
