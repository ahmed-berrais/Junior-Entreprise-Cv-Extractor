import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";
type User = Awaited<ReturnType<typeof createUser>>;
let candidate: User, company: User, organiser: User;
before(async () => {
  [candidate, company, organiser] = await Promise.all([createUser("candidate"), createUser("company"), createUser("admin")]);
  const saved = await admin.from("companies").insert({ user_id: company.id, name: "Role access test" });
  assert.equal(saved.error, null);
});
after(deleteTestUsers);
test("admin reaches profile URLs and the CV list but not private company pages", async t => {
  for (const path of ["/p/role-access-test", "/company/cvs"]) {
    const response = await fetch(`${APP_URL}${path}`, { redirect: "manual", headers: { cookie: organiser.cookie } });
    // A missing profile/reader may return 404 before its separate task is integrated.
    // This checks the server gate: neither an auth redirect nor a 401/403 is allowed.
    assert.ok([200, 404].includes(response.status), `${path}: ${response.status}`);
    assert.equal(response.headers.get("location"), null);
    t.diagnostic(`admin GET ${path}: ${response.status}, no authentication redirect`);
  }
  for (const path of ["/company", "/company/profile", "/company/settings"]) {
    const response = await fetch(`${APP_URL}${path}`, { redirect: "manual", headers: { cookie: organiser.cookie } });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!, APP_URL).pathname, "/admin");
  }
});
test("server refuses wrong-role address-bar URLs, even without rendering a button", async t => {
  const users = { candidate, company, admin: organiser };
  const homes = { candidate: "/candidate", company: "/company/cvs", admin: "/admin" };
  const areas = [{ role: "candidate", path: "/candidate/upload", login: "/candidate/login" }, { role: "company", path: "/company", login: "/company/login" }, { role: "admin", path: "/admin", login: "/admin/login" }] as const;
  for (const area of areas) {
    for (const role of [null, "candidate", "company", "admin"] as const) {
      const response = await fetch(`${APP_URL}${area.path}`, { redirect: "manual", headers: role ? { cookie: users[role].cookie } : {} });
      const expected = role === area.role ? 200 : 307;
      assert.equal(response.status, expected, `${role ?? "logged out"} → ${area.path}`);
      const location = response.headers.get("location");
      if (expected === 307) assert.equal(new URL(location!, APP_URL).pathname, role ? homes[role] : area.login);
      t.diagnostic(`${role ?? "logged out"} GET ${area.path}: ${response.status}${location ? ` Location=${location}` : ""}`);
    }
  }
});
test("direct API calls are refused on the server", async t => {
  for (const [user, path, status] of [[candidate, "/api/admin/companies", 403], [company, "/api/cv/jobs/00000000-0000-4000-8000-000000000000", 403], [undefined, "/api/admin/companies", 401]] as const) {
    const response = await fetch(`${APP_URL}${path}`, { redirect: "manual", headers: user ? { cookie: user.cookie } : {} });
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(typeof result.error, "string");
    t.diagnostic(`GET ${path}: ${response.status} ${JSON.stringify(result)}`);
  }
});
