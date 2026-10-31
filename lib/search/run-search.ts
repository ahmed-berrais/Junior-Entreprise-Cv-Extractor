// S2-13 · One search: embed the query, ask search_profiles (S2-12), turn the rows into cards.
// If the embedding fails or takes too long, the same search runs with words only and the answer says
// degraded: true, so the page can show a discreet note. A recruiter always gets results.
//
// The database and Gemini are passed in, so the unit tests can replace both.
import type { SearchFilters, SearchRequest } from "./params";

export type SearchRow = {
  public_id: string;
  looking_for: string | null;
  data: ProfileData;
  approved_at: string | null;
  score: number;
  total_count: number;
};

type ProfileData = {
  basics?: { name?: string | null; headline?: string | null; city?: string | null };
  education?: { institution?: string; degree?: string | null }[];
  skills?: { name?: string }[];
  classification?: { domain?: string; seniority?: string };
};

export type SearchDeps = {
  embed: (text: string) => Promise<number[]>;
  search: (args: {
    query_text: string;
    query_embedding: string | null;
    filters: SearchFilters;
    page: number;
  }) => PromiseLike<{ data: SearchRow[] | null; error: { code?: string; message: string } | null }>;
};

export type SearchResponse = {
  results: ReturnType<typeof toCard>[];
  total: number;
  page: number;
  degraded: boolean;
};

const CARD_SKILLS = 8;

// What a result card shows. Contact details stay on the profile page.
export function toCard(row: SearchRow) {
  const d = row.data ?? {};
  const school = d.education?.[0];
  return {
    public_id: row.public_id,
    name: d.basics?.name ?? null,
    headline: d.basics?.headline ?? null,
    city: d.basics?.city ?? null,
    looking_for: row.looking_for,
    domain: d.classification?.domain ?? null,
    seniority: d.classification?.seniority ?? null,
    school: school?.institution ?? null,
    degree: school?.degree ?? null,
    skills: (d.skills ?? []).map((s) => s.name).filter(Boolean).slice(0, CARD_SKILLS) as string[],
  };
}

export class SearchFailed extends Error {
  constructor(readonly code: string | undefined) {
    super("search_profiles failed");
  }
}

export async function runSearch({ query, filters, page }: SearchRequest, deps: SearchDeps): Promise<SearchResponse> {
  let embedding: string | null = null;
  let degraded = false;
  if (query) {
    try {
      // pgvector reads a vector written as text: "[0.1,0.2,...]"
      embedding = `[${(await deps.embed(query)).join(",")}]`;
    } catch {
      degraded = true;
    }
  }

  const { data, error } = await deps.search({ query_text: query, query_embedding: embedding, filters, page });
  if (error) throw new SearchFailed(error.code);
  const rows = data ?? [];
  return { results: rows.map(toCard), total: Number(rows[0]?.total_count ?? 0), page, degraded };
}
