// S3-04 · Smart search: a recruiter's sentence ("React developers in Sousse looking for a PFE") → the
// search page's URL parameters (skill=React&city=Sousse&looking_for=pfe&q=developers).
//
// Gemini, not Nemotron as the task first said (Ahmed's OK, 8 Nov): one provider for the team. It runs on its
// own key, GEMINI_SEARCH_API_KEY, from a separate Google project, so smart searches never use the daily
// quota CV extraction needs (docs/AI_LIMITS.md). The answer is forced into JSON by a schema, checked with
// zod, then by parseSearchParams: the same check every normal search goes through.
//
// Never throws. Any failure (no key, error, over 4 seconds, bad JSON, a value outside the lists) returns
// null, and the page runs the normal search with the sentence as typed (CLAUDE.md rule 5).
// Never log the sentence or the error body: a search can name a person.
import { z } from "zod";
import { ProfileSchema } from "@/lib/profile/schema.gen";
import { parseSearchParams } from "@/lib/search/params";

export const UNDERSTAND_TIMEOUT_MS = 4000;
const DOMAINS = ProfileSchema.shape.classification.shape.domain.options;
const LOOKING_FOR = ["pfe", "internship", "job"];

// The prompt's version log is in docs/AI_PROMPTS.md ("Smart search").
const PROMPT = `You turn a recruiter's search sentence, in English or French, into filters for a database of
Tunisian students' CVs. Only use what the sentence says; never guess a filter. Leave a list empty when the
sentence doesn't mention it.
- skills: technologies, tools, languages and skills named (React, Python, AutoCAD, Excel), spelled as usual.
- cities: cities named, in their usual French spelling (Tunis, Sousse, Sfax, Monastir).
- looking_for: "pfe" for a final-year project (PFE, projet de fin d'études, stage PFE); "internship" for any
  other internship (stage, stagiaire); "job" for a job (emploi, CDI, embauche, full-time).
- domains: only when the sentence names a field of study or work ("cybersecurity students", "profils
  finance"). Never from a skill or a job title alone.
- text: the words left that describe the person ("developers", "étudiants motivés"), without the words
  used for the filters above, and without filler words like "looking for" or "je cherche". Write each word in the
  singular ("developer", not "developers"): when search by meaning is down, only exact words match. Empty if nothing is left.`;

const list = (items: object) => ({ type: "ARRAY", items: { type: "STRING", ...items } });
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    skills: list({}),
    cities: list({}),
    looking_for: list({ enum: LOOKING_FOR }),
    domains: list({ enum: DOMAINS }),
    text: { type: "STRING" },
  },
  required: ["skills", "cities", "looking_for", "domains", "text"],
};

const Answer = z.object({
  skills: z.array(z.string()),
  cities: z.array(z.string()),
  looking_for: z.array(z.string()),
  domains: z.array(z.string()),
  text: z.string(),
});

export async function understandSentence(
  sentence: string,
  { fetchFn = fetch, timeoutMs = UNDERSTAND_TIMEOUT_MS }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<URLSearchParams | null> {
  const key = process.env.GEMINI_SEARCH_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_SEARCH_MODEL || "gemini-3.5-flash-lite";
  try {
    const response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: "user", parts: [{ text: sentence }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const answer = Answer.parse(JSON.parse(body?.candidates?.[0]?.content?.parts?.[0]?.text));

    const params = new URLSearchParams();
    if (answer.text.trim()) params.set("q", answer.text.trim());
    for (const [param, values] of [
      ["skill", answer.skills], ["city", answer.cities], ["looking_for", answer.looking_for], ["domain", answer.domains],
    ] as const) {
      for (const value of new Set(values.map((v) => v.trim()).filter(Boolean))) params.append(param, value);
    }
    // Nothing understood ("hello") would list every profile: search the sentence as typed instead.
    return params.size > 0 && parseSearchParams(params).ok ? params : null;
  } catch {
    return null;
  }
}
