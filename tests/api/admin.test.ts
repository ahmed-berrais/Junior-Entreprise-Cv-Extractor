// S2-06 · The admin pages and DELETE /api/admin/profiles/:userId, against the running app and the
// local Supabase. Only the admin gets in; a deleted profile disappears for companies at once.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, clientAs, createUser, deleteTestUsers } from "./helpers";

// Any supabase-js query builder: the filters differ per call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type User = Awaited<ReturnType<typeof createUser>>;
let boss: User;
let candidate: User;
let company: User;
let listed: User; // a candidate with a profile: only the admin may see their email

before(async () => {
  [boss, candidate, company] = await Promise.all([createUser("admin"), createUser("candidate"), createUser("company")]);
  await admin.from("companies").insert({ user_id: company.id, name: "Test company" });
  listed = await createUser("candidate");
  await admin.from("profiles").insert({ user_id: listed.id }); // shown on /admin/candidates
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
// admin's view renders is the numbers: each one carries data-stat="<key>" (app/admin/page.tsx).
const stat = (html: string, key: string) => {
  const found = html.match(new RegExp(`data-stat="${key}"[^>]*>(\\d+)<`));
  return found ? Number(found[1]) : null;
};
const countRows = async (table: string, filter: (q: Loose) => Loose = (q) => q) => {
  const { count } = await filter(admin.from(table).select("*", { count: "exact", head: true }));
  return count;
};

test("the admin pages are for the admin only", async () => {
  for (const cookie of [null, candidate.cookie, company.cookie]) {
    for (const page of ["/admin", "/admin/candidates"]) {
      const html = await (await fetch(`${APP_URL}${page}`, { headers: cookie ? { cookie } : {} })).text();
      assert.doesNotMatch(html, /data-stat=/, `${page} rendered the admin numbers`);
      // Not the viewer's own email: the header's user menu shows that one, as it should.
      assert.ok(!html.includes(listed.email), `${page} showed another candidate's email`);
    }
  }
  const list = await (await fetch(`${APP_URL}/admin/candidates`, { headers: { cookie: boss.cookie } })).text();
  assert.ok(list.includes(listed.email), "the admin sees the candidate in the list");
});

test("the admin overview shows the real counts", async () => {
  const html = await (await fetch(`${APP_URL}/admin`, { headers: { cookie: boss.cookie } })).text();
  // A page whose numbers failed to load shows "unavailable" and no data-stat at all: this fails then.
  assert.equal(stat(html, "companies"), await countRows("companies"));
  assert.equal(stat(html, "approved_profiles"), await countRows("profiles", (q) => q.eq("status", "approved")));
  assert.equal(stat(html, "draft_profiles"), await countRows("profiles", (q) => q.eq("status", "draft")));
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
