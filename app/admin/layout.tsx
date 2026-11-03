import { Suspense, type ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { AdminLayoutShell } from "@/components/admin/admin-layout-shell";

async function AdminSessionGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    // Unauthenticated or different role: allow children (e.g. /admin/login) to render directly.
    // Protected admin pages (/admin, /admin/companies, /admin/candidates) redirect via proxy.ts and page checks.
    return <>{children}</>;
  }
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminSessionGate>{children}</AdminSessionGate>
    </Suspense>
  );
}
