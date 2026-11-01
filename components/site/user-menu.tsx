"use client";
// The account menu in the header, shown only when someone is logged in. "Log out" lives here (S1-26),
// so every page has it in the same place.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/auth";
import { useTranslations } from "next-intl";

const spaceFor: Record<Role, string> = { candidate: "/candidate/profile", company: "/company", admin: "/admin" };

export function UserMenu({ email, role }: { email: string; role: Role | null }) {
  const t = useTranslations("site");
  const router = useRouter();

  async function logOut() {
    // The server ends the session (POST /api/candidate/auth, "logout" signs out whatever the role).
    await fetch("/api/candidate/auth", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }),
    }).catch(() => null);
    router.replace("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={t("userMenu.open")} />}>
        <UserIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block text-xs text-muted-foreground">{t("userMenu.signedInAs")}</span>
            <span className="block truncate font-medium text-foreground">{email}</span>
            <span className="block text-xs text-muted-foreground">
              {role ? t(`roles.${role}`) : t("userMenu.noRole")}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {role && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={spaceFor[role]} />}>{t("userMenu.mySpace")}</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logOut}>
          <LogOutIcon aria-hidden="true" />
          {t("userMenu.logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
