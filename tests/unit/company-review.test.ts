import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAccessCode } from "@/lib/company-login";
test("pasted company codes lose surrounding whitespace but preserve case and internal characters", () => {
  assert.equal(normalizeAccessCode(" \nAbC234xyz9\t "), "AbC234xyz9");
  assert.equal(normalizeAccessCode("Ab C"), "Ab C");
  assert.equal(normalizeAccessCode(null), "");
});
