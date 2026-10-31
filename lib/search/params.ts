// S2-13 · The search page's URL → what search_profiles (S2-12) needs. Every value is checked here,
// before anything reaches the database or Gemini.
//
//   /api/search?q=computer+vision&domain=data_ai&skill=python&skill=pytorch&skills_match=all
//              &looking_for=pfe&city=Tunis&school=ENIT&language=English&page=2
//
// Every list parameter can be repeated (skill=python&skill=react). All are optional.
import { ProfileSchema } from "@/lib/profile/schema.gen";

const DOMAINS: readonly string[] = ProfileSchema.shape.classification.shape.domain.options;
const LOOKING_FOR: readonly string[] = ["pfe", "internship", "job"];

const MAX_QUERY = 200; // longer is not a search, and it costs more embedding tokens
const MAX_VALUE = 100;
const MAX_VALUES = 20;
const MAX_PAGE = 100;

// The filters object of search_profiles (docs/DATABASE.md, "Search").
export type SearchFilters = {
  looking_for?: string[];
  domains?: string[];
  skills?: string[];
  skills_match?: "any" | "all";
  cities?: string[];
  schools?: string[];
  languages?: string[];
};

export type SearchRequest = { query: string; filters: SearchFilters; page: number };
export type ParsedSearch = { ok: true; value: SearchRequest } | { ok: false; field: string };

// URL parameter → filters key, and the values it accepts (null = any text).
const LISTS: [param: string, key: keyof SearchFilters, allowed: readonly string[] | null][] = [
  ["looking_for", "looking_for", LOOKING_FOR],
  ["domain", "domains", DOMAINS],
  ["skill", "skills", null],
  ["city", "cities", null],
  ["school", "schools", null],
  ["language", "languages", null],
];

export function parseSearchParams(params: URLSearchParams): ParsedSearch {
  const query = (params.get("q") ?? "").trim();
  if (query.length > MAX_QUERY) return { ok: false, field: "q" };

  const filters: SearchFilters = {};
  for (const [param, key, allowed] of LISTS) {
    const values = [...new Set(params.getAll(param).map((v) => v.trim()).filter(Boolean))];
    if (values.length > MAX_VALUES || values.some((v) => v.length > MAX_VALUE)) return { ok: false, field: param };
    if (allowed && values.some((v) => !allowed.includes(v))) return { ok: false, field: param };
    if (values.length) (filters[key] as string[]) = values;
  }

  const match = params.get("skills_match");
  if (match !== null) {
    if (match !== "any" && match !== "all") return { ok: false, field: "skills_match" };
    filters.skills_match = match;
  }

  const pageText = params.get("page") ?? "1";
  const page = Number(pageText);
  if (!/^\d+$/.test(pageText) || page < 1 || page > MAX_PAGE) return { ok: false, field: "page" };

  return { ok: true, value: { query, filters, page } };
}
