import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Building2, Users } from "lucide-react";

async function Content() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/login");

  const t = await getTranslations("admin.overview");

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm sm:text-base text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card className="flex flex-col justify-between hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
              <CardTitle className="text-lg sm:text-xl">
                {t("companiesCard.title")}
              </CardTitle>
            </div>
            <CardDescription className="text-sm">
              {t("companiesCard.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/admin/companies"
              className={buttonVariants({ className: "w-full min-h-[44px]" })}
            >
              {t("companiesCard.action")}
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <CardTitle className="text-lg sm:text-xl">
                {t("candidatesCard.title")}
              </CardTitle>
            </div>
            <CardDescription className="text-sm">
              {t("candidatesCard.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/admin/candidates"
              className={buttonVariants({ variant: "outline", className: "w-full min-h-[44px]" })}
            >
              {t("candidatesCard.action")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
