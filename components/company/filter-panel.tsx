"use client";
// S2-14 · The filters of the CV search: what the candidate is looking for, domain, skills (any or all),
// city, school and languages. Every change applies at once (no "Apply" button). The same panel is a
// sidebar on laptops and a slide-in panel on phones (cv-search.tsx).
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { type ListParam, type SearchState } from "@/lib/search/url";
import { TagInput } from "./tag-input";

const LOOKING_FOR = ["pfe", "internship", "job"] as const;

export function FilterPanel({ state, domains, onChange }: {
  state: SearchState;
  domains: readonly string[];
  onChange: (next: SearchState) => void;
}) {
  const t = useTranslations("company.cvs");
  const review = useTranslations("review");
  const upload = useTranslations("upload");

  const set = (key: ListParam, values: string[]) => onChange({ ...state, [key]: values });
  const toggle = (key: ListParam, value: string, on: boolean) =>
    set(key, on ? [...state[key], value] : state[key].filter((v) => v !== value));

  return (
    <div className="flex flex-col gap-5">
      <CheckboxGroup
        legend={t("lookingFor")}
        options={LOOKING_FOR.map((v) => ({ value: v, label: upload(`choices.${v}`) }))}
        checked={state.looking_for}
        onToggle={(v, on) => toggle("looking_for", v, on)}
      />

      <CheckboxGroup
        legend={t("domain")}
        options={domains.map((v) => ({ value: v, label: review(`domains.${v}` as "domains.data_ai") }))}
        checked={state.domain}
        onToggle={(v, on) => toggle("domain", v, on)}
      />

      <div className="flex flex-col gap-2">
        <TagInput label={t("skillsFilter")} values={state.skill} onChange={(v) => set("skill", v)} />
        {state.skill.length > 1 && (
            <div className="flex rounded-lg border p-0.5 text-xs" role="radiogroup" aria-label={t("skillsMatch")}>
              {(["any", "all"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={state.skills_match === m}
                  onClick={() => onChange({ ...state, skills_match: m })}
                  className="flex-1 rounded-md px-2 py-1 aria-checked:bg-primary aria-checked:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {m === "any" ? t("skillsAny") : t("skillsAll")}
                </button>
              ))}
            </div>
        )}
      </div>

      <TagInput label={t("cityFilter")} values={state.city} onChange={(v) => set("city", v)} />
      <TagInput label={t("schoolFilter")} values={state.school} onChange={(v) => set("school", v)} />
      <TagInput label={t("languageFilter")} values={state.language} onChange={(v) => set("language", v)} />
    </div>
  );
}

function CheckboxGroup({ legend, options, checked, onToggle }: {
  legend: string;
  options: { value: string; label: string }[];
  checked: string[];
  onToggle: (value: string, on: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={checked.includes(o.value)} onCheckedChange={(on) => onToggle(o.value, on)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
