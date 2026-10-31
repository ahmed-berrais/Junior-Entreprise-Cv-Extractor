"use client";
// S2-08 · The company space's navigation: CVs, Scan QR, My company, plus the company name and logout.
// Phone: a bottom bar with the three icons, in reach of the thumb (Ahmed's note: the Scan button
// must be one tap away). Laptop (≥ 640 px): a bar under the site header. Same links in both.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BuildingIcon, FilesIcon, LogOutIcon, ScanLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logOut } from "@/lib/log-out";
import { cn } from "cn";

const LINKS = [
  { key: "cvs", href: "/company/cvs", Icon: FilesIcon },
  { key: "scan", href: "/company/scan", Icon: ScanLineIcon },
  { key: "myCompany", href: "/company/my-company", Icon: BuildingIcon },
] as const;

export function CompanyNav({ companyName }: { companyName: string }) {
  const t = useTranslations("company");
  const pathname = usePathname();
  const router = useRouter();
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function onLogOut() {
    await logOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      {/* Top bar: the company name and logout everywhere; the three links on laptops only. */}
      <div className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <p className="min-w-0 flex-1 truncate font-heading font-semibold sm:flex-none" title={companyName}>
            {companyName}
          </p>
          <nav aria-label={t("nav.label")} className="hidden flex-1 items-center gap-1 sm:flex">
            {LINKS.map(({ key, href, Icon }) => (
              <Link
                key={key}
                href={href}
                aria-current={isCurrent(href) ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                  isCurrent(href) ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(`nav.${key}`)}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" onClick={onLogOut} className="shrink-0">
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("logOut")}</span>
          </Button>
        </div>
      </div>

      {/* Bottom bar on phones: icon + label, 64 px high, above the iPhone home indicator. */}
      <nav
        aria-label={t("nav.label")}
        data-slot="company-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="grid grid-cols-3">
          {LINKS.map(({ key, href, Icon }) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={isCurrent(href) ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  isCurrent(href) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className={cn("flex h-7 w-14 items-center justify-center rounded-full", isCurrent(href) && "bg-secondary")}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
