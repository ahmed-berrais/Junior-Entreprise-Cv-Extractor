// S3-04 · POST /api/search/understand against the running app. Whether Gemini answers depends on the
// app's GEMINI_SEARCH_API_KEY (none in CI), so the company test accepts both answers; with a key, the
// example sentence was checked by hand (see the PR).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let company: User;
let disabled: User;
let candidate: User;

before(async () => {
  [company, disabled, candidate] = await Promise.all([createUser("company"), createUser("company"), createUser("candidate")]);
  const companies = await admin.from("companies").insert([
    { user_id: company.id, name: "Smart Test Co", disabled: false },
    { user_id: disabled.id, name: "Disabled Co", disabled: true },
  ]);
  assert.ifError(companies.error);
});
after(deleteTestUsers);

async function understand(cookie: string | null, sentence: unknown, origin = APP_URL) {
  const response = await fetch(`${APP_URL}/api/search/understand`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ sentence }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const EXAMPLE = "React developers in Sousse looking for a PFE";

test("a visitor, a candidate, a disabled company or another site gets 403", async () => {
  assert.equal((await understand(null, EXAMPLE)).status, 403);
  assert.equal((await understand(candidate.cookie, EXAMPLE)).status, 403);
  assert.equal((await understand(disabled.cookie, EXAMPLE)).status, 403);
  assert.equal((await understand(company.cookie, EXAMPLE, "https://evil.example")).status, 403);
});

test("an empty, too long or missing sentence is refused", async () => {
  for (const sentence of ["", "   ", "a".repeat(201), 42, undefined]) {
    assert.equal((await understand(company.cookie, sentence)).status, 400, String(sentence));
  }
});

test("a company gets search parameters, or the fallback", async () => {
  const { status, body } = await understand(company.cookie, EXAMPLE);
  assert.equal(status, 200);
  if (body.fallback) assert.deepEqual(body, { fallback: true });
  else assert.equal(new URLSearchParams(body.params).get("city"), "Sousse");
});
