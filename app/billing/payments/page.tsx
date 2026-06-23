import { redirect } from "next/navigation";
import { getBillingUser, canMarkPaid } from "@/lib/billingRole";
import { listSessions, listInsurers } from "@/lib/billing";
import { getClinician } from "@/lib/clinicians";
import PaymentsClient, { PaymentRow } from "@/components/billing/PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/payments");
  if (!canMarkPaid(user.role)) redirect("/billing/sessions");

  const [sessions, insurers] = await Promise.all([listSessions(), listInsurers()]);
  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name ?? "—";

  // Biller only tracks insurance-billed sessions; self-pay is settled at the visit.
  const rows: PaymentRow[] = sessions
    .filter((s) => s.insurerId)
    .map((s) => ({
      id: s.id,
      dateOfService: s.dateOfService,
      clinicianName: getClinician(s.clinicianId)?.name ?? s.clinicianId,
      clientName: `${s.clientFirst} ${s.clientLast}`.trim(),
      insurerName: insurerName(s.insurerId),
      totalCost: s.totalCost,
      copayCollected: s.copayCollected,
      insurancePaid: s.insurancePaid,
      paidDate: s.paidDate,
    }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="bz-head">
        <div>
          <h2 className="section-title">Payments</h2>
          <p className="section-desc">Mark insurance claims as paid. Amounts in KYD.</p>
        </div>
      </div>
      <PaymentsClient rows={rows} today={today} />
    </div>
  );
}
