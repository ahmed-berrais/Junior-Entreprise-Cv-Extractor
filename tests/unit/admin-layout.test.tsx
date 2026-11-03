import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/admin" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  self: dom.window,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLAnchorElement: dom.window.HTMLAnchorElement,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
  requestIdleCallback: (fn: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) =>
    setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 0),
  cancelIdleCallback: (id: number) => clearTimeout(id),
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

test("admin layout navigation (S2-03)", async (suite) => {
  const { render, screen, cleanup } = await import("@testing-library/react");
  const { AdminLayoutShell } = await import("@/components/admin/admin-layout-shell");

  const router = {
    bfcacheId: "test",
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch: async () => {},
  };

  suite.afterEach(() => {
    cleanup();
  });

  await suite.test("renders 3 navigation links in English with min-h-[44px] touch targets", async () => {
    render(
      <NextIntlClientProvider timeZone="UTC" locale="en" messages={en}>
        <AppRouterContext.Provider value={router}>
          <AdminLayoutShell>
            <div data-testid="admin-child">Dashboard Content</div>
          </AdminLayoutShell>
        </AppRouterContext.Provider>
      </NextIntlClientProvider>
    );

    // Child rendered
    assert.ok(screen.getByTestId("admin-child"));

    // 3 navigation links exist with correct hrefs
    const overviewLinks = screen.getAllByRole("link", { name: new RegExp(en.admin.nav.overview, "i") });
    assert.ok(overviewLinks.some((link) => link.getAttribute("href") === "/admin"));

    const companiesLinks = screen.getAllByRole("link", { name: new RegExp(en.admin.nav.companies, "i") });
    assert.ok(companiesLinks.some((link) => link.getAttribute("href") === "/admin/companies"));

    const candidatesLinks = screen.getAllByRole("link", { name: new RegExp(en.admin.nav.candidates, "i") });
    assert.ok(candidatesLinks.some((link) => link.getAttribute("href") === "/admin/candidates"));

    // Check touch target classes on links (min-h-[44px])
    for (const link of [...overviewLinks, ...companiesLinks, ...candidatesLinks]) {
      assert.ok(link.className.includes("min-h-[44px]"), "link touch target must be at least 44px");
    }
  });

  await suite.test("renders navigation in French without issues", async () => {
    render(
      <NextIntlClientProvider timeZone="UTC" locale="fr" messages={fr}>
        <AppRouterContext.Provider value={router}>
          <AdminLayoutShell>
            <div>Contenu admin</div>
          </AdminLayoutShell>
        </AppRouterContext.Provider>
      </NextIntlClientProvider>
    );

    assert.ok(screen.getAllByRole("link", { name: new RegExp(fr.admin.nav.overview, "i") }).length >= 1);
    assert.ok(screen.getAllByRole("link", { name: new RegExp(fr.admin.nav.companies, "i") }).length >= 1);
    assert.ok(screen.getAllByRole("link", { name: new RegExp(fr.admin.nav.candidates, "i") }).length >= 1);
  });
});
