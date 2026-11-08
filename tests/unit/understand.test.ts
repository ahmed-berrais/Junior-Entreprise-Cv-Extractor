// S3-04 · Smart search without the network: Gemini is replaced by a fake. Every failure must give null,
// so the page runs the normal search with the sentence as typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandSentence } from "../../lib/search/understand";

const answer = (json: unknown, status = 200) =>
  (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof json === "string" ? json : JSON.stringify(json) }] } }] }), { status })) as typeof fetch;

const EXAMPLE = { skills: ["React"], cities: ["Sousse"], looking_for: ["pfe"], domains: [], text: "developers" };

async function withKey<T>(run: () => Promise<T>, key: string | null = "test-key"): Promise<T> {
  const before = process.env.GEMINI_SEARCH_API_KEY;
  if (key === null) delete process.env.GEMINI_SEARCH_API_KEY;
  else process.env.GEMINI_SEARCH_API_KEY = key;
  try { return await run(); } finally {
    if (before === undefined) delete process.env.GEMINI_SEARCH_API_KEY;
    else process.env.GEMINI_SEARCH_API_KEY = before;
  }
}
const understand = (fetchFn: typeof fetch, timeoutMs?: number) =>
  withKey(() => understandSentence("React developers in Sousse looking for a PFE", { fetchFn, timeoutMs }));

test("the example sentence becomes the search page's parameters", async () => {
  const params = await understand(answer(EXAMPLE));
  assert.equal(params?.toString(), "q=developers&skill=React&city=Sousse&looking_for=pfe");
});

test("the sentence goes to Gemini with the separate key, and duplicates and blanks are dropped", async () => {
  let sent: { url: string; key: string | null; body: { contents: { parts: { text: string }[] }[] } } | undefined;
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent = { url, key: new Headers(init.headers).get("x-goog-api-key"), body: JSON.parse(init.body as string) };
    return answer({ ...EXAMPLE, skills: ["React", " React ", ""], domains: ["software_engineering"] })("");
  }) as unknown as typeof fetch;
  const params = await understand(fetchFn);
  assert.equal(sent?.key, "test-key");
  assert.match(sent!.url, /:generateContent$/);
  assert.equal(sent?.body.contents[0].parts[0].text, "React developers in Sousse looking for a PFE");
  assert.deepEqual(params?.getAll("skill"), ["React"]);
  assert.deepEqual(params?.getAll("domain"), ["software_engineering"]);
});

test("every failure gives null: the normal search runs instead", async () => {
  const cases: [string, typeof fetch][] = [
    ["Gemini error", answer(EXAMPLE, 429)],
    ["not JSON", answer("React, Sousse")],
    ["a field missing", answer({ skills: ["React"] })],
    ["a domain outside the list", answer({ ...EXAMPLE, domains: ["astrology"] })],
    ["a value too long", answer({ ...EXAMPLE, skills: ["x".repeat(101)] })],
    ["nothing understood", answer({ skills: [], cities: [], looking_for: [], domains: [], text: "" })],
    ["no answer at all", (async () => new Response("{}")) as typeof fetch],
    ["network down", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch],
  ];
  for (const [name, fetchFn] of cases) assert.equal(await understand(fetchFn), null, name);
});

test("over the time limit gives null", async () => {
  const slow = ((_: string, init: RequestInit) =>
    new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
  assert.equal(await understand(slow, 20), null);
});

test("no key: null, without calling anything", async () => {
  let called = false;
  const fetchFn = (async () => { called = true; return answer(EXAMPLE)(""); }) as unknown as typeof fetch;
  assert.equal(await withKey(() => understandSentence("React", { fetchFn }), null), null);
  assert.equal(called, false);
});
