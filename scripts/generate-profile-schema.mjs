import { readFile, writeFile } from "node:fs/promises";
import { jsonSchemaToZod } from "json-schema-to-zod";

const source = JSON.parse(await readFile(new URL("../shared/profile.schema.json", import.meta.url), "utf8"));
// The converter does not resolve Pydantic's local $defs references itself.
function resolve(value) {
  if (Array.isArray(value)) return value.map(resolve);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) {
    const key = value.$ref.replace("#/$defs/", "");
    if (!source.$defs[key]) throw new Error(`Unknown schema reference: ${value.$ref}`);
    const { $ref, ...rest } = value;
    void $ref;
    return resolve({ ...source.$defs[key], ...rest });
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$defs").map(([key, child]) => [key, resolve(child)]));
}
const schema = resolve(source);
const generated = jsonSchemaToZod(schema, { name: "profileSchema", module: "esm", zodVersion: 4 }).replaceAll("z.string()", "z.string().trim()");
const domains = source.$defs.Classification.properties.domain.anyOf.find((entry) => entry.enum).enum;
await writeFile(new URL("../lib/profile/schema.gen.ts", import.meta.url),
  `// Generated from worker/cv_worker/schema.py. Do not edit.\n${generated}\nexport type CandidateProfile = z.infer<typeof profileSchema>;\nexport const profileDomains = ${JSON.stringify(domains)} as const;\n`);
