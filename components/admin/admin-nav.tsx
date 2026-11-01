// S2-06 · The admin tabs. A plain link bar: each tab is its own page and URL.
// "Companies" is /admin/companies, Oussema's company management screen (S2-05, #31).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "cn";

export async function AdminNav({ current }: { current: "overview" | "candidates" | "companies" }) {
  const t = await getTranslations("admin.nav");
  const tabs = [
    { key: "overview", href: "/admin" },
    { key: "candidates", href: "/admin/candidates" },
    { key: "companies", href: "/admin/companies" },
  ] as const;
  return (
    <nav className="flex gap-1 rounded-lg border bg-card p-1" aria-label="Admin">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium sm:flex-none sm:px-4",
            tab.key === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
