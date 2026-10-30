// S1-29 · "Processing your CV": the page a candidate lands on after uploading (S1-23 returns the jobId).
// It asks GET /api/cv/jobs/:id every 3 seconds and shows the four states: queued (place in line),
// processing, done (then opens the review form) and failed (the reason + "Try another file").
// The job id comes from the URL, so the status part sits inside <Suspense> (Cache Components).
import { Suspense } from "react";
import { PageContainer } from "@/components/site/page-container";
import en from "@/messages/en.json";
import { ProcessingStatus } from "./processing-status";

export default function ProcessingPage() {
  return (
    <PageContainer className="max-w-xl justify-center">
      <Suspense fallback={<p className="text-center text-muted-foreground">{en.processing.title}</p>}>
        <ProcessingStatus />
      </Suspense>
    </PageContainer>
  );
}
