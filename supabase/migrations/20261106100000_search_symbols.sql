-- Word search drops symbols: Postgres reads "C++", "C#" and "C" as the same word, c, so a recruiter
-- searching C++ also got every C and C# profile. search_profiles now keeps the words of the query that
-- end in + or # and requires each of them, exactly, in the profile. The meaning search doesn't change.
--
-- Same function as 20261031100000_search_profiles.sql, except v_symbols. Replacing it keeps its grants.
-- Tests: supabase/tests/07_search_profiles.test.sql.

create or replace function public.search_profiles(
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
  v_symbols    text[];
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
    select coalesce(array_agg(distinct m[1]), '{}') into v_symbols
      from regexp_matches(lower(query_text), '(?:^|[\s,("])([[:alnum:]]+[+#]+)(?=$|[\s,;)"])', 'g') m;
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
       and not exists (select 1 from unnest(v_symbols) s where position(s in lower(c.data::text)) = 0)
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
