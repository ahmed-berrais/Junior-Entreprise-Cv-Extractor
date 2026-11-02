"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Building2, Users, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function AdminLayoutShell({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  const t = useTranslations("admin");
  const rawPathname = usePathname();
  const pathname = rawPathname ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // When on the admin login page, never render the admin header or sidebar
  if (pathname.endsWith("/admin/login") || pathname.includes("/admin/login")) {
    return <>{children}</>;
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/candidate/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      // Continue navigation even on transient network error
    }
    router.replace("/admin/login");
    router.refresh();
  }

  const navItems = [
    {
      href: "/admin",
      label: t("nav.overview"),
      icon: LayoutDashboard,
      active: pathname === "/admin",
    },
    {
      href: "/admin/companies",
      label: t("nav.companies"),
      icon: Building2,
      active: pathname.startsWith("/admin/companies"),
    },
    {
      href: "/admin/candidates",
      label: t("nav.candidates"),
      icon: Users,
      active: pathname.startsWith("/admin/candidates"),
    },
  ];

  return (
    <div className="flex flex-1 flex-col w-full max-w-full overflow-x-hidden bg-background">
      {/* Admin Top Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base sm:text-lg font-heading font-bold leading-tight truncate">
                {t("header.title")}
              </span>
              {userEmail && (
                <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-56">
                  {userEmail}
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loggingOut}
            onClick={handleLogout}
            className="min-h-[44px] px-3 sm:px-4 text-xs sm:text-sm font-medium gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            aria-label={t("header.logout")}
          >
            <LogOut className="size-4 shrink-0" />
            <span>{loggingOut ? t("header.loggingOut") : t("header.logout")}</span>
          </Button>
        </div>
      </header>

      {/* Mobile Navigation Bar (< md) */}
      <div className="block md:hidden border-b bg-card/50 p-2 sm:p-3">
        <nav
          aria-label={t("nav.ariaLabel")}
          className="mx-auto grid grid-cols-3 gap-1.5 max-w-md w-full bg-muted/60 p-1 rounded-xl"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 px-2 text-[11px] sm:text-xs font-medium rounded-lg min-h-[44px] transition-all text-center",
                  item.active
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Body: Sidebar (desktop) + Content */}
      <div className="mx-auto flex flex-1 w-full max-w-7xl">
        {/* Desktop Sidebar (>= md) */}
        <aside className="hidden md:flex md:w-60 lg:w-64 flex-col shrink-0 border-r bg-card/30 p-4 gap-2">
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("nav.ariaLabel")}
          </div>
          <nav aria-label={t("nav.ariaLabel")} className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium min-h-[44px] transition-colors",
                    item.active
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
