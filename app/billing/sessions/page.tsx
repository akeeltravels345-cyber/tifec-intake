import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A clinician's own sessions now live on their "My clients" detail page.
export default function LegacySessions() {
  redirect("/billing/me");
}
