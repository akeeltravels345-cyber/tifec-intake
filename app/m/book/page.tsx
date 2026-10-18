import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { listAppointmentTypes } from "@/lib/scheduling";
import { caymanToday } from "@/lib/caymanTime";
import MobileBook from "@/components/scheduling/MobileBook";

export const dynamic = "force-dynamic";

export default async function MobileBookPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/book");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const sp = await searchParams;
  const start = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : caymanToday();

  const types = (await listAppointmentTypes())
    .filter((t) => (t as { active?: boolean }).active !== false)
    .map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin ?? 50, mode: t.mode, category: t.category || "Other" }));

  return <MobileBook clinicianId={me.id} today={start} types={types} />;
}
