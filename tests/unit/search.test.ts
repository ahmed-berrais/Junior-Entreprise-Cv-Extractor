// S2-13 · The search API's logic without the network: Gemini and the database are replaced by fakes.
// The real route is tested in tests/api/search.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchParams } from "../../lib/search/params";
import { embedQuery, EMBED_DIMENSIONS, EmbedFailed } from "../../lib/search/embed-query";
import { runSearch, SearchFailed, type SearchDeps, type SearchRow } from "../../lib/search/run-search";
import example from "../fixtures/example-profile.json";

const parse = (query: string) => parseSearchParams(new URLSearchParams(query));

// ── the URL ──────────────────────────────────────────────────────────────
test("every parameter becomes the filter search_profiles expects", () => {
  const parsed = parse(
    "q=+computer+vision+&looking_for=pfe&domain=data_ai&skill=python&skill=PyTorch&skill=python" +
      "&skills_match=all&city=Tunis&school=ENIT&language=English&language=French&page=2",
  );
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      query: "computer vision",
      filters: {
        looking_for: ["pfe"],
        domains: ["data_ai"],
        skills: ["python", "PyTorch"],
        skills_match: "all",
        cities: ["Tunis"],
        schools: ["ENIT"],
        languages: ["English", "French"],
      },
      page: 2,
    },
  });
});

test("nothing at all is a valid search: every profile, page 1", () => {
  assert.deepEqual(parse(""), { ok: true, value: { query: "", filters: {}, page: 1 } });
  assert.deepEqual(parse("skill=&city=+"), { ok: true, value: { query: "", filters: {}, page: 1 } });
});

test("wrong values are refused before reaching the database or Gemini", () => {
  assert.deepEqual(parse("domain=astrology"), { ok: false, field: "domain" });
  assert.deepEqual(parse("looking_for=anything"), { ok: false, field: "looking_for" });
  assert.deepEqual(parse("skills_match=some"), { ok: false, field: "skills_match" });
  assert.deepEqual(parse(`q=${"a".repeat(201)}`), { ok: false, field: "q" });
  assert.deepEqual(parse(`skill=${"a".repeat(101)}`), { ok: false, field: "skill" });
  assert.deepEqual(parse(Array.from({ length: 21 }, (_, i) => `skill=s${i}`).join("&")), { ok: false, field: "skill" });
  for (const page of ["0", "-1", "1.5", "abc", "101"]) {
    assert.deepEqual(parse(`page=${page}`), { ok: false, field: "page" }, page);
  }
});

// ── Gemini ───────────────────────────────────────────────────────────────
const geminiAnswer = (values: number[], status = 200) =>
  (async () => new Response(JSON.stringify({ embedding: { values } }), { status })) as typeof fetch;

async function withKey<T>(run: () => Promise<T>, key: string | null = "test-key"): Promise<T> {
  const before = process.env.GEMINI_API_KEY;
  if (key === null) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = key;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before;
  }
}

test("the query is embedded like the worker does: RETRIEVAL_QUERY, 1,024 numbers, normalised", async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ embedding: { values: Array(EMBED_DIMENSIONS).fill(2) } }));
  }) as unknown as typeof fetch;

  const vector = await withKey(() => embedQuery("computer vision", { fetchFn }));
  assert.equal(vector.length, EMBED_DIMENSIONS);
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-9, "length 1");
  assert.match(sent!.url, /models\/gemini-embedding-001:embedContent$/);
  assert.equal((sent!.init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  assert.deepEqual(JSON.parse(sent!.init.body as string), {
    content: { parts: [{ text: "computer vision" }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: EMBED_DIMENSIONS,
  });
});

test("a broken key, a wrong answer, no key or a slow Gemini all throw EmbedFailed", async () => {
  await withKey(() => assert.rejects(embedQuery("x", { fetchFn: geminiAnswer([], 400) }), EmbedFailed));
  await withKey(() => assert.rejects(embedQuery("x", { fetchFn: geminiAnswer([1, 2, 3]) }), EmbedFailed));
  await withKey(() => assert.rejects(embedQuery("x", { fetchFn: geminiAnswer(Array(1024).fill(0)) }), EmbedFailed));
  await withKey(() => assert.rejects(embedQuery("x", { fetchFn: geminiAnswer(Array(1024).fill(1)) }), EmbedFailed),
    null);
  // A Gemini that never answers: the 3-second timeout (here 50 ms) gives up.
  const never = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))
  ) as unknown as typeof fetch;
  await withKey(() => assert.rejects(embedQuery("x", { fetchFn: never, timeoutMs: 50 }), /timed out/));
});

// ── one search ───────────────────────────────────────────────────────────
const row: SearchRow = {
  public_id: "abc", looking_for: "pfe", data: example, approved_at: null, score: 0.03, total_count: 42,
};

function fakeDb(rows: SearchRow[] = [row]) {
  const calls: Parameters<SearchDeps["search"]>[0][] = [];
  const search: SearchDeps["search"] = async (args) => {
    calls.push(args);
    return { data: rows, error: null };
  };
  return { calls, search };
}

test("normal search: the embedding goes to search_profiles as a vector, the rows come back as cards", async () => {
  const db = fakeDb();
  const result = await runSearch(
    { query: "PyTorch", filters: { cities: ["Tunis"] }, page: 1 },
    { embed: async () => [0.6, 0.8], search: db.search },
  );
  assert.deepEqual(db.calls, [{ query_text: "PyTorch", query_embedding: "[0.6,0.8]", filters: { cities: ["Tunis"] }, page: 1 }]);
  assert.equal(result.degraded, false);
  assert.equal(result.total, 42);
  assert.deepEqual(result.results[0], {
    public_id: "abc", name: "Sarra Ben Ali", headline: "Computer engineering student", city: "Tunis",
    looking_for: "pfe", domain: "software_engineering", seniority: "student",
    school: "École Nationale d'Ingénieurs de Tunis", degree: "Engineering degree", skills: ["Python", "Git", "Teamwork"],
  });
  assert.ok(!("email" in result.results[0]) && !("phone" in result.results[0]), "no contact details on a card");
});

test("Gemini fails: the same search runs with words only, and says degraded", async () => {
  const db = fakeDb();
  const result = await runSearch(
    { query: "PyTorch", filters: {}, page: 1 },
    { embed: async () => { throw new EmbedFailed("HTTP 400"); }, search: db.search },
  );
  assert.equal(db.calls[0].query_embedding, null);
  assert.equal(result.degraded, true);
  assert.equal(result.results.length, 1);
});

test("no query text: no Gemini call (it costs quota), not degraded", async () => {
  const db = fakeDb([]);
  let called = false;
  const result = await runSearch(
    { query: "", filters: { domains: ["data_ai"] }, page: 1 },
    { embed: async () => { called = true; return [1]; }, search: db.search },
  );
  assert.equal(called, false);
  assert.deepEqual(result, { results: [], total: 0, page: 1, degraded: false });
});

test("a database error is thrown with its code, never returned as an empty result", async () => {
  await assert.rejects(
    runSearch({ query: "", filters: {}, page: 1 }, {
      embed: async () => [1],
      search: async () => ({ data: null, error: { code: "22023", message: "unknown search filter" } }),
    }),
    (e) => e instanceof SearchFailed && e.code === "22023",
  );
});
