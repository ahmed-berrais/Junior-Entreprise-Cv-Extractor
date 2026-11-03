"use client";
// S2-14 · A text field that turns what you type into tags: Enter or a comma adds one, × removes it,
// Backspace in the empty field removes the last one. Used for skills, cities, schools and languages.
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

const MAX_TAG = 100; // the API refuses longer values

export function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const t = useTranslations("company.cvs");
  const id = useId();
  const [text, setText] = useState("");

  const add = () => {
    const value = text.trim().slice(0, MAX_TAG);
    setText("");
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value} className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs">
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={t("removeTag", { value })}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={text}
        maxLength={MAX_TAG}
        placeholder={t("tagHint")}
        onChange={(e) => {
          // A pasted "python, react" becomes two tags.
          const parts = e.target.value.split(",");
          if (parts.length > 1) {
            const added = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean)
              .filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
            if (added.length) onChange([...values, ...added]);
          }
          setText(parts[parts.length - 1]);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={add}
      />
    </div>
  );
}
