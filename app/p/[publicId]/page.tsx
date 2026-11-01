// S2-11 · /p/<public_id> — what a candidate's QR code opens. Four cases (lib/profile/view.ts decides,
// on the server, before any profile is read):
//   an active company or the admin → the full profile, with "Download PDF" (S3-03);
//   the candidate themselves       → their own profile, with "Edit my profile";
//   anyone else                    → "only visible to companies registered for the fair" + login;
//   an unknown public_id           → the not-found page (for those allowed to look profiles up).
// Reading the session needs the login cookie, so it all sits inside <Suspense> (CLAUDE.md rule 11).
// That also means a not-found answer is streamed with status 200 and a noindex tag, as Next.js does
// for any notFound() inside <Suspense>; the page shown is the not-found one.
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DownloadIcon, LockIcon, PencilIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/site/page-container";
import { CompanyProfileView } from "@/components/profile/company-profile-view";
import { loadProfileView } from "@/lib/profile/view";

// Where "Edit my profile" leads: the candidate's profile editor (docs/ACCESS.md lists it, S2-01).
const EDIT_URL = "/candidate/profile/edit";
const COMPANY_LOGIN = "/company/login";

// Not indexed by search engines, whoever opens it: these are people's CVs.
export const metadata = { robots: { index: false, follow: false } };

export default async function ProfilePage({ params }: PageProps<"/p/[publicId]">) {
  const t = await getTranslations("profilePage");
  return (
    <PageContainer className="max-w-4xl">
      <Suspense fallback={<p role="status">{t("loading")}</p>}>
        <Profile params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Profile({ params }: { params: PageProps<"/p/[publicId]">["params"] }) {
  const { publicId } = await params;
  const view = await loadProfileView(publicId);
  const t = await getTranslations("profilePage");

  if (view.kind === "not_found") notFound();

  if (view.kind === "gate" || view.kind === "disabled") {
    return (
      <section data-view={view.kind} className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <LockIcon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-heading text-xl font-semibold">
          {view.kind === "gate" ? t("gate.title") : t("disabled")}
        </h1>
        {view.kind === "gate" && <p className="text-muted-foreground">{t("gate.text")}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {view.kind === "gate" && (
            <Link href={COMPANY_LOGIN} className={buttonVariants()}>{t("gate.login")}</Link>
          )}
          <Link href="/" className={buttonVariants({ variant: "outline" })}>{t("gate.home")}</Link>
        </div>
      </section>
    );
  }

  if (view.kind === "own") {
    const { profile } = view;
    return (
      <div data-view="own" className="flex flex-col gap-4">
        <div role="status" className="rounded-xl border border-primary/30 bg-secondary p-4 text-sm">
          <p className="font-medium">{t("own.banner")}</p>
          {profile.status !== "approved" && <p className="text-muted-foreground">{t("own.draft")}</p>}
          {profile.status === "approved" && profile.hidden && <p className="text-muted-foreground">{t("own.hidden")}</p>}
        </div>
        <CompanyProfileView
          profile={profile}
          actions={
            <Link href={EDIT_URL} className={buttonVariants()}>
              <PencilIcon data-icon="inline-start" aria-hidden="true" />
              {t("own.edit")}
            </Link>
          }
        />
      </div>
    );
  }

  // An active company or the admin.
  return (
    <div data-view="full" className="flex flex-col gap-4">
      <Link href={view.viewer === "admin" ? "/admin/candidates" : "/company/cvs"}
        className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        ← {t("backToCvs")}
      </Link>
      <CompanyProfileView
        profile={view.profile}
        actions={
          // S3-03 adds the PDF itself; the button is in place so the layout doesn't move then.
          <Button variant="outline" disabled title={t("pdfSoon")}>
            <DownloadIcon data-icon="inline-start" aria-hidden="true" />
            {t("downloadPdf")}
          </Button>
        }
      />
    </div>
  );
}
