// S2-11 · /p/<public_id> against the running app and the local Supabase: the four cases, and that
// nobody who may not see a profile gets any of its data in the page. Each case marks what it rendered
// with data-view (every text of the language travels in every page, so texts can't tell them apart).
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
  const html = await (await fetch(`${APP_URL}/p/${id}`, { headers: cookie ? { cookie } : {} })).text();
  // As HTML (data-view="full"), or inside the streamed page data (\"data-view\":\"not_found\"):
  // a notFound() inside <Suspense> arrives that way.
  return { view: html.match(/data-view(?:="|\\":\\")([a-z_]+)/)?.[1] ?? null, html };
}

test("a company and the admin see the full profile", async () => {
  for (const user of [company, boss]) {
    const { view, html } = await open(user.cookie, publicId);
    assert.equal(view, "full");
    assert.ok(html.includes(PHONE), "contact details are shown");
  }
});

test("the candidate sees their own profile, with Edit", async () => {
  const { view, html } = await open(owner.cookie, publicId);
  assert.equal(view, "own");
  assert.ok(html.includes(PHONE));
});

test("anyone else gets the message and none of the profile's data", async () => {
  for (const cookie of [null, other.cookie]) {
    const { view, html } = await open(cookie, publicId);
    assert.equal(view, "gate");
    assert.ok(!html.includes(PHONE) && !html.includes(example.basics.email), "no profile data in the page");
  }
  const off = await open(disabledCompany.cookie, publicId);
  assert.equal(off.view, "disabled");
  assert.ok(!off.html.includes(PHONE), "a disabled company gets no profile data either");
});

test("an unknown or hidden profile is not found for a company; the admin still sees a hidden one", async () => {
  assert.equal((await open(company.cookie, "AAAAAAAAAAAAAAAAAAAAAA")).view, "not_found");
  assert.equal((await open(company.cookie, "not-a-real-id")).view, "not_found");
  const hidden = await open(company.cookie, hiddenId);
  assert.equal(hidden.view, "not_found");
  assert.ok(!hidden.html.includes("+216 99 999 999"));
  assert.equal((await open(boss.cookie, hiddenId)).view, "full");
  // Logged out, an unknown link looks exactly like a real one: nobody learns which links exist.
  assert.equal((await open(null, "AAAAAAAAAAAAAAAAAAAAAA")).view, "gate");
});
