// S3-05 · PUT/DELETE /api/company/shortlist/<public_id> against the running app and the local Supabase.
// The database rules are tested on their own in supabase/tests/11_shortlists.test.sql.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import example from "../fixtures/example-profile.json";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let company: User, otherCompany: User, candidate: User, hiddenOwner: User, boss: User;
let publicId: string, hiddenId: string;

before(async () => {
  [company, otherCompany, candidate, hiddenOwner, boss] = await Promise.all([
    createUser("company"), createUser("company"), createUser("candidate"), createUser("candidate"), createUser("admin"),
  ]);
  assert.ifError((await admin.from("companies").insert([
    { user_id: company.id, name: "Shortlist Co", disabled: false },
    { user_id: otherCompany.id, name: "Other Co", disabled: false },
  ])).error);
  const shown = await admin.from("profiles").insert({ user_id: candidate.id, status: "approved", data: example,
    approved_at: new Date().toISOString() }).select("public_id").single();
  const hidden = await admin.from("profiles").insert({ user_id: hiddenOwner.id, status: "approved", hidden: true,
    data: example, approved_at: new Date().toISOString() }).select("public_id").single();
  assert.ifError(shown.error ?? hidden.error);
  publicId = shown.data!.public_id;
  hiddenId = hidden.data!.public_id;
});
after(deleteTestUsers);

async function call(method: "PUT" | "DELETE", cookie: string | null, id: string, body?: unknown) {
  const response = await fetch(`${APP_URL}/api/company/shortlist/${id}`, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", origin: APP_URL, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const rows = async (companyId: string) =>
  (await admin.from("shortlists").select("note").eq("company_id", companyId)).data ?? [];

test("a company adds a profile, changes its note, then removes it", async () => {
  assert.deepEqual((await call("PUT", company.cookie, publicId)).body, { shortlisted: true, note: "" });
  assert.deepEqual(await rows(company.id), [{ note: "" }]);
  assert.deepEqual((await call("PUT", company.cookie, publicId, { note: "  great CV, call back  " })).body,
    { shortlisted: true, note: "great CV, call back" });
  assert.deepEqual(await rows(company.id), [{ note: "great CV, call back" }], "one row, note trimmed");
  assert.deepEqual(await rows(otherCompany.id), [], "nothing for another company");
  assert.deepEqual((await call("DELETE", company.cookie, publicId)).body, { shortlisted: false });
  assert.deepEqual(await rows(company.id), []);
});

test("a hidden, unknown or malformed profile gives 404", async () => {
  assert.equal((await call("PUT", company.cookie, hiddenId)).status, 404);
  assert.equal((await call("PUT", company.cookie, "A".repeat(22))).status, 404);
  assert.equal((await call("PUT", company.cookie, "not-an-id")).status, 404);
  assert.deepEqual(await rows(company.id), []);
});

test("a note that isn't text or is too long is refused", async () => {
  assert.equal((await call("PUT", company.cookie, publicId, { note: 42 })).status, 400);
  assert.equal((await call("PUT", company.cookie, publicId, { note: "x".repeat(1001) })).status, 400);
});

test("only companies: a visitor, a candidate or the admin can't, nor another site", async () => {
  for (const cookie of [null, candidate.cookie, boss.cookie]) {
    const { status } = await call("PUT", cookie, publicId);
    assert.ok([307, 401, 403].includes(status), `got ${status}`);
  }
  const response = await fetch(`${APP_URL}/api/company/shortlist/${publicId}`, {
    method: "PUT", headers: { origin: "https://evil.example", cookie: company.cookie } });
  assert.equal(response.status, 403);
  assert.deepEqual(await rows(company.id), []);
});
