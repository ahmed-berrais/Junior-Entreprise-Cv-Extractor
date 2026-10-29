import assert from "node:assert/strict";
import test from "node:test";
import { profileSchema } from "../lib/profile/schema.gen";

test("defaults and unknown domain validation survive generation", () => {
  const draft = profileSchema.parse({});
  assert.deepEqual(draft.education, []);
  assert.equal(draft.basics.name, "");
  assert.equal(draft.looking_for, null);
  assert.equal(profileSchema.safeParse({ classification: { domain: "unknown-domain" } }).success, false);
  assert.equal(profileSchema.safeParse({ education: [{ end: "present" }] }).success, true);
  assert.equal(profileSchema.safeParse({ education: [{ start: "2025-13" }] }).success, false);
  assert.equal(profileSchema.safeParse({ classification: { years_experience: -1 } }).success, false);
  assert.equal(profileSchema.safeParse({ basics: { links: { github: "javascript:alert(1)" } } }).success, false);
  assert.equal(profileSchema.parse({ basics: { name: "  Test Candidate  " } }).basics.name, "Test Candidate");
});
