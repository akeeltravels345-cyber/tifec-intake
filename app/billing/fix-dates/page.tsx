import { redirect } from "next/navigation";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { listSessions, listInsurers } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import { caymanToday } from "@/lib/caymanTime";
import FixDatesClient, { type FixRow } from "@/components/billing/FixDatesClient";

export const dynamic = "force-dynamic";

// Temporary cleanup tool: insured claims whose collected (paid) date was left
// equal to the service date — almost certainly the old default, so they may be
// booked to the wrong payout month. Biller/owner/admin can fix each date here.
export default async function FixDatesPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/fix-dates");
  const isAdmin = user.clinician.contact === "admin";
  if (!isBiller(user.role) && !isOwner(user.role) && !isAdmin) redirect("/billing/me");

  const [sessions, insurers] = await Promise.all([listSessions(), listInsurers()]);
  const insName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? (id ? "Unknown insurer" : "Self-pay");

  const rows: FixRow[] = sessions
    .filter((s) => s.insurerId && s.insurancePaid && s.paidDate && s.paidDate.slice(0, 10) === s.dateOfService.slice(0, 10))
    .map((s) => ({
      id: s.id,
      client: `${s.clientFirst} ${s.clientLast}`.trim() || "Unnamed client",
      clinician: getClinician(s.clinicianId)?.name ?? s.clinicianId,
      insurer: insName(s.insurerId),
      dateOfService: s.dateOfService.slice(0, 10),
      collectedDate: (s.paidDate ?? "").slice(0, 10),
      amount: Math.round((insurancePortion(s) + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => a.dateOfService.localeCompare(b.dateOfService));

  return <FixDatesClient rows={rows} today={caymanToday()} />;
}
