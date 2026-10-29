import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { updateDraft } from "../lib/profile/draft-store";
import { profileSchema } from "../lib/profile/schema.gen";

test("save scopes writes to the session owner, preserves the upload choice, and replaces arrays", async () => {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (url, init) => {
    const request = { url: new URL(String(url)), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push(request);
    return new Response(JSON.stringify(request.method === "PATCH" ? { updated_at: "new-version" } : { looking_for: "pfe" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } } });
  const result = await updateDraft(client, "session-owner", profileSchema.parse({ looking_for: "job", education: [] }), "old-version");
  assert.deepEqual(result, { ok: true, updatedAt: "new-version" });
  const write = requests.find((item) => item.method === "PATCH")!;
  assert.equal(write.url.searchParams.get("user_id"), "eq.session-owner");
  assert.equal(write.url.searchParams.get("updated_at"), "eq.old-version");
  assert.equal((write.body as { data: { looking_for: string } }).data.looking_for, "pfe");
  assert.deepEqual((write.body as { data: { education: unknown[] } }).data.education, []);
});

test("an outdated/deleted draft is reported as conflict rather than success", async () => {
  const client = createClient("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (_url, init) => new Response(JSON.stringify(init?.method === "PATCH" ? null : { looking_for: "pfe" }), { status: 200, headers: { "Content-Type": "application/json" } }) } });
  assert.deepEqual(await updateDraft(client, "session-owner", profileSchema.parse({}), "old"), { ok: false, reason: "conflict" });
});
