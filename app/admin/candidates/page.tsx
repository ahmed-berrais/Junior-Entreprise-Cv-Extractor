import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, ArrowLeft, Building2 } from "lucide-react";

async function Content() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/login");

  const t = await getTranslations("admin.candidates");

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm sm:text-base text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users className="size-5" />
            </span>
            <CardTitle className="text-lg sm:text-xl">
              {t("status")}
            </CardTitle>
          </div>
          <CardDescription className="text-sm">
            {t("placeholder")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href="/admin"
            className={buttonVariants({ variant: "outline", className: "min-h-[44px]" })}
          >
            <ArrowLeft className="size-4 mr-2" />
            {t("backToOverview")}
          </Link>
          <Link
            href="/admin/companies"
            className={buttonVariants({ className: "min-h-[44px]" })}
          >
            <Building2 className="size-4 mr-2" />
            {t("goToCompanies")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
