// S1-32 · "Profile approved": the candidate's QR code, their business card at the fair.
// The QR code holds only the profile URL with the random public_id, never a name or an email.
// It reads the login cookie, so it sits inside <Suspense> (Next.js 16, see README).
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profileUrl, qrFileName, qrPng, QR_SIZE } from "@/lib/profile/qr";
import { buttonVariants } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export default async function ApprovedPage() {
  const t = await getTranslations("approved");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Suspense fallback={<p role="status">{t("loading")}</p>}>
        <ApprovedProfile />
      </Suspense>
    </main>
  );
}

async function ApprovedProfile() {
  const t = await getTranslations("approved");
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") return <p role="alert">{t("unauthorized")}</p>;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, public_id, data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "approved") {
    return (
      <>
        <p role="status">{t("notApproved")}</p>
        <a className={buttonVariants({ variant: "outline" })} href="/candidate/review">{t("toReview")}</a>
      </>
    );
  }
  if (!process.env.APP_URL) return <p role="alert">{t("unavailable")}</p>;

  const png = await qrPng(profileUrl(process.env.APP_URL, profile.public_id));
  const src = `data:image/png;base64,${png.toString("base64")}`;
  const profileCopy = await getTranslations("myProfile");
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("explain")}</p>
      {/* A data: URL, so there is no public image route to guess; next/image doesn't apply. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={QR_SIZE} height={QR_SIZE} alt={t("qrAlt")} className="h-auto w-full max-w-xs rounded-lg border" />
      <a className={buttonVariants()} href={src} download={qrFileName(profile.data?.basics?.name)}>
        {t("download")}
      </a>
      <a className={buttonVariants({ variant: "outline" })} href="/candidate/profile">{profileCopy("back")}</a>
    </>
  );
}
