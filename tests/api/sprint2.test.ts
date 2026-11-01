import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, APP_URL, clientAs, createUser, deleteTestUsers } from "./helpers";
import example from "../fixtures/example-profile.json";

type User = Awaited<ReturnType<typeof createUser>>;
let candidate: User, company: User, organiser: User;
before(async () => {
  [candidate, company, organiser] = await Promise.all([createUser("candidate"), createUser("company"), createUser("admin")]);
  const result = await admin.from("companies").insert({ user_id: company.id, name: "Test company", email: company.email, sector: "Testing" });
  assert.equal(result.error, null);
});
after(deleteTestUsers);

async function call(path: string, user?: User, body?: unknown) {
  return fetch(`${APP_URL}${path}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", headers: { ...(user ? { cookie: user.cookie } : {}), origin: APP_URL, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test("real page role matrix redirects logged-out/wrong-role visitors", async () => {
  for (const [role, path, login] of [["candidate", "/candidate/profile", "/candidate/login"], ["company", "/company/cvs", "/company/login"], ["admin", "/admin/companies", "/admin/login"]] as const) {
    const anonymous = await call(path);
    assert.equal(anonymous.status, 307);
    assert.ok(anonymous.headers.get("location"), "redirect must provide Location");
    assert.equal(new URL(anonymous.headers.get("location")!, APP_URL).pathname, login);
    for (const [visitorRole, user] of [["candidate", candidate], ["company", company], ["admin", organiser]] as const) {
      const response = await call(path, user);
      const allowed = visitorRole === role || (visitorRole === "admin" && path === "/company/cvs");
      assert.equal(response.status, allowed ? 200 : 307, `${visitorRole} → ${path}`);
      if (!allowed) {
        const homes = { candidate: "/candidate", company: "/company/cvs", admin: "/admin" };
        assert.equal(new URL(response.headers.get("location")!, APP_URL).pathname, homes[visitorRole]);
      }
    }
  }
});

test("admin API refuses candidate/company/logged-out calls and cross-site mutations", async () => {
  assert.equal((await call("/api/admin/companies")).status, 401);
  assert.equal((await call("/api/admin/companies", candidate)).status, 403);
  assert.equal((await call("/api/admin/companies", company)).status, 403);
  assert.equal((await call("/api/admin/companies", organiser)).status, 200);
  const csrf = await fetch(`${APP_URL}/api/admin/companies/${company.id}/disable`, { method: "POST", headers: { cookie: organiser.cookie, origin: "https://other.example" } });
  assert.equal(csrf.status, 403);
});

test("company login accepts a code pasted with surrounding whitespace", async () => {
  const response = await call("/api/company/auth", undefined, { email: company.email, password: ` \n${company.password}\t ` });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirect, "/company/cvs");
});

test("disable blocks an existing session; enable restores it", async () => {
  try {
  assert.equal((await call(`/api/admin/companies/${company.id}/disable`, organiser, {})).status, 200);
  const blocked = await call("/company/cvs", company);
  assert.equal(blocked.status, 307);
  assert.ok(blocked.headers.get("location"), "redirect must provide Location");
  assert.equal(new URL(blocked.headers.get("location")!, APP_URL).pathname, "/company/login");
  const login = await call("/api/company/auth", undefined, { email: company.email, password: company.password });
  assert.equal(login.status, 403);
  assert.equal((await login.json()).error, "disabled");
  assert.equal((await call(`/api/admin/companies/${company.id}/enable`, organiser, {})).status, 200);
  assert.equal((await call("/company/cvs", company)).status, 200);
  } finally {
    // Keep later visibility tests independent if any assertion above fails.
    const restored = await admin.from("companies").update({ disabled: false }).eq("user_id", company.id);
    assert.equal(restored.error, null);
  }
});

test("hidden profiles disappear from company reads; edits queue embeddings and reject stale versions", async () => {
  const inserted = await admin.from("profiles").insert({ user_id: candidate.id, data: example, status: "approved" }).select("public_id,updated_at").single();
  assert.equal(inserted.error, null);
  const companyClient = await clientAs(company);
  const visible = async () => (await companyClient.from("profiles").select("user_id").eq("user_id", candidate.id)).data;
  assert.equal((await visible())?.length, 1);
  assert.equal((await call("/api/profile/visibility", candidate, { hidden: true })).status, 200);
  assert.equal((await visible())?.length, 0);
  assert.equal((await call("/api/profile/visibility", candidate, { hidden: false })).status, 200);
  assert.equal((await visible())?.length, 1);
  const version = await admin.from("profiles").select("updated_at").eq("user_id", candidate.id).single();
  const edited = structuredClone(example); edited.basics.name = "Updated candidate";
  const args = { p_user_id: candidate.id, p_data: edited, p_updated_at: version.data!.updated_at };
  const saved = await admin.rpc("edit_approved_profile", args);
  assert.equal(saved.error, null); assert.ok(saved.data);
  assert.equal((await admin.rpc("edit_approved_profile", args)).data, null);
  const result = await admin.from("profiles").select("public_id,data").eq("user_id", candidate.id).single();
  assert.equal(result.data!.data.basics.name, "Updated candidate");
  assert.equal(result.data!.public_id, inserted.data!.public_id);
  const jobs = await admin.from("extraction_jobs").select("kind").eq("user_id", candidate.id);
  assert.deepEqual(jobs.data, [{ kind: "embed" }]);
  const asCandidate = await clientAs(candidate);
  assert.ok((await asCandidate.rpc("edit_approved_profile", args)).error);
});
