"use client";
// Polls the job status and shows where the CV is. Runs in the browser because it updates by itself.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2Icon, CircleAlertIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import en from "@/messages/en.json";

const t = en.processing;
const POLL_MS = 3000;
// Rule 5: nobody waits forever on a spinner. After this, the page says it's slow (and keeps going).
const SLOW_AFTER_MS = 3 * 60 * 1000;
const REVIEW_URL = "/candidate/review";
const UPLOAD_URL = "/candidate";

type JobStatus = "queued" | "processing" | "done" | "failed";
type State =
  | { kind: "loading" }
  | { kind: JobStatus; position: number | null; error: string | null }
  | { kind: "not_found" | "not_logged_in" };

export function ProcessingStatus() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [offline, setOffline] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      try {
        const res = await fetch(`/api/cv/jobs/${jobId}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 401) return setState({ kind: "not_logged_in" });
        if (res.status === 404) return setState({ kind: "not_found" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { status: JobStatus; position: number | null; error: string | null };
        setOffline(false);
        setState({ kind: body.status, position: body.position, error: body.error });
        if (body.status === "done" || body.status === "failed") return; // final: stop asking
      } catch {
        if (stopped) return;
        setOffline(true); // network hiccup or server error: say so, keep trying
      }
      timer = setTimeout(check, POLL_MS);
    }

    check();
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
    };
  }, [jobId]);

  // Done: show the success state for a moment, then open the review page.
  useEffect(() => {
    if (state.kind !== "done") return;
    const go = setTimeout(() => router.push(REVIEW_URL), 1000);
    return () => clearTimeout(go);
  }, [state.kind, router]);

  if (state.kind === "not_found" || state.kind === "not_logged_in") {
    return (
      <Message
        icon={<CircleAlertIcon className="size-6 text-destructive" />}
        title={state.kind === "not_found" ? t.notFound : t.notLoggedIn}
      />
    );
  }

  if (state.kind === "failed") {
    return (
      <Message
        icon={<CircleAlertIcon className="size-6 text-destructive" />}
        title={t.failed}
        description={state.error || t.failedDefault}
        action={<a className={buttonVariants()} href={UPLOAD_URL}>{t.tryAgain}</a>}
      />
    );
  }

  if (state.kind === "done") {
    return (
      <Message
        icon={<CheckCircle2Icon className="size-6 text-primary" />}
        title={t.done}
        description={t.doneHint}
        action={<a className={buttonVariants({ variant: "outline" })} href={REVIEW_URL}>{t.goToReview}</a>}
        step="done"
      />
    );
  }

  const queued = state.kind === "queued";
  return (
    <Message
      icon={queued ? <QueueAnimation /> : <Loader2Icon className="size-6 animate-spin text-primary" />}
      title={state.kind === "loading" ? t.title : queued ? t.queued : t.processing}
      description={queued ? t.queuedHint : t.processingHint}
      step={queued ? "queued" : state.kind === "processing" ? "processing" : undefined}
      extra={
        <>
          {queued && state.position !== null && (
            <p className="text-2xl font-semibold" aria-live="polite">
              {t.position.replace("{position}", String(state.position))}
            </p>
          )}
          {offline && <p className="text-sm text-muted-foreground">{t.offline}</p>}
          {slow && <p className="text-sm text-muted-foreground">{t.slow}</p>}
        </>
      }
    />
  );
}

// The friendly "waiting in line" animation: a CV that gently bounces, followed by three dots.
// motion-reduce: people who turn animations off in their system settings get a still picture.
function QueueAnimation() {
  return (
    <div className="flex items-end gap-1.5" aria-hidden="true">
      <FileTextIcon className="size-8 animate-bounce text-primary motion-reduce:animate-none" />
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="mb-1 size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

const steps = ["queued", "processing", "done"] as const;

function Message({
  icon,
  title,
  description,
  action,
  extra,
  step,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  extra?: React.ReactNode;
  step?: (typeof steps)[number];
}) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="mx-auto">{icon}</div>
        <CardTitle className="text-lg" role="status">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {(step || extra || action) && (
        <CardContent className="flex flex-col items-center gap-4 text-center">
          {step && (
            <div className="flex flex-wrap justify-center gap-2">
              {steps.map((s) => (
                <Badge key={s} variant={steps.indexOf(s) <= steps.indexOf(step) ? "default" : "outline"}>
                  {t.steps[s]}
                </Badge>
              ))}
            </div>
          )}
          {extra}
          {action}
        </CardContent>
      )}
    </Card>
  );
}
