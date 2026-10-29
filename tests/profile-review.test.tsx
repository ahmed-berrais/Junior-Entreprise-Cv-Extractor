import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { profileSchema } from "../lib/profile/schema.gen";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0) });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
test("profile review", async (suite) => {
const { render, screen, waitFor, cleanup } = await import("@testing-library/react");
const userEvent = (await import("@testing-library/user-event")).default;
const { ProfileReviewForm } = await import("../components/profile/profile-review-form");
const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };

await suite.test("editing, removing and saving retains the remaining entry", async () => {
  const initial = profileSchema.parse({ basics: { name: "Candidate", email: "candidate@example.com" }, education: [{ school: "First", degree: "BSc" }, { school: "Second", degree: "MSc" }] });
  let saved: unknown;
  render(<AppRouterContext.Provider value={router}><ProfileReviewForm initialValues={initial} updatedAt="2026-10-29T08:00:00Z" saveDraftAction={async (values) => { saved = values; return { ok: true, updatedAt: "2026-10-29T08:01:00Z" }; }} /></AppRouterContext.Provider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Remove Education 1" }));
  const school = screen.getByLabelText("School (required)");
  await user.clear(school); await user.type(school, "Updated school");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved.");
  assert.equal((saved as typeof initial).education.length, 1);
  assert.equal((saved as typeof initial).education[0].school, "Updated school");
  cleanup();
});

await suite.test("approval blocks missing fields and opens invalid items", async () => {
  let calls = 0;
  render(<AppRouterContext.Provider value={router}><ProfileReviewForm initialValues={profileSchema.parse({})} updatedAt="version" saveDraftAction={async () => { calls++; return { ok: true, updatedAt: "new" }; }} /></AppRouterContext.Provider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add Education" }));
  await user.click(screen.getByRole("button", { name: "Approve" }));
  await screen.findByText("Check the highlighted fields before continuing.");
  assert.equal(calls, 0);
  await waitFor(() => assert.equal(screen.getByLabelText("School (required)").getAttribute("aria-invalid"), "true"));
  assert.equal(screen.getByLabelText("School (required)").closest("details")?.open, true);
  cleanup();
});

await suite.test("save failures retain edits and allow retry", async () => {
  render(<AppRouterContext.Provider value={router}><ProfileReviewForm initialValues={profileSchema.parse({})} updatedAt="version" saveDraftAction={async () => ({ ok: false, reason: "conflict" })} /></AppRouterContext.Provider>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Full name"), "Unsaved name");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(/Your draft changed elsewhere/);
  assert.equal((screen.getByLabelText("Full name") as HTMLInputElement).value, "Unsaved name");
  assert.equal(screen.getByRole("button", { name: "Save draft" }).hasAttribute("disabled"), false);
  cleanup();
});
});
