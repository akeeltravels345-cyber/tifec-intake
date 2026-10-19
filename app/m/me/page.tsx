import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { inScheduleBeta } from "@/lib/clinicians";
import { getBillingUser } from "@/lib/billingRole";
import MobileMe from "@/components/scheduling/MobileMe";

export const dynamic = "force-dynamic";

export default async function MobileMePage() {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/m/me");
  const me = user.clinician;
  if (!inScheduleBeta(me)) redirect("/today");

  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") || "https"}://${h.get("host")}`;
  const bookingUrl = `${origin}/book?clinician=${encodeURIComponent(me.id)}`;
  const theme = (await cookies()).get("m-theme")?.value;

  return (
    <MobileMe
      name={me.name}
      role={me.credentials || (me.contact === "owner" ? "Owner" : me.contact === "admin" ? "Practice Administrator" : "Clinician")}
      bookingUrl={bookingUrl}
      theme={theme === "dark" ? "dark" : theme === "light" ? "light" : "system"}
    />
  );
}
