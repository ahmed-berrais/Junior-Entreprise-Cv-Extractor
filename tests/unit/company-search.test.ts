import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCompanies } from "@/lib/company-search";
test("company search matches name, email and sector without case or surrounding whitespace", () => {
  const rows = [{ user_id: "1", name: "Acme", email: "hr@acme.com", sector: "Finance", created_at: "2026-01-01", disabled: false }, { user_id: "2", name: "Other", email: "jobs@other.com", sector: null, created_at: "2026-01-01", disabled: true }];
  for (const query of [" acme ", "HR@", "finance"]) assert.deepEqual(filterCompanies(rows, query), [rows[0]]);
  assert.deepEqual(filterCompanies(rows, ""), rows);
  assert.deepEqual(filterCompanies(rows, "missing"), []);
});
