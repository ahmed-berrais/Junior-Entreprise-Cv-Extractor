import type { CompanyRow } from "./company";
export function filterCompanies(rows: CompanyRow[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter(row => [row.name, row.email, row.sector].some(value => value?.toLocaleLowerCase().includes(needle)));
}
