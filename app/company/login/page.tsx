import { Suspense } from "react";
import { SpaceLoginForm } from "@/components/company/space-login-form";
export default function Page() { return <Suspense fallback={null}><SpaceLoginForm role="company" /></Suspense>; }
