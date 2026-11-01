// Email clients often copy whitespace together with an access code.
export function normalizeAccessCode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
