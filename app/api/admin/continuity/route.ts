import { getBillingUser, canSeeBusiness } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { buildContinuityHtml } from "@/lib/continuity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Printable business-continuity pack (schedule + client/claim essentials +
// who-owes + reference). Full PHI in clear text, so owner / system-admin only.
export async function GET() {
  const user = await getBillingUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!canSeeBusiness(user.role) && !isSystemAdmin(user.clinician)) {
    return new Response("Only the owner or system administrator can download the continuity pack.", { status: 403 });
  }
  const html = await buildContinuityHtml();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
