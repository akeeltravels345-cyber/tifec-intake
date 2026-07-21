import Link from "next/link";
import { getCurrentClinician } from "@/lib/auth";
import { listDemoRecords } from "@/lib/demoCleanup";
import LogoutButton from "@/components/LogoutButton";
import IdleLogout from "@/components/IdleLogout";
import CleanupClient from "./CleanupClient";

export const dynamic = "force-dynamic";

// Admin-only. Lists ONLY records whose client name carries the "(DEMO)" marker,
// so the admin's PHI-free boundary is preserved: real clients never appear here.
export default async function CleanupPage() {
  const me = await getCurrentClinician();

  if (!me?.admin) {
    return (
      <div className="container container-narrow">
        <div className="card">
          <h2 className="section-title">Admins only</h2>
          <p className="muted">This page is available to practice administrators.</p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const records = await listDemoRecords();

  return (
    <div className="container">
      <IdleLogout />
      <div className="detail-topbar no-print">
        <Link href="/admin" className="back-link" style={{ margin: 0 }}>← Admin</Link>
        <LogoutButton />
      </div>

      <div className="card">
        <h1 className="who" style={{ fontSize: 22, marginBottom: 4 }}>Demo data cleanup</h1>
        <p className="section-desc" style={{ margin: 0 }}>
          Removes seeded test clients after a demo. For your safety this screen lists{" "}
          <strong>only records whose name contains &ldquo;(DEMO)&rdquo;</strong>. Real client records are never shown
          here and cannot be deleted from this page, even on accounts that hold live clients.
        </p>
        <p className="section-desc" style={{ marginTop: 10, marginBottom: 0 }}>
          Deletion is permanent and is written to the access audit log.
        </p>
      </div>

      <CleanupClient records={records} />
    </div>
  );
}
