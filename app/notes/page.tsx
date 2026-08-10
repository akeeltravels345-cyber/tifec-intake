import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingUser, isBiller, devMode } from "@/lib/billingRole";
import { isSystemAdmin, getClinician } from "@/lib/clinicians";
import { listClients } from "@/lib/clients";
import { listNotesForClient, NOTES_ENABLED } from "@/lib/sessionNotes";
import { getSidebarData } from "@/lib/sidebarData";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import SessionNotes from "@/components/billing/SessionNotes";

export const dynamic = "force-dynamic";

/** A clinician's session-notes workspace: pick a client, read + write SOAP notes.
 *  Clinicians only — the biller and system admin never see clinical content. */
export default async function NotesPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  if (!NOTES_ENABLED) redirect("/today");
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/notes");
  if (isBiller(user.role) || isSystemAdmin(user.clinician)) redirect("/today");

  const sp = await searchParams;
  const [sidebar, clients] = await Promise.all([getSidebarData(user.clinician), listClients(user.clinician.id)]);
  const roster = [...clients].sort((a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`));
  const activeId = sp.client && roster.some((c) => c.id === sp.client) ? sp.client! : roster[0]?.id;
  const active = roster.find((c) => c.id === activeId);
  const today = new Date().toISOString().slice(0, 10);

  const notes = active
    ? (await listNotesForClient(active.id)).map((n) => ({ id: n.id, clinicianId: n.clinicianId, author: getClinician(n.clinicianId)?.name ?? "Clinician", noteDate: n.noteDate, soap: n.soap, updatedAt: n.updatedAt }))
    : [];

  return (
    <div className="biz">
      <UnifiedSidebar data={sidebar} isDev={devMode()} />
      <main className="bo-main">
        <div className="su-topbar"><h1 className="su-h1">Session notes</h1><p className="su-sub">Your clients&apos; encrypted SOAP notes. Pick a client, then read or write.</p></div>

        {roster.length === 0 ? (
          <div className="bq-empty" style={{ padding: 28 }}><div className="big">No clients yet</div><div className="small">Once you&apos;ve seen a client, they&apos;ll appear here to note on.</div></div>
        ) : (
          <div className="notes-layout">
            <aside className="notes-clients">
              <div className="bo-lab" style={{ marginBottom: 8 }}>Clients</div>
              {roster.map((c) => (
                <Link key={c.id} href={`/notes?client=${c.id}`} className={`notes-clientlink ${c.id === activeId ? "on" : ""}`}>
                  {c.last}, {c.first}
                </Link>
              ))}
            </aside>
            <section className="notes-main">
              {active && (
                <>
                  <div className="notes-clienthead">
                    <h2 className="su-sech" style={{ margin: 0 }}>{active.first} {active.last}</h2>
                    <Link href={`/billing/clients/${active.id}`} className="su-link">Open full chart →</Link>
                  </div>
                  <SessionNotes clientId={active.id} notes={notes} meId={user.clinician.id} today={today} />
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
