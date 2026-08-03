import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClinician } from "@/lib/clinicians";
import { listFeatures } from "@/lib/worklist";
import WorklistClient, { type FeatureRow } from "@/components/billing/WorklistClient";

export const dynamic = "force-dynamic";

/** Shared feature worklist for Akeel + the owner + the biller (Nick). */
export default async function WorklistPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/worklist");
  const isAdmin = user.clinician.contact === "admin";
  if (!isOwner(user.role) && !isBiller(user.role) && !isAdmin) redirect("/billing/me");

  const features = await listFeatures();
  const rows: FeatureRow[] = features.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    flow: f.flow,
    priority: f.priority,
    attachments: f.attachments,
    by: getClinician(f.requestedBy)?.name ?? "Someone",
    at: f.createdAt.slice(0, 10),
  }));

  return <WorklistClient rows={rows} />;
}
