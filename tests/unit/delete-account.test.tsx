import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

test("delete confirmation follows the S2-16 contract", async suite => {
  const { render, screen, cleanup } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { DeleteAccount } = await import("@/components/profile/delete-account");
  const originalFetch = globalThis.fetch;
  const redirects: string[] = [];
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace(path: string) { redirects.push(path); }, prefetch: async () => {} };
  suite.afterEach(() => { cleanup(); globalThis.fetch = originalFetch; redirects.length = 0; });

  await suite.test("requires exactly DELETE and posts only that confirmation before navigating", async () => {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = async (url, options) => { calls.push({ url: String(url), body: JSON.parse(String(options?.body)) }); return Response.json({ redirect: "/" }); };
    render(<NextIntlClientProvider timeZone="UTC" locale="en" messages={en}><AppRouterContext.Provider value={router}><DeleteAccount /></AppRouterContext.Provider></NextIntlClientProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en.myProfile.delete }));
    const input = screen.getByLabelText(en.myProfile.deleteConfirm);
    const submit = screen.getByRole("button", { name: en.myProfile.deleteSubmit }) as HTMLButtonElement;
    for (const value of ["delete", "DELETE ", "DELET"]) { await user.clear(input); await user.type(input, value); assert.equal(submit.disabled, true); }
    assert.equal(calls.length, 0);
    await user.clear(input); await user.type(input, "DELETE"); await user.click(submit);
    assert.deepEqual(calls, [{ url: "/api/candidate/delete", body: { confirm: "DELETE" } }]);
    assert.deepEqual(redirects, ["/"]);
  });
  await suite.test("server refusal leaves the account page open with a translated error", async () => {
    globalThis.fetch = async () => Response.json({ error: "failed" }, { status: 500 });
    render(<NextIntlClientProvider timeZone="UTC" locale="fr" messages={fr}><AppRouterContext.Provider value={router}><DeleteAccount /></AppRouterContext.Provider></NextIntlClientProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: fr.myProfile.delete }));
    await user.type(screen.getByLabelText(fr.myProfile.deleteConfirm), "DELETE");
    await user.click(screen.getByRole("button", { name: fr.myProfile.deleteSubmit }));
    assert.equal((await screen.findByRole("alert")).textContent, fr.myProfile.deleteFailed);
    assert.deepEqual(redirects, []);
  });
});
