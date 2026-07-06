import { redirect } from "next/navigation";
import { getBillingUser, canMarkBilled } from "@/lib/billingRole";
import { listSessions, listInsurers } from "@/lib/billing";
import { insurancePortion } from "@/lib/billingCalc";
import { getClinician } from "@/lib/clinicians";
import PaymentsClient, { PaymentRow } from "@/components/billing/PaymentsClient";

export const dynamic = "force-dynamic";

export default async function BillingQueuePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/payments");
  if (!canMarkBilled(user.role)) redirect("/billing/me");

  const [sessions, insurers] = await Promise.all([listSessions(), listInsurers()]);
  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? "—";

  // The biller only handles insurance-billed sessions; self-pay is settled at the visit.
  const rows: PaymentRow[] = sessions
    .filter((s) => s.insurerId)
    .map((s) => ({
      id: s.id,
      dateOfService: s.dateOfService,
      clinicianName: getClinician(s.clinicianId)?.name ?? s.clinicianId,
      clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
      insurerName: insurerName(s.insurerId),
      insuranceAmount: insurancePortion(s),
      insurancePaid: s.insurancePaid,
      paidDate: s.paidDate,
    }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="ov-headrow">
        <div>
          <h2 className="ov-title">Billing queue</h2>
          <p className="ov-sub">Mark a claim as billed once insurance has paid it. Amounts in KYD.</p>
        </div>
      </div>
      <PaymentsClient rows={rows} today={today} />
    </div>
  );
}
