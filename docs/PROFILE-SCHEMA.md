# S1-15: one profile schema

Edit `worker/cv_worker/schema.py` only. Every field has an extraction description.
`ExtractedProfile` is the AI output model and rejects `looking_for`; that choice
belongs to the candidate. `CandidateProfile` adds it for persistence and review.
Missing facts remain empty strings/lists or null classification values. Dates use
YYYY-MM; an end date may be `present`. Technologies and skills are string arrays.

Generate both checked-in artifacts:

```sh
cd worker
python -m cv_worker.export_schema
cd ..
npm run schema:gen
```

Run both again: `git diff` must be empty after committing the generated files.
CI regenerates them and checks for drift. The converter resolves Pydantic's local
references and carries Python's whitespace trimming into generated Zod validators.
Do not hand-edit `shared/profile.schema.json` or `lib/profile/schema.gen.ts`.

## Outstanding design confirmation

The referenced design §4.1 and its fixed domain list were not available in the
repository, task descriptions/comments, or ClickUp folder resources inspected.
The domain values in `schema.py` are a proposed taxonomy, **not confirmed project
values**. Ahmed/Farouk must reconcile them with the design before S1-15 is closed.
The unknown-domain tests prove enum enforcement, not approval of this taxonomy.

Pydantic is required by S1-15. `json-schema-to-zod` is used as requested by that
task; it is a development dependency. Zod validates generated web inputs.
Testing Library, jsdom and tsx exercise actual form interactions without a live
Supabase account. No new table, service key or database privilege is introduced.
