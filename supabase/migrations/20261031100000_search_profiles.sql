-- S2-12: hybrid search. Recruiters search with exact words ("PyTorch", "ENIT", a name) and with
-- meaning ("someone who did computer vision"). This function runs both searches and merges them.
--
--   1. Word search: search_tsv (every word of the profile) against the query text.
--   2. Meaning search: the profile embedding against the query embedding (cosine distance).
--   3. The two rankings are merged with reciprocal rank fusion (RRF):
--        score = 1 / (60 + rank in word results) + 1 / (60 + rank in meaning results)
--      A profile found by only one search gets only that part. 60 is the usual RRF constant:
--      it stops the first place of one list from outweighing everything else.
--
-- Without a query embedding (the AI is down or busy, S2-13), it runs the word search and the
-- filters only. Without any query, it lists the filtered profiles, most recently approved first.
-- Drafts and hidden profiles never appear, whoever calls it.
--
-- It runs with the caller's rights (security invoker), so the access rules still apply: a disabled
-- company gets nothing, a candidate at most their own profile. Rules in plain words: docs/DATABASE.md.
-- Tests: supabase/tests/07_search_profiles.test.sql.

-- Every skill name the profile shows, lower case: its skills list plus the technologies of its
-- experience and projects. "React" in a project counts as knowing React.
create function public.profile_skills(p_data jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(name)), '{}')
  from (
    select s ->> 'name' as name from jsonb_array_elements(coalesce(p_data -> 'skills', '[]')) s
    union all
    select t from jsonb_array_elements(coalesce(p_data -> 'experience', '[]')) e,
                  jsonb_array_elements_text(coalesce(e -> 'technologies', '[]')) t
    union all
    select t from jsonb_array_elements(coalesce(p_data -> 'projects', '[]')) p,
                  jsonb_array_elements_text(coalesce(p -> 'technologies', '[]')) t
  ) names
  where name is not null
$$;

-- The spoken languages of a profile, lower case.
create function public.profile_languages(p_data jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(l ->> 'name')), '{}')
  from jsonb_array_elements(coalesce(p_data -> 'languages', '[]')) l
  where l ->> 'name' is not null
$$;

-- A filter list from the filters object, trimmed and lower case. Missing or empty → empty array.
create function public.filter_list(p_filters jsonb, p_key text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(lower(trim(v))) filter (where trim(v) <> ''), '{}')
  from jsonb_array_elements_text(coalesce(p_filters -> p_key, '[]')) v
$$;

-- Text typed by a person, made safe to put inside a regular expression ("C++" stays "C++").
create function public.regex_quote(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p_text, '([.\\+*?\[^\]$(){}=!<>|:#-])', '\\\1', 'g')
$$;

-- filters, every key optional (an empty list means "no filter"):
--   looking_for   ["pfe", "internship", "job"]   any of them
--   domains       ["data_ai", ...]               any of them (the list in worker/cv_worker/schema.py)
--   skills        ["python", "react"]            any of them, or all with skills_match = "all"
--   skills_match  "any" (default) | "all"
--   cities        ["Tunis", "Sfax"]              any of them (the city the candidate lives in)
--   schools       ["ENIT"]                       any of them, as a whole word of the school name
--                                                ("ENIS" finds "École ... de Sfax (ENIS)", not "ENISo")
--   languages     ["english", "french"]          all of them (a recruiter needing both needs both)
-- Matching ignores upper and lower case. An unknown key is an error, so a typo in the API
-- never silently turns a filter off.
create function public.search_profiles(
  query_text      text,
  query_embedding extensions.vector(1024) default null,
  filters         jsonb default '{}',
  page            int default 1
)
returns table (
  public_id    text,
  looking_for  text,
  data         jsonb,
  approved_at  timestamptz,
  score        double precision,
  total_count  bigint
)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  page_size    constant int := 20;
  -- The meaning search keeps its 50 closest profiles: every profile has *some* distance to the
  -- query, and without a cut the far ones would still collect a little score.
  vector_limit constant int := 50;
  rrf_k        constant int := 60;
  v_filters    jsonb := coalesce(filters, '{}');
  v_unknown    text;
  v_query      tsquery;
  v_looking    text[] := public.filter_list(v_filters, 'looking_for');
  v_domains    text[] := public.filter_list(v_filters, 'domains');
  v_skills     text[] := public.filter_list(v_filters, 'skills');
  v_all_skills boolean := coalesce(v_filters ->> 'skills_match', 'any') = 'all';
  v_cities     text[] := public.filter_list(v_filters, 'cities');
  v_schools    text[] := public.filter_list(v_filters, 'schools');
  v_languages  text[] := public.filter_list(v_filters, 'languages');
begin
  select k into v_unknown from jsonb_object_keys(v_filters) k
   where k not in ('looking_for', 'domains', 'skills', 'skills_match', 'cities', 'schools', 'languages')
   limit 1;
  if v_unknown is not null then
    raise exception 'unknown search filter: %', v_unknown using errcode = '22023';
  end if;
  if coalesce(v_filters ->> 'skills_match', 'any') not in ('any', 'all') then
    raise exception 'skills_match must be "any" or "all"' using errcode = '22023';
  end if;

  -- websearch_to_tsquery accepts anything a person types (quotes, "-word", "or"), never a syntax error.
  -- A query of only punctuation gives an empty tsquery: treat it as no text.
  if nullif(trim(query_text), '') is not null then
    v_query := websearch_to_tsquery('simple', query_text);
    if numnode(v_query) = 0 then
      v_query := null;
    end if;
  end if;

  return query
  with candidates as (
    select p.user_id, p.public_id, p.looking_for, p.data, p.approved_at, p.search_tsv, p.embedding
      from public.profiles p
     where p.status = 'approved'
       and not p.hidden
       and (cardinality(v_looking) = 0 or p.looking_for = any (v_looking))
       and (cardinality(v_domains) = 0 or p.data -> 'classification' ->> 'domain' = any (v_domains))
       and (cardinality(v_skills) = 0
            or (v_all_skills and public.profile_skills(p.data) @> v_skills)
            or (not v_all_skills and public.profile_skills(p.data) && v_skills))
       and (cardinality(v_cities) = 0 or lower(trim(p.data -> 'basics' ->> 'city')) = any (v_cities))
       and (cardinality(v_schools) = 0 or exists (
             select 1
               from jsonb_array_elements(coalesce(p.data -> 'education', '[]')) e, unnest(v_schools) s
              where lower(e ->> 'institution') ~ ('\m' || public.regex_quote(s) || '\M')))
       and (cardinality(v_languages) = 0 or public.profile_languages(p.data) @> v_languages)
  ),
  word_hits as (
    select c.user_id,
           row_number() over (order by ts_rank_cd(c.search_tsv, v_query) desc, c.user_id) as rank
      from candidates c
     where v_query is not null and c.search_tsv @@ v_query
  ),
  meaning_hits as (
    select c.user_id,
           row_number() over (order by c.embedding operator(extensions.<=>) query_embedding, c.user_id) as rank
      from candidates c
     where query_embedding is not null and c.embedding is not null
     order by c.embedding operator(extensions.<=>) query_embedding, c.user_id
     limit vector_limit
  ),
  fused as (
    select h.user_id, sum(1.0 / (rrf_k + h.rank))::double precision as score
      from (select * from word_hits union all select * from meaning_hits) h
     group by h.user_id
  ),
  results as (
    select c.public_id, c.looking_for, c.data, c.approved_at, coalesce(f.score, 0) as score
      from candidates c
      left join fused f on f.user_id = c.user_id
     where f.user_id is not null or (v_query is null and query_embedding is null)
  )
  select r.public_id, r.looking_for, r.data, r.approved_at, r.score, count(*) over () as total_count
    from results r
   order by r.score desc, r.approved_at desc nulls last, r.public_id
   limit page_size
  offset (greatest(coalesce(page, 1), 1) - 1) * page_size;
end $$;

-- Logged-in users (the access rules decide what they see) and the server. Never logged-out visitors.
revoke execute on function public.search_profiles(text, extensions.vector, jsonb, int) from public, anon;
grant execute on function public.search_profiles(text, extensions.vector, jsonb, int) to authenticated, service_role;
