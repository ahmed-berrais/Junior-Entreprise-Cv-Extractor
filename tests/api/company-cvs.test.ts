// S2-10 · What the CV grid on /company/cvs loads: GET /api/search with no search term (S2-13), page by
// page. Only approved, non-hidden profiles come back, newest first; never a draft or a hidden one.
// Against the running app and the local Supabase, with a draft and a hidden profile next to it.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import example from "../fixtures/example-profile.json";
import { admin, APP_URL, createUser, deleteTestUsers } from "./helpers";

type User = Awaited<ReturnType<typeof createUser>>;
let company: User;
const ids: Record<"approved" | "draft" | "hidden", string> = { approved: "", draft: "", hidden: "" };

before(async () => {
  company = await createUser("company");
  assert.ifError((await admin.from("companies").insert({ user_id: company.id, name: "Grid Test Co", disabled: false })).error);
  for (const kind of ["draft", "hidden", "approved"] as const) {
    const user = await createUser("candidate");
    const { data, error } = await admin.from("profiles").insert({
      user_id: user.id, looking_for: "pfe", data: example,
      status: kind === "draft" ? "draft" : "approved",
      hidden: kind === "hidden",
      approved_at: kind === "draft" ? null : new Date().toISOString(),
    }).select("public_id").single();
    assert.ifError(error);
    ids[kind] = data!.public_id;
  }
});
after(deleteTestUsers);

// Every card the grid would show, following the pages like the grid does.
async function allCards(cookie: string) {
  const cards: { public_id: string; email: string | null }[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${APP_URL}/api/search?page=${page}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    cards.push(...body.results);
    if (body.results.length === 0 || cards.length >= body.total) return { cards, total: body.total as number };
  }
  return { cards, total: cards.length };
}

test("the grid gets the approved profile, never the draft or the hidden one", async () => {
  const { cards, total } = await allCards(company.cookie);
  const shown = cards.map((c) => c.public_id);
  assert.ok(shown.includes(ids.approved), "the approved profile is in the grid");
  assert.ok(!shown.includes(ids.draft), "a draft never appears");
  assert.ok(!shown.includes(ids.hidden), "a hidden profile never appears");
  assert.equal(cards.length, total, "every page together gives exactly the total");
  assert.equal(new Set(shown).size, shown.length, "no card twice across pages");
});

test("newest approval first, and the card carries the email", async () => {
  const res = await fetch(`${APP_URL}/api/search?page=1`, { headers: { cookie: company.cookie } });
  const first = (await res.json()).results[0];
  assert.equal(first.public_id, ids.approved, "the profile approved last comes first");
  assert.equal(first.email, example.basics.email);
});
