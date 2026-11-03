// S2-08 · /company opens the CVs, the first tab. The landing page's "Company login" leads here.
import { redirect } from "next/navigation";

export default function CompanyHome() {
  redirect("/company/cvs");
}
