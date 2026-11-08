"use client";
// S2-14 · The search bar and filter panel above the S2-10 grid. The URL holds the whole search
// (lib/search/url.ts, read with Next.js useSearchParams), so refreshing, sharing the link or pressing
// Back keeps it: there is no other copy of the search state.
//
// The bar searches on Enter, or 500 ms after typing stops: each search with text costs one Gemini
// embedding call (docs/AI_LIMITS.md), so not one per keystroke. Filters apply as soon as they change.
// Filters are a sidebar on laptops and a slide-in panel on phones.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon, SlidersHorizontalIcon, SparklesIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activeFilterCount, EMPTY_SEARCH, isEmptySearch, MAX_QUERY, readSearchState, writeSearchState, type SearchState,
} from "@/lib/search/url";
import { CvGrid } from "./cv-grid";
import { FilterChips } from "./filter-chips";
import { FilterPanel } from "./filter-panel";

export const SEARCH_DELAY_MS = 500;

export function CvSearch({ domains }: { domains: readonly string[] }) {
  const t = useTranslations("company.cvs");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = readSearchState(new URLSearchParams(params.toString()));
  const query = writeSearchState(state).toString();

  // What's typed in the bar, ahead of the URL until the search runs.
  const [text, setText] = useState(state.q);
  // When the URL's search text changes from outside (Back button, "Clear all"), the bar follows it.
  const [urlQ, setUrlQ] = useState(state.q);
  if (urlQ !== state.q) {
    setUrlQ(state.q);
    setText(state.q);
  }

  const go = (next: SearchState) => {
    const qs = writeSearchState(next).toString();
    if (qs === query) return;
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // S3-04 · Smart search: the sentence goes to Gemini on Enter only (one AI call each), and what it
  // understood replaces the search. On any failure, the sentence is searched as typed.
  const [smart, setSmart] = useState(false);
  const [understanding, setUnderstanding] = useState(false);
  async function smartSearch() {
    setUnderstanding(true);
    try {
      const response = await fetch("/api/search/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: text }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = response.ok ? await response.json() : null;
      go(typeof body?.params === "string" ? readSearchState(new URLSearchParams(body.params)) : { ...state, q: text });
    } catch {
      go({ ...state, q: text });
    } finally {
      setUnderstanding(false);
    }
  }

  // Search 500 ms after the last key (not in smart mode: that would be one AI call per pause).
  useEffect(() => {
    if (smart || text.trim() === state.q) return;
    const timer = setTimeout(() => go({ ...state, q: text }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` and `state` are rebuilt every render from the URL
  }, [text, query, smart]);

  const filters = activeFilterCount(state);
  const clearAll = () => {
    setText("");
    go(EMPTY_SEARCH);
  };
  // Filter changes keep what's typed in the bar, even if it wasn't searched yet.
  const setFilters = (next: SearchState) => go({ ...next, q: text });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:sticky lg:top-4 lg:flex" aria-label={t("filters")}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold">{t("filters")}</h2>
          {filters > 0 && <Button variant="ghost" size="sm" onClick={() => go({ ...EMPTY_SEARCH, q: text })}>{t("clearFilters")}</Button>}
        </div>
        <FilterPanel state={state} domains={domains} onChange={setFilters} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (smart && text.trim()) void smartSearch();
            else go({ ...state, q: text });
          }}
        >
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={text}
              maxLength={MAX_QUERY}
              onChange={(e) => setText(e.target.value)}
              placeholder={smart ? t("smartPlaceholder") : t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              disabled={understanding}
              className="h-10 pl-9"
            />
          </div>

          <Button
            type="button"
            variant={smart ? "default" : "outline"}
            aria-pressed={smart}
            onClick={() => setSmart(!smart)}
            className="h-10"
          >
            <SparklesIcon aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("smart")}</span>
          </Button>

          <DialogPrimitive.Root>
            <DialogPrimitive.Trigger render={<Button type="button" variant="outline" className="h-10 lg:hidden" />}>
              <SlidersHorizontalIcon aria-hidden="true" />
              {filters > 0 ? t("filtersCount", { count: filters }) : t("filters")}
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
              <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 flex w-[min(22rem,90vw)] flex-col bg-background shadow-xl transition-transform duration-200 outline-none data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <DialogPrimitive.Title className="font-heading font-semibold">{t("filters")}</DialogPrimitive.Title>
                  <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" aria-label={t("closeFilters")} />}>
                    <XIcon aria-hidden="true" />
                  </DialogPrimitive.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <FilterPanel state={state} domains={domains} onChange={setFilters} />
                </div>
                <div className="flex gap-2 border-t px-4 py-3">
                  <Button variant="outline" className="flex-1" disabled={filters === 0} onClick={() => go({ ...EMPTY_SEARCH, q: text })}>
                    {t("clearFilters")}
                  </Button>
                  <DialogPrimitive.Close render={<Button className="flex-1" />}>{t("showResults")}</DialogPrimitive.Close>
                </div>
              </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </form>

        {understanding && <p role="status" className="text-sm text-muted-foreground">{t("understanding")}</p>}
        <FilterChips
          state={state}
          onRemove={(key, value) => go({ ...state, q: text, [key]: state[key].filter((v) => v !== value) })}
        />

        <CvGrid key={query} query={query} searching={!isEmptySearch(state)} ranked={state.q !== ""} onClearAll={clearAll} />
      </div>
    </div>
  );
}
