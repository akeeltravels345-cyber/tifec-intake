import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The old disbursement dashboard is replaced by the owner Overview.
export default function LegacyDashboard() {
  redirect("/billing/overview");
}
