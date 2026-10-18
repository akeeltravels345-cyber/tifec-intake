import { redirect } from "next/navigation";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import { caymanToday } from "@/lib/caymanTime";
import MobileBlock from "@/components/scheduling/MobileBlock";

export const dynamic = "force-dynamic";

export default async function MobileBlockPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/block");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");
  const sp = await searchParams;
  const start = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : caymanToday();
  return <MobileBlock clinicianId={me.id} today={start} />;
}
