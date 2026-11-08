"use client";
// S3-04 · The active filters as chips above the results: what smart search understood, or what was set in
// the filter panel. The whole chip is the remove button (44 px tall: a small × is hard to hit on a phone).
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { LIST_PARAMS, type ListParam, type SearchState } from "@/lib/search/url";

export function FilterChips({ state, onRemove }: { state: SearchState; onRemove: (key: ListParam, value: string) => void }) {
  const t = useTranslations("company.cvs");
  const review = useTranslations("review");
  const upload = useTranslations("upload");
  const label = (key: ListParam, value: string) =>
    key === "looking_for" ? upload(`choices.${value}` as "choices.pfe")
      : key === "domain" ? review(`domains.${value}` as "domains.data_ai")
        : value;

  const chips = LIST_PARAMS.flatMap((key) => state[key].map((value) => ({ key, value, text: label(key, value) })));
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("activeFilters")}>
      {chips.map(({ key, value, text }) => (
        <li key={`${key}:${value}`}>
          <button
            type="button"
            onClick={() => onRemove(key, value)}
            aria-label={t("removeTag", { value: text })}
            className="flex h-11 items-center gap-1.5 rounded-full border bg-secondary px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {text}
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
