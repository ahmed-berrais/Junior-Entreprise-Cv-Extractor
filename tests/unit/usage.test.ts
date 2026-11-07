// S3-10 · The admin overview turns orange from 70% of a free limit and red from 90%.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_LIMITS, usageLevel } from "../../lib/usage-limits";

test("orange from 70% of the limit, red from 90%", () => {
  assert.equal(usageLevel(349, 500), "ok");
  assert.equal(usageLevel(350, 500), "warning");
  assert.equal(usageLevel(449, 500), "warning");
  assert.equal(usageLevel(450, 500), "danger");
  assert.equal(usageLevel(600, 500), "danger");
});

test("a kind without a known limit is never coloured", () => {
  assert.equal(usageLevel(10_000, undefined), "ok");
});

test("the limits match docs/AI_LIMITS.md", () => {
  assert.deepEqual(DAILY_LIMITS, {
    "gemini-3.5-flash-lite": 500,
    "gemini-3.5-flash": 20,
    "gemini-embedding-001": 1000,
    "email:company": 500,
  });
});
