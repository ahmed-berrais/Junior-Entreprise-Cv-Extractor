-- S2-12: hybrid search on 18 fictional profiles. Real embeddings need Gemini, which tests don't call,
-- so each profile gets a hand-made "topic" vector instead: dimension 1 = computer vision, 2 = web,
-- 3 = data and machine learning, and so on. A query vector on dimension 1 then plays the part of the
-- real embedding of "computer vision". The same search with real Gemini embeddings is checked by
-- `python -m cv_worker.check_search` (worker/README.md).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- A unit vector spread over the given topic dimensions.
create function pg_temp.vec(variadic dims int[]) returns extensions.vector
language sql as $$
  select array_agg(case when i = any (dims) then 1 / sqrt(cardinality(dims)) else 0 end order by i)::float8[]::extensions.vector
  from generate_series(1, 1024) i
$$;

-- A profile in the shape of worker/cv_worker/schema.py, with only what search looks at filled in.
create function pg_temp.profile(name text, headline text, city text, school text, field text, domain text,
                                skills text[], langs text[], project text, project_text text, project_tech text[])
returns jsonb language sql as $$
  select jsonb_build_object(
    'basics', jsonb_build_object('name', name, 'email', null, 'phone', null, 'city', city, 'country', 'Tunisia',
                                 'headline', headline, 'summary', null, 'links', '[]'::jsonb),
    'availability', null,
    'education', jsonb_build_array(jsonb_build_object('institution', school, 'degree', null, 'field', field,
                                   'start_date', null, 'end_date', null, 'current', true, 'grade', null)),
    'experience', '[]'::jsonb,
    'projects', jsonb_build_array(jsonb_build_object('name', project, 'description', project_text,
                                  'technologies', to_jsonb(project_tech), 'url', null, 'date', null)),
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', s, 'category', 'technical')), '[]') from unnest(skills) s),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('name', l, 'level', null)), '[]') from unnest(langs) l),
    'certifications', '[]'::jsonb,
    'classification', jsonb_build_object('domain', domain, 'seniority', 'student', 'years_experience', 0))
$$;

create function pg_temp.uid(n int) returns uuid
language sql as $$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- The names a search returns, in order.
create function pg_temp.names(q text, emb extensions.vector default null, f jsonb default '{}', pg int default 1)
returns text[] language sql as $$
  select coalesce(array_agg(r.data -> 'basics' ->> 'name' order by r.score desc, r.approved_at desc, r.public_id), '{}')
  from public.search_profiles(q, emb, f, pg) r
$$;

-- ── the 18 profiles ──────────────────────────────────────────────────────
insert into auth.users (id, email)
select pg_temp.uid(n), 'search' || n || '@test.local' from generate_series(1, 18) n;
insert into auth.users (id, email) values
  (pg_temp.uid(100), 'company@test.local'), (pg_temp.uid(101), 'disabled@test.local');
insert into public.companies (user_id, name, disabled) values
  (pg_temp.uid(100), 'Active Corp', false), (pg_temp.uid(101), 'Disabled Corp', true);

insert into public.profiles (user_id, status, hidden, looking_for, approved_at, data, embedding) values
  -- object detection, and never the words "computer" or "vision"
  (pg_temp.uid(1), 'approved', false, 'pfe', now() - interval '1 day',
   pg_temp.profile('Yasmine Trabelsi', 'AI engineering student', 'Tunis', 'ENIT', 'Artificial intelligence', 'data_ai',
     array['Python', 'PyTorch', 'OpenCV'], array['Arabic', 'French', 'English'],
     'Road traffic detector', 'Detects cars and pedestrians in dashcam videos with YOLOv8.', array['YOLOv8', 'PyTorch']),
   pg_temp.vec(1)),
  (pg_temp.uid(2), 'approved', false, 'internship', now() - interval '2 days',
   pg_temp.profile('Mehdi Gharbi', 'Full-stack developer', 'Tunis', 'INSAT', 'Software engineering', 'software_engineering',
     array['React', 'Node.js', 'PostgreSQL'], array['Arabic', 'French', 'English'],
     'Club events site', 'Event sign-up website for the student club.', array['Next.js']),
   pg_temp.vec(2)),
  (pg_temp.uid(3), 'approved', false, 'pfe', now() - interval '3 days',
   pg_temp.profile('Ines Bouazizi', 'Data science student', 'Sfax', 'École Nationale d''Ingénieurs de Sfax (ENIS)', 'Data science', 'data_ai',
     array['Python', 'PyTorch', 'Transformers'], array['Arabic', 'French', 'English'],
     'Tunisian dialect sentiment', 'Sentiment analysis of Tunisian dialect comments.', array['Hugging Face']),
   pg_temp.vec(3)),
  (pg_temp.uid(4), 'approved', false, 'job', now() - interval '4 days',
   pg_temp.profile('Karim Jlassi', 'Network engineer', 'Sousse', 'ENISo', 'Telecommunications', 'networks_telecom',
     array['Cisco', 'OSPF', 'Linux'], array['Arabic', 'French', 'English'],
     'Campus network', 'Designed the VLANs of a campus network.', array['Packet Tracer']),
   pg_temp.vec(4)),
  (pg_temp.uid(5), 'approved', false, 'internship', now() - interval '5 days',
   pg_temp.profile('Amira Ben Salem', 'Security student', 'Tunis', 'ESPRIT', 'Cybersecurity', 'cybersecurity',
     array['Kali Linux', 'Burp Suite', 'Wireshark'], array['Arabic', 'French', 'English'],
     'CTF write-ups', 'Write-ups of web exploitation challenges.', array['Python']),
   pg_temp.vec(5)),
  (pg_temp.uid(6), 'approved', false, 'pfe', now() - interval '6 days',
   pg_temp.profile('Omar Haddad', 'Embedded systems student', 'Monastir', 'ENIM', 'Electronics', 'embedded_iot',
     array['C', 'STM32', 'FreeRTOS'], array['Arabic', 'French'],
     'Smart irrigation', 'Soil moisture sensors that control a water pump.', array['ESP32', 'MQTT']),
   pg_temp.vec(6)),
  (pg_temp.uid(7), 'approved', false, 'job', now() - interval '7 days',
   pg_temp.profile('Salma Mansour', 'Junior accountant', 'Tunis', 'IHEC Carthage', 'Accounting', 'finance_accounting',
     array['Excel', 'Sage'], array['Arabic', 'French'],
     'Budget dashboard', 'Monthly budget dashboard for a small business.', array['Power BI']),
   pg_temp.vec(7)),
  (pg_temp.uid(8), 'approved', false, 'internship', now() - interval '8 days',
   pg_temp.profile('Nour Kefi', 'Marketing student', 'Tunis', 'ISCAE', 'Marketing', 'marketing_communication',
     array['SEO', 'Canva', 'Meta Ads'], array['Arabic', 'French', 'English'],
     'Brand campaign', 'Instagram campaign for a local café.', array['Canva']),
   pg_temp.vec(8)),
  (pg_temp.uid(9), 'approved', false, 'pfe', now() - interval '9 days',
   pg_temp.profile('Hamza Chaabane', 'Civil engineering student', 'Sfax', 'ENIS', 'Civil engineering', 'civil_engineering',
     array['AutoCAD', 'Revit', 'Robot Structural Analysis'], array['Arabic', 'French', 'English'],
     'Bridge design', 'Steel footbridge design and load calculation.', array['Robot Structural Analysis']),
   pg_temp.vec(9)),
  (pg_temp.uid(10), 'approved', false, 'job', now() - interval '10 days',
   pg_temp.profile('Rania Ayari', 'Mechanical engineer', 'Sousse', 'ENISo', 'Mechanical engineering', 'mechanical_engineering',
     array['SolidWorks', 'ANSYS'], array['Arabic', 'French', 'English'],
     'Gearbox redesign', 'Lighter gearbox housing for a packaging machine.', array['SolidWorks']),
   pg_temp.vec(10)),
  (pg_temp.uid(11), 'approved', false, 'internship', now() - interval '11 days',
   pg_temp.profile('Youssef Mejri', 'UI designer', 'Tunis', 'ESAC', 'Graphic design', 'design_multimedia',
     array['Figma', 'Illustrator'], array['Arabic', 'French', 'English'],
     'Banking app redesign', 'Redesign of a mobile banking app.', array['Figma']),
   pg_temp.vec(11)),
  (pg_temp.uid(12), 'approved', false, 'pfe', now() - interval '12 days',
   pg_temp.profile('Lina Saidi', 'Data analyst', 'Tunis', 'ENIT', 'Applied mathematics', 'data_ai',
     array['Python', 'SQL', 'scikit-learn'], array['Arabic', 'French', 'English'],
     'Churn prediction', 'Predicts which telecom customers will leave.', array['pandas']),
   pg_temp.vec(3)),
  (pg_temp.uid(13), 'approved', false, 'job', now() - interval '13 days',
   pg_temp.profile('Aziz Ferchichi', 'Java developer', 'Ariana', 'ESPRIT', 'Software engineering', 'software_engineering',
     array['Java', 'Spring Boot', 'Docker'], array['Arabic', 'French', 'English'],
     'Library API', 'REST API for a university library.', array['Spring Boot']),
   pg_temp.vec(2)),
  -- a draft: it mentions PyTorch and is about images, and must never come back
  (pg_temp.uid(14), 'draft', false, 'pfe', null,
   pg_temp.profile('Sarra Draft', 'AI student', 'Tunis', 'ENIT', 'Artificial intelligence', 'data_ai',
     array['Python', 'PyTorch'], array['Arabic', 'French', 'English'],
     'Face detection', 'Face detection on webcam images.', array['PyTorch']),
   pg_temp.vec(1)),
  -- approved but hidden by the candidate: never comes back either
  (pg_temp.uid(15), 'approved', true, 'pfe', now() - interval '14 days',
   pg_temp.profile('Fares Hidden', 'AI student', 'Tunis', 'ENIT', 'Artificial intelligence', 'data_ai',
     array['Python', 'PyTorch'], array['Arabic', 'French', 'English'],
     'Plate reader', 'Reads licence plates from parking cameras.', array['PyTorch']),
   pg_temp.vec(1)),
  -- PyTorch only in a project, not in the skills list
  (pg_temp.uid(16), 'approved', false, 'internship', now() - interval '15 days',
   pg_temp.profile('Meriem Zouari', 'Python developer', 'Tunis', 'INSAT', 'Software engineering', 'software_engineering',
     array['Python', 'Django'], array['Arabic', 'French'],
     'Recipe recommender', 'Recommends recipes from what is in the fridge.', array['PyTorch', 'Django']),
   pg_temp.vec(2, 3)),
  (pg_temp.uid(17), 'approved', false, 'job', now() - interval '16 days',
   pg_temp.profile('Wassim Ltaief', 'Industrial engineer', 'Sfax', 'ISGI Sfax', 'Industrial engineering', 'industrial_engineering',
     array['Lean', 'SAP'], array['Arabic', 'French', 'English'],
     'Line balancing', 'Cut waiting time on an assembly line.', array['Excel']),
   pg_temp.vec(12)),
  -- approved a minute ago: its embedding isn't computed yet
  (pg_temp.uid(18), 'approved', false, 'pfe', now(),
   pg_temp.profile('Eya Hammami', 'Machine learning student', 'Tunis', 'SUP''COM', 'Data science', 'data_ai',
     array['Python', 'TensorFlow'], array['Arabic', 'French', 'English'],
     'Speech commands', 'Recognises spoken commands in Tunisian Arabic.', array['TensorFlow']),
   null);

-- ── words ────────────────────────────────────────────────────────────────
select is(pg_temp.names('PyTorch'),
  array['Yasmine Trabelsi', 'Ines Bouazizi', 'Meriem Zouari'],
  'words only: "PyTorch" finds the three visible profiles that mention it (Meriem only in a project)');
select is(pg_temp.names('pytorch'), pg_temp.names('PyTorch'), 'upper and lower case don''t matter');
select is(pg_temp.names('Sousse SolidWorks'), array['Rania Ayari'], 'several words: a profile must have all of them');
select is(pg_temp.names('"!!"'), pg_temp.names(''), 'a query of only punctuation lists profiles, no error');

-- ── meaning ──────────────────────────────────────────────────────────────
select is((select search_tsv @@ websearch_to_tsquery('simple', 'computer or vision') from public.profiles
            where user_id = pg_temp.uid(1)), false,
  'Yasmine''s profile never uses the words "computer" or "vision"');
select is((pg_temp.names('computer vision', pg_temp.vec(1)))[1], 'Yasmine Trabelsi',
  'meaning: "computer vision" finds the object detection profile first');
select is(pg_temp.names('computer vision'), '{}'::text[],
  'without the query embedding, only words count: no profile has both words');

-- ── both, merged ─────────────────────────────────────────────────────────
select is((select array_agg(n order by n) from unnest((pg_temp.names('PyTorch', pg_temp.vec(3)))[1:3]) n),
  array['Ines Bouazizi', 'Meriem Zouari', 'Yasmine Trabelsi'],
  'hybrid: the three PyTorch profiles come before Lina, who is only close in meaning');
select is((pg_temp.names('PyTorch', pg_temp.vec(3)))[4], 'Lina Saidi',
  'hybrid: found by one search only (Lina, close in meaning) comes after those found by both');
select ok('Eya Hammami' = any (pg_temp.names('TensorFlow', pg_temp.vec(1))),
  'a profile without an embedding yet is still found by its words');
select is((select score from public.search_profiles('Revit', pg_temp.vec(9)) order by score desc limit 1),
  (1.0 / 61 + 1.0 / 61)::double precision, 'RRF: first in both lists scores 1/61 + 1/61');

-- ── filters ──────────────────────────────────────────────────────────────
select is(pg_temp.names('', null, '{"domains": ["data_ai"], "cities": ["tunis"]}'),
  array['Eya Hammami', 'Yasmine Trabelsi', 'Lina Saidi'],
  'domain + city, no query: newest approval first');
select is((select array_agg(n order by n) from unnest(pg_temp.names('', null, '{"skills": ["react", "JAVA"]}')) n),
  array['Aziz Ferchichi', 'Mehdi Gharbi'], 'skills, any of them');
select is((select array_agg(n order by n) from unnest(pg_temp.names('', null,
            '{"skills": ["python", "pytorch"], "skills_match": "all"}')) n),
  array['Ines Bouazizi', 'Meriem Zouari', 'Yasmine Trabelsi'],
  'skills, all of them (a project''s technologies count)');
select is(pg_temp.names('', null, '{"schools": ["enis"]}'),
  array['Ines Bouazizi', 'Hamza Chaabane'], 'school as a whole word of the name: "ENIS" finds ENIS, not ENISo');
select is(pg_temp.names('', null, '{"looking_for": ["internship"], "skills": ["python"]}'),
  array['Amira Ben Salem', 'Meriem Zouari'], 'looking for + skills together');
select is(pg_temp.names('PyTorch', null, '{"languages": ["English", "French"]}'),
  array['Yasmine Trabelsi', 'Ines Bouazizi'], 'languages: all of them (Meriem has no English)');

-- ── never drafts, never hidden ───────────────────────────────────────────
select is((select count(*)::int from public.search_profiles('', null, '{}', 1)), 16,
  'listing everything gives the 16 visible profiles: no draft, no hidden one');
select ok(not ('Sarra Draft' = any (pg_temp.names('PyTorch', pg_temp.vec(1), '{"domains": ["data_ai"], "looking_for": ["pfe"]}'))
            or 'Fares Hidden' = any (pg_temp.names('PyTorch', pg_temp.vec(1), '{"domains": ["data_ai"], "looking_for": ["pfe"]}'))),
  'combined query and filters that match them exactly still skip the draft and the hidden profile');

-- ── pages and mistakes ───────────────────────────────────────────────────
select is((select max(total_count)::int from public.search_profiles('', null, '{}', 1)), 16,
  'total_count counts every result, not only the page');
select is(pg_temp.names('', null, '{}', 2), '{}'::text[], 'page 2 is empty with 16 results (20 per page)');
select throws_ok($$select * from public.search_profiles('x', null, '{"domain": ["data_ai"]}')$$, '22023', null,
  'a misspelt filter is an error, never silently ignored');

-- ── who can run it ───────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.search_profiles(text, extensions.vector, jsonb, int)', 'execute'), false,
  'a logged-out visitor cannot search');

create function pg_temp.login(uid uuid, app_role text) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated', 'app_metadata', json_build_object('role', app_role))::text, true);
  set local role authenticated;
$$;
select pg_temp.login(pg_temp.uid(100), 'company');
select is((select count(*)::int from public.search_profiles('', null, '{}', 1)), 16,
  'an active company can search and finds the 16 visible profiles');
reset role;
select pg_temp.login(pg_temp.uid(101), 'company');
select is((select count(*)::int from public.search_profiles('', null, '{}', 1)), 0,
  'a disabled company finds nothing: the access rules still apply inside search');
reset role;

select * from finish();
rollback;
