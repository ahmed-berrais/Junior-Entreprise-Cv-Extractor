import { test } from "node:test";
import assert from "node:assert/strict";
import { asRole, homeFor, loginFor, pageRedirect, requiredRole, type Role } from "@/lib/access";
import { accessCode, CODE_ALPHABET, CompanyInput } from "@/lib/company";

test("each of the three roles and logged-out users are gated across all spaces", () => {
  for (const area of ["candidate", "company", "admin"] as Role[]) {
    for (const visitor of [null, "candidate", "company", "admin"] as const) {
      assert.equal(pageRedirect(`/${area}/private`, visitor), visitor === area ? null : visitor ? homeFor[visitor] : loginFor[area]);
    }
  }
  assert.equal(asRole("superadmin"), null);
});
test("auth routes remain public, protected API and QR paths retain their roles", () => {
  for (const path of Object.values(loginFor)) assert.equal(requiredRole(path), null);
  for (const path of ["/api/cv/upload", "/api/profile/approve", "/api/profile/visibility"]) assert.equal(requiredRole(path), "candidate");
  assert.equal(requiredRole("/api/admin/companies/test/disable"), "admin");
  assert.equal(requiredRole("/p/random.png"), "company");
  assert.equal(requiredRole("/administrator"), null);
});
test("access codes have ten unambiguous cryptographically chosen characters", () => {
  const codes = Array.from({ length: 500 }, accessCode);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) { assert.equal(code.length, 10); assert.ok([...code].every(c => CODE_ALPHABET.includes(c))); assert.doesNotMatch(code, /[01OIl]/); }
});
test("company input rejects extra privileges and invalid contact fields", () => {
  assert.equal(CompanyInput.safeParse({ name: "Club", email: "wrong", sector: "IT" }).success, false);
  assert.equal(CompanyInput.safeParse({ name: "Club", email: "club@example.com", sector: "IT", role: "admin" }).success, false);
  assert.equal(CompanyInput.safeParse({ name: "Club", email: "club@example.com", sector: "IT" }).success, true);
});
