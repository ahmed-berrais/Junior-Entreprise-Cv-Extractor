// S2-13 · GET /api/search against the running app and the local Supabase.
// Whether Gemini answers depends on the app's GEMINI_API_KEY (none in CI), so these tests check what
// holds either way: words always find the profile. With and without a working key: see the PR.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import example from "../fixtures/example-profile.json";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let company: User;
let disabled: User;
let candidate: User;
// A word no other profile has, so the test finds exactly its own profile even on a busy local database.
const WORD = `zq${randomUUID().replaceAll("-", "")}`;

before(async () => {
  [company, disabled, candidate] = await Promise.all([createUser("company"), createUser("company"), createUser("candidate")]);
  // Both rows name every column: in a multi-row insert a missing one becomes null, not its default.
  const companies = await admin.from("companies").insert([
    { user_id: company.id, name: "Search Test Co", disabled: false },
    { user_id: disabled.id, name: "Disabled Co", disabled: true },
  ]);
  assert.ifError(companies.error);
  const data = structuredClone(example);
  data.skills.push({ name: WORD, category: "technical" });
  const profile = await admin.from("profiles").insert({ user_id: candidate.id, status: "approved", looking_for: "pfe",
    data, approved_at: new Date().toISOString() });
  assert.ifError(profile.error);
});
after(deleteTestUsers);

async function search(cookie: string | null, query: string) {
  const response = await fetch(`${APP_URL}/api/search?${query}`, { headers: cookie ? { cookie } : {} });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test("a logged-out visitor or a candidate gets 403", async () => {
  assert.equal((await search(null, `q=${WORD}`)).status, 403);
  assert.equal((await search(candidate.cookie, `q=${WORD}`)).status, 403);
});

test("a company finds the profile by a word in it, as a card", async () => {
  const { status, body } = await search(company.cookie, `q=${WORD}&looking_for=pfe&city=tunis`);
  assert.equal(status, 200);
  assert.equal(typeof body.degraded, "boolean");
  const card = body.results.find((r: { skills: string[] }) => r.skills.includes(WORD));
  assert.ok(card, "the profile is in the results");
  assert.equal(card.name, "Sarra Ben Ali");
  assert.equal(card.email, undefined, "no contact details on a card");
  assert.ok(body.total >= 1);
});

test("filters that exclude it, exclude it", async () => {
  const { body } = await search(company.cookie, `q=${WORD}&looking_for=job`);
  assert.equal(body.results.some((r: { skills: string[] }) => r.skills.includes(WORD)), false);
});

test("a disabled company finds nothing", async () => {
  const { status, body } = await search(disabled.cookie, `q=${WORD}`);
  assert.equal(status, 200);
  assert.deepEqual(body.results, []);
});

test("a wrong parameter is a 400, not a search without the filter", async () => {
  const { status, body } = await search(company.cookie, "domain=astrology");
  assert.equal(status, 400);
  assert.equal(body.field, "domain");
});
