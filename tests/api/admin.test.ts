// S2-06 · The admin pages and DELETE /api/admin/profiles/:userId, against the running app and the
// local Supabase. Only the admin gets in; a deleted profile disappears for companies at once.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, clientAs, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let boss: User;
let candidate: User;
let company: User;

before(async () => {
  [boss, candidate, company] = await Promise.all([createUser("admin"), createUser("candidate"), createUser("company")]);
  await admin.from("companies").insert({ user_id: company.id, name: "Test company" });
  await admin.from("profiles").insert({ user_id: candidate.id }); // listed on /admin/candidates
});
after(deleteTestUsers);

const del = (cookie: string | null, id: string) =>
  fetch(`${APP_URL}/api/admin/profiles/${id}`, { method: "DELETE", headers: cookie ? { cookie } : {} });

async function approvedProfile() {
  const user = await createUser("candidate");
  await admin.from("profiles").insert({
    user_id: user.id, status: "approved", looking_for: "pfe", approved_at: new Date().toISOString(),
    data: { basics: { name: "Test Candidate" } },
  });
  return user;
}

// Every text of the chosen language travels inside each page (next-intl hands them to the browser
// components), so a sentence like "Failed extractions" is in the HTML for everyone. What only the
// admin's view renders is the failed-jobs section itself: its id is the thing to look for.
const ADMIN_ONLY = /"failed-jobs"/;

test("the admin pages are for the admin only", async () => {
  for (const cookie of [null, candidate.cookie, company.cookie]) {
    for (const page of ["/admin", "/admin/candidates"]) {
      const html = await (await fetch(`${APP_URL}${page}`, { headers: cookie ? { cookie } : {} })).text();
      assert.doesNotMatch(html, ADMIN_ONLY, `${page} rendered the admin view`);
      assert.doesNotMatch(html, new RegExp(candidate.email), `${page} leaked a candidate's email`);
    }
  }
  const html = await (await fetch(`${APP_URL}/admin`, { headers: { cookie: boss.cookie } })).text();
  assert.match(html, ADMIN_ONLY);
  const list = await (await fetch(`${APP_URL}/admin/candidates`, { headers: { cookie: boss.cookie } })).text();
  assert.match(list, new RegExp(candidate.email), "the admin sees the candidate in the list");
});

test("only the admin can delete, and a deleted profile disappears for companies", async () => {
  const target = await approvedProfile();
  const asCompany = await clientAs(company);
  const visible = async () =>
    (await asCompany.from("profiles").select("user_id").eq("user_id", target.id)).data?.length ?? 0;
  assert.equal(await visible(), 1, "the company sees the approved profile");

  for (const cookie of [null, candidate.cookie, company.cookie]) {
    assert.equal((await del(cookie, target.id)).status, 403);
  }
  assert.equal(await visible(), 1, "refused deletes changed nothing");

  assert.equal((await del(boss.cookie, target.id)).status, 204);
  assert.equal(await visible(), 0, "gone from browsing and search");
  const { data: user } = await admin.auth.admin.getUserById(target.id);
  assert.ok(user.user, "the login stays");
});

test("deleting a profile that doesn't exist is a 404", async () => {
  assert.equal((await del(boss.cookie, "00000000-0000-0000-0000-000000000000")).status, 404);
  assert.equal((await del(boss.cookie, "not-a-uuid")).status, 404);
});
