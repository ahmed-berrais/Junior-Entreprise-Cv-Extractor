"use client";
// S2-10 · The CV grid on /company/cvs: every approved, non-hidden profile as a card, newest first.
// It reads the search API without a search term (GET /api/search?page=N, S2-13): no Gemini call,
// and drafts and hidden profiles never come back (search_profiles decides, with the company's own
// rights). 20 cards per page; the next page loads when the end of the grid scrolls into view, with
// a "Show more" button as a fallback.
//
// S2-14: the search bar and filters (cv-search.tsx) pass their query string, which goes to the API as is.
// A new search remounts the grid (key={query}), so old pages never mix with new ones. With search text,
// the API ranks every profile by meaning, best first: the count says "profiles, best matches first",
// never "N matches". When Gemini didn't answer (degraded: true), a note says only words were searched.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchResponse } from "@/lib/search/run-search";
import { ProfileCard, type ProfileCardData } from "./profile-card";

type State = {
  cards: ProfileCardData[];
  total: number | null; // null until the first page answered
  page: number; // the last page loaded
  loading: boolean;
  failed: boolean;
  degraded: boolean;
};

export function CvGrid({ query = "", searching = false, ranked = false, onClearAll }: {
  query?: string; // the search page's query string, without page
  searching?: boolean; // a search text or a filter is on
  ranked?: boolean; // there is search text, so results come best first
  onClearAll?: () => void;
}) {
  const t = useTranslations("company.cvs");
  const [state, setState] = useState<State>({ cards: [], total: null, page: 0, loading: true, failed: false, degraded: false });
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (page: number) => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, loading: true, failed: false }));
    try {
      const res = await fetch(`/api/search?${query ? `${query}&` : ""}page=${page}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SearchResponse;
      setState((s) => {
        // Skip cards already shown, in case a profile was approved between two pages.
        const seen = new Set(s.cards.map((c) => c.public_id));
        return {
          cards: [...s.cards, ...body.results.filter((c) => !seen.has(c.public_id))],
          total: page === 1 || s.total === null ? body.total : s.total,
          page,
          loading: false,
          failed: false,
          degraded: page === 1 ? body.degraded : s.degraded || body.degraded,
        };
      });
    } catch {
      setState((s) => ({ ...s, loading: false, failed: true }));
    } finally {
      busy.current = false;
    }
  }, [query]);

  useEffect(() => {
    // The first page loads once the grid is on screen (fetch is a side effect, so it lives here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(1);
  }, [loadPage]);

  const hasMore = state.total !== null && state.cards.length < state.total;

  // Load the next page when the end of the grid comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || state.failed) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadPage(state.page + 1);
    }, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, state.failed, state.page, loadPage]);

  // First load: placeholders shaped like cards.
  if (state.total === null && !state.failed) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">{t("loading")}</span>
        <Grid>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex h-52 flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="flex gap-1.5">
                <div className="h-5 w-24 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
                <div className="h-5 w-12 animate-pulse rounded-full bg-secondary motion-reduce:animate-none" />
              </div>
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="mt-auto flex gap-1.5">
                {[16, 12, 20].map((w) => (
                  <div key={w} className="h-5 animate-pulse rounded-md bg-muted motion-reduce:animate-none" style={{ width: `${w * 4}px` }} />
                ))}
              </div>
            </div>
          ))}
        </Grid>
      </div>
    );
  }

  if (state.total === null && state.failed) {
    return <Failed onRetry={() => loadPage(1)} />;
  }

  if (state.total === 0 && searching) {
    return (
      <div className="flex flex-col gap-4">
        {state.degraded && <DegradedNote />}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <p className="font-heading text-lg font-semibold">{t("noMatch")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("noMatchHint")}</p>
          {onClearAll && <Button variant="outline" className="mt-2" onClick={onClearAll}>{t("clearAll")}</Button>}
        </div>
      </div>
    );
  }

  if (state.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
        <p className="font-heading text-lg font-semibold">{t("empty")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {t(ranked ? "countRanked" : "count", { count: state.total ?? 0 })}
        </p>
        {searching && onClearAll && <Button variant="ghost" size="sm" onClick={onClearAll}>{t("clearAll")}</Button>}
      </div>
      {state.degraded && <DegradedNote />}
      <Grid>
        {state.cards.map((card) => (
          <li key={card.public_id}><ProfileCard profile={card} /></li>
        ))}
      </Grid>
      <div ref={sentinel} className="flex justify-center py-2">
        {state.failed ? (
          <Failed onRetry={() => loadPage(state.page + 1)} />
        ) : state.loading ? (
          <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : hasMore ? (
          <Button variant="outline" onClick={() => loadPage(state.page + 1)}>{t("loadMore")}</Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("end")}</p>
        )}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>;
}

// Discreet: the results are still good, just found by words only.
function DegradedNote() {
  const t = useTranslations("company.cvs");
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t("degraded")}
    </p>
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("company.cvs");
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p>{t("error")}</p>
      <Button variant="outline" onClick={onRetry}>{t("retry")}</Button>
    </div>
  );
}
