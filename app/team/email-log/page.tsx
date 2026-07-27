import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician } from "@/lib/clinicians";
import { listEmailLog } from "@/lib/comms";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  notice: "Notice", ticket_new: "Ticket raised", ticket_reply: "Ticket reply", ticket_resolved: "Ticket resolved", message: "Message",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function EmailLogPage() {
  const me = await getCurrentClinician();
  if (!me) redirect("/login?next=/team/email-log");
  // Oversight only — the owner and the practice admin.
  if (!me.admin) redirect("/team/notices");

  const log = await listEmailLog(200);
  const sent = log.filter((l) => l.status === "sent").length;
  const failed = log.filter((l) => l.status !== "sent").length;

  return (
    <>
      <div className="tm-head">
        <div>
          <h1 className="tm-h1">Email delivery</h1>
          <p className="tm-sub">Every team email the system tried to send, and whether it went. <Link href="/team/notices" className="tm-editlink">← Notices</Link></p>
        </div>
        <div className="el-tally"><span className="ok">{sent} sent</span>{failed > 0 && <span className="bad">{failed} not sent</span>}</div>
      </div>

      <div className="tm-card" style={{ padding: 0, overflow: "hidden" }}>
        {log.length === 0 ? (
          <div className="tm-empty" style={{ padding: 24 }}><div className="big">No emails logged yet</div><div className="small">Post a notice or raise a ticket and each send will appear here.</div></div>
        ) : (
          <div className="su-tblwrap">
            <table className="su-tbl" style={{ minWidth: 620 }}>
              <thead><tr><th>When</th><th>Type</th><th>Recipient</th><th>Status</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td className="su-hint">{when(l.createdAt)}</td>
                    <td>{KIND_LABEL[l.kind] ?? l.kind}</td>
                    <td className="nm">{getClinician(l.recipientId)?.name ?? l.recipientId}<span className="su-hint"> · {l.recipientEmail || "no address"}</span></td>
                    <td>
                      <span className={`el-status ${l.status}`}>{l.status === "sent" ? "Sent" : l.status === "skipped" ? "Skipped" : "Not sent"}</span>
                      {l.detail && l.status !== "sent" && <span className="su-hint"> · {l.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
