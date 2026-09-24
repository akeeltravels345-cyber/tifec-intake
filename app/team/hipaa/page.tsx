import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/clinicians";
import { getHipaaBoard, HIPAA_SAFEGUARDS } from "@/lib/hipaa";
import HipaaBoard from "@/components/team/HipaaBoard";

export const dynamic = "force-dynamic";

// The HIPAA compliance tracker: a shared project board for the owner + admin to
// see where compliance stands and log progress. Not for the wider team.
export default async function HipaaPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/hipaa");
  if (!isSystemAdmin(me) && me.contact !== "owner") redirect("/today");

  const board = await getHipaaBoard();
  return <HipaaBoard board={board} safeguards={HIPAA_SAFEGUARDS} meId={me.id} meName={me.name} />;
}
