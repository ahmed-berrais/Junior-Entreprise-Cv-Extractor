// S2-14 · The search page keeps its search and filters in the URL (?q=react&domain=data_ai&skill=python),
// so refreshing, the Back button and sharing the link all keep them. These helpers turn the page's URL
// into the search state and back. The parameter names are the ones GET /api/search reads
// (lib/search/params.ts), so the same query string goes to the API as is.
//
// No schema import here: this file runs in the browser, and the domain list comes from the page.

export const LIST_PARAMS = ["looking_for", "domain", "skill", "city", "school", "language"] as const;
export type ListParam = (typeof LIST_PARAMS)[number];

export type SearchState = { q: string; skills_match: "any" | "all" } & Record<ListParam, string[]>;

export const EMPTY_SEARCH: SearchState = {
  q: "",
  skills_match: "any",
  looking_for: [],
  domain: [],
  skill: [],
  city: [],
  school: [],
  language: [],
};

export const MAX_QUERY = 200; // the API refuses longer (400)

const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim())
    .filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
};

export function readSearchState(params: URLSearchParams): SearchState {
  const state: SearchState = { ...EMPTY_SEARCH, q: (params.get("q") ?? "").trim().slice(0, MAX_QUERY) };
  for (const key of LIST_PARAMS) state[key] = unique(params.getAll(key));
  state.skills_match = params.get("skills_match") === "all" ? "all" : "any";
  return state;
}

// Only what is set, in a fixed order, so the same search always gives the same URL.
export function writeSearchState(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  for (const key of LIST_PARAMS) for (const value of unique(state[key])) params.append(key, value);
  if (state.skills_match === "all" && state.skill.length > 1) params.set("skills_match", "all");
  return params;
}

// How many filters are on, for the "Filters (2)" button. The search text is not a filter.
export function activeFilterCount(state: SearchState): number {
  return LIST_PARAMS.reduce((n, key) => n + state[key].length, 0);
}

export function isEmptySearch(state: SearchState): boolean {
  return !state.q.trim() && activeFilterCount(state) === 0;
}
