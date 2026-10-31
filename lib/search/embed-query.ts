// S2-13 · The embedding of a search query, from Gemini. It must match the profile embeddings made by
// the worker (worker/cv_worker/ai/embed.py) exactly, or search by meaning returns nonsense:
// same model (GEMINI_EMBED_MODEL, the only one: CLAUDE.md rule 1), 1,024 numbers, normalised to length 1.
// The difference: queries use RETRIEVAL_QUERY, profiles RETRIEVAL_DOCUMENT (that's how Gemini wants it).
//
// One call, no retry, about 3 seconds at most: a recruiter is waiting. When it fails, search goes on
// with words only (lib/search/run-search.ts). Called from the API route only: the key never leaves the server.
// Never log the query or the error body: the body can quote the request.

export const EMBED_DIMENSIONS = 1024;
export const EMBED_TIMEOUT_MS = 3000;

export class EmbedFailed extends Error {}

export async function embedQuery(
  text: string,
  { fetchFn = fetch, timeoutMs = EMBED_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new EmbedFailed("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

  let response: Response;
  try {
    response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBED_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new EmbedFailed(e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error");
  }
  if (!response.ok) throw new EmbedFailed(`HTTP ${response.status}`);

  const body = await response.json().catch(() => null);
  const values: unknown = body?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBED_DIMENSIONS || !values.every(Number.isFinite)) {
    throw new EmbedFailed(`expected ${EMBED_DIMENSIONS} numbers`);
  }
  // Gemini only returns unit-length vectors at full size (3,072); cut to 1,024 they must be normalised.
  const norm = Math.hypot(...values);
  if (!norm) throw new EmbedFailed("empty vector");
  return values.map((v: number) => v / norm);
}
