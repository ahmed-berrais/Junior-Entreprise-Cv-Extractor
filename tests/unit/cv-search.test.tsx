// S2-14 · The search bar and filters: the URL holds the search, typing searches 500 ms after the last
// key (or on Enter), filters go to the API as is, and the degraded note shows when the API says so.
// The router and fetch are faked; the API itself is tested in tests/unit/search.test.ts and tests/api/.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { activeFilterCount, EMPTY_SEARCH, isEmptySearch, readSearchState, writeSearchState } from "@/lib/search/url";
import en from "../../messages/en.json";

test("search state ↔ URL", async (suite) => {
  await suite.test("a URL round-trips, in a fixed order, without empty or repeated values", () => {
    const state = readSearchState(new URLSearchParams("skill=react&q=+computer+vision+&domain=data_ai&skill=React&skill=python&city=&skills_match=all&page=3"));
    assert.equal(state.q, "computer vision");
    assert.deepEqual(state.skill, ["react", "python"]);
    assert.deepEqual(state.city, []);
    assert.equal(state.skills_match, "all");
    assert.equal(writeSearchState(state).toString(), "q=computer+vision&domain=data_ai&skill=react&skill=python&skills_match=all");
  });

  await suite.test("skills_match=all only with two skills or more; anything else is any", () => {
    assert.equal(writeSearchState({ ...EMPTY_SEARCH, skill: ["python"], skills_match: "all" }).toString(), "skill=python");
    assert.equal(readSearchState(new URLSearchParams("skills_match=most")).skills_match, "any");
  });

  await suite.test("the search text is cut at the API's 200 characters", () => {
    assert.equal(readSearchState(new URLSearchParams({ q: "a".repeat(300) })).q.length, 200);
  });

  await suite.test("the filter count ignores the search text", () => {
    const state = readSearchState(new URLSearchParams("q=java&domain=data_ai&city=Sfax&city=Tunis"));
    assert.equal(activeFilterCount(state), 3);
    assert.equal(isEmptySearch(state), false);
    assert.equal(isEmptySearch(EMPTY_SEARCH), true);
  });
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/company/cvs" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
  ShadowRoot: dom.window.ShadowRoot, Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
  HTMLInputElement: dom.window.HTMLInputElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: (fn: FrameRequestCallback) => setTimeout(fn, 0),
  IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const card = (id: string, name: string) => ({
  public_id: id, name, headline: null, city: null, email: null, looking_for: null, domain: null,
  seniority: null, school: null, degree: null, skills: [],
});

test("search bar and filters", async (suite) => {
  const { render, screen, waitFor, cleanup, act, within } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { CvSearch } = await import("@/components/company/cv-search");

  let calls: string[] = [];
  let degraded = false;
  let understood: string | null = null; // S3-04: what POST /api/search/understand answers (null = fallback)
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url === "/api/search/understand") {
      calls.push(`sentence:${JSON.parse(init!.body as string).sentence}`);
      return new Response(JSON.stringify(understood ? { params: understood } : { fallback: true }));
    }
    const q = new URL(url, "http://localhost").searchParams.get("q");
    const results = q ? [card("a1", "Yasmine"), card("b2", "Karim")] : [card("c3", "Amira")];
    return new Response(JSON.stringify({ results, total: results.length, page: 1, degraded }));
  }) as typeof fetch;

  // A tiny router: push changes the URL the hooks read, back undoes it, like the real one.
  const pushes: string[] = [];
  function Harness({ start }: { start: string }) {
    const [history, setHistory] = useState([start]);
    const url = new URL(history[history.length - 1], "http://localhost");
    const router = {
      bfcacheId: "test", forward() {}, refresh() {}, replace() {}, prefetch: async () => {},
      push(next: string) { pushes.push(next); setHistory((h) => [...h, next]); },
      back() { setHistory((h) => h.slice(0, -1)); },
    };
    (globalThis as { testRouter?: typeof router }).testRouter = router;
    return (
      <NextIntlClientProvider locale="en" messages={en}>
        <AppRouterContext.Provider value={router}>
          <PathnameContext.Provider value={url.pathname}>
            <SearchParamsContext.Provider value={url.searchParams}>
              <CvSearch domains={["software_engineering", "data_ai"]} />
            </SearchParamsContext.Provider>
          </PathnameContext.Provider>
        </AppRouterContext.Provider>
      </NextIntlClientProvider>
    );
  }

  suite.afterEach(() => { cleanup(); calls = []; pushes.length = 0; degraded = false; understood = null; });

  await suite.test("a shared link opens with its search and filters already applied", async () => {
    render(<Harness start="/company/cvs?q=computer+vision&domain=data_ai" />);
    await screen.findByText("Yasmine");
    assert.equal((screen.getByRole("searchbox", { name: en.company.cvs.searchLabel }) as HTMLInputElement).value, "computer vision");
    assert.equal(calls[0], "/api/search?q=computer+vision&domain=data_ai&page=1");
    assert.ok(screen.getByText("2 profiles, best matches first"));
    assert.equal(screen.queryByText(en.company.cvs.degraded), null);
  });

  await suite.test("typing searches once, 500 ms after the last key, not on every key", async () => {
    render(<Harness start="/company/cvs" />);
    await screen.findByText("Amira");
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "pytorch");
    assert.deepEqual(pushes, [], "nothing searched while typing");
    await waitFor(() => assert.deepEqual(pushes, ["/company/cvs?q=pytorch"]), { timeout: 1500 });
    await screen.findByText("Yasmine");
    assert.equal(calls.filter((c) => c.includes("q=")).length, 1, "one API call with text");
  });

  await suite.test("Enter searches at once", async () => {
    render(<Harness start="/company/cvs" />);
    await screen.findByText("Amira");
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "react{Enter}");
    assert.deepEqual(pushes, ["/company/cvs?q=react"]);
  });

  await suite.test("filters go to the URL and the API; Clear all empties both; Back undoes", async () => {
    render(<Harness start="/company/cvs" />);
    await screen.findByText("Amira");
    const user = userEvent.setup();
    const sidebar = screen.getByRole("complementary", { name: en.company.cvs.filters });
    await user.click(within(sidebar).getByText(en.upload.choices.pfe));
    assert.equal(pushes.at(-1), "/company/cvs?looking_for=pfe");
    const skills = screen.getAllByLabelText(en.company.cvs.skillsFilter)[0];
    await user.type(skills, "python{Enter}");
    assert.equal(pushes.at(-1), "/company/cvs?looking_for=pfe&skill=python");
    await waitFor(() => assert.ok(calls.includes("/api/search?looking_for=pfe&skill=python&page=1")));

    await user.click(screen.getByRole("button", { name: en.company.cvs.clearAll }));
    assert.equal(pushes.at(-1), "/company/cvs");

    act(() => (globalThis as unknown as { testRouter: { back(): void } }).testRouter.back());
    await waitFor(() => assert.equal(calls.at(-1), "/api/search?looking_for=pfe&skill=python&page=1"));
  });

  await suite.test("the degraded note shows when the API searched by words only", async () => {
    degraded = true;
    render(<Harness start="/company/cvs?q=pytorch" />);
    await screen.findByText("Yasmine");
    assert.ok(screen.getByText(en.company.cvs.degraded));
  });

  // ── S3-04 smart search ─────────────────────────────────────────────────
  const SENTENCE = "React developers in Sousse looking for a PFE";

  await suite.test("smart search: Enter sends the sentence once, and what it understood becomes the search and chips", async () => {
    understood = "q=developers&skill=React&city=Sousse&looking_for=pfe";
    render(<Harness start="/company/cvs" />);
    await screen.findByText("Amira");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en.company.cvs.smart }));
    await user.type(screen.getByRole("searchbox"), SENTENCE);
    await new Promise((r) => setTimeout(r, 700));
    assert.deepEqual(pushes, [], "no search while typing: each one is an AI call");
    await user.keyboard("{Enter}");
    await waitFor(() => assert.deepEqual(pushes, ["/company/cvs?q=developers&looking_for=pfe&skill=React&city=Sousse"]));
    assert.deepEqual(calls.filter((c) => c.startsWith("sentence:")), [`sentence:${SENTENCE}`]);

    const chips = screen.getByRole("list", { name: en.company.cvs.activeFilters });
    assert.deepEqual(within(chips).getAllByRole("button").map((b) => b.textContent), [en.upload.choices.pfe, "React", "Sousse"]);
    await user.click(within(chips).getByRole("button", { name: "Remove Sousse" }));
    assert.equal(pushes.at(-1), "/company/cvs?q=developers&looking_for=pfe&skill=React");
  });

  await suite.test("smart search: when it can't understand, the sentence is searched as typed", async () => {
    render(<Harness start="/company/cvs" />);
    await screen.findByText("Amira");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: en.company.cvs.smart }));
    await user.type(screen.getByRole("searchbox"), `${SENTENCE}{Enter}`);
    await waitFor(() => assert.deepEqual(pushes, [`/company/cvs?${new URLSearchParams({ q: SENTENCE })}`]));
  });
});
