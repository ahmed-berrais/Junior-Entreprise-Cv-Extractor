// S2-11 · /p/<public_id> against the running app and the local Supabase: who sees the profile, and
// that nobody who may not see it gets any of its data. Each case marks what it rendered with
// data-view (every text of the language travels in every page, so texts can't tell them apart).
// Logged-out visitors, candidates and disabled companies are stopped by the proxy (lib/access.ts)
// before the page, so for them the test checks the redirect and that it carries no profile data.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import example from "../fixtures/example-profile.json";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let owner: User, other: User, company: User, disabledCompany: User, boss: User;
let publicId: string, hiddenId: string;
const PHONE = example.basics.phone;

before(async () => {
  [owner, other, company, disabledCompany, boss] = await Promise.all([
    createUser("candidate"), createUser("candidate"), createUser("company"), createUser("company"), createUser("admin"),
  ]);
  assert.ifError((await admin.from("companies").insert([
    { user_id: company.id, name: "Profile Test Co", disabled: false },
    { user_id: disabledCompany.id, name: "Off Co", disabled: true },
  ])).error);
  const approved = await admin.from("profiles").insert({ user_id: owner.id, status: "approved", looking_for: "pfe",
    data: example, approved_at: new Date().toISOString() }).select("public_id").single();
  assert.ifError(approved.error);
  publicId = approved.data!.public_id;
  const hidden = await admin.from("profiles").insert({ user_id: other.id, status: "approved", hidden: true,
    looking_for: "job", data: { ...example, basics: { ...example.basics, phone: "+216 99 999 999" } },
    approved_at: new Date().toISOString() }).select("public_id").single();
  assert.ifError(hidden.error);
  hiddenId = hidden.data!.public_id;
});
after(deleteTestUsers);

async function open(cookie: string | null, id: string) {
  const res = await fetch(`${APP_URL}/p/${id}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const html = await res.text();
  const to = new URL(res.headers.get("location") ?? "/", APP_URL);
  // The rendered case is an HTML attribute: data-view="full". The not-found page is the exception: a
  // notFound() inside <Suspense> arrives only in the streamed page data. That data also carries the
  // not-found page as a fallback on EVERY /p page, so it only counts when nothing was rendered.
  const rendered = html.match(/data-view="([a-z_]+)"/)?.[1];
  const notFound = html.includes(String.raw`\"data-view\":\"not_found\"`);
  return { view: rendered ?? (notFound ? "not_found" : null), html, status: res.status, location: to.pathname + to.search };
}

test("a company and the admin see the full profile", async () => {
  for (const user of [company, boss]) {
    const { view, html } = await open(user.cookie, publicId);
    assert.equal(view, "full");
    assert.ok(html.includes(PHONE), "contact details are shown");
  }
});

test("anyone else is sent away before the page, with none of the profile's data", async () => {
  const cases: [string | null, string][] = [
    [null, "/company/login"], // logged out
    [owner.cookie, "/candidate"], // the candidate themselves: no "own" view (Ahmed's review on #37)
    [other.cookie, "/candidate"], // another candidate
    [disabledCompany.cookie, "/company/login?error=disabled"],
  ];
  for (const [cookie, to] of cases) {
    const { status, location, html } = await open(cookie, publicId);
    assert.equal(status, 307);
    assert.equal(location, to);
    assert.ok(!html.includes(PHONE) && !html.includes(example.basics.email), "no profile data in the answer");
  }
});

test("an unknown or hidden profile is not found for a company; the admin still sees a hidden one", async () => {
  assert.equal((await open(company.cookie, "AAAAAAAAAAAAAAAAAAAAAA")).view, "not_found");
  assert.equal((await open(company.cookie, "not-a-real-id")).view, "not_found");
  const hidden = await open(company.cookie, hiddenId);
  assert.equal(hidden.view, "not_found");
  assert.ok(!hidden.html.includes("+216 99 999 999"));
  assert.equal((await open(boss.cookie, hiddenId)).view, "full");
  // Logged out, an unknown link gets the same redirect as a real one: nobody learns which links exist.
  assert.equal((await open(null, "AAAAAAAAAAAAAAAAAAAAAA")).location, "/company/login");
});
