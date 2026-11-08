// S3-04 · POST /api/search/understand { sentence } — smart search. Companies and the admin only.
// Returns { params } (the search page's query string, e.g. "q=developers&skill=React&city=Sousse") or
// { fallback: true }, and then the page searches the sentence as typed (lib/search/understand.ts).
// One Gemini call per request, on the smart search key: the page calls it on Enter only.
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/api-access";
import { MAX_QUERY } from "@/lib/search/url";
import { understandSentence } from "@/lib/search/understand";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "not_allowed" }, { status: 403 });
  const user = await getCurrentUser();
  // A disabled company is refused here: no database rule stands between it and the Gemini quota.
  if (!user || user.disabled || (user.role !== "company" && user.role !== "admin")) return Response.json({ error: "not_allowed" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const sentence = typeof body?.sentence === "string" ? body.sentence.trim() : "";
  if (!sentence || sentence.length > MAX_QUERY) return Response.json({ error: "invalid" }, { status: 400 });

  const params = await understandSentence(sentence);
  return Response.json(params ? { params: params.toString() } : { fallback: true });
}
