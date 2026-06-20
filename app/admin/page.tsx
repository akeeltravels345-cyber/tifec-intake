import Link from "next/link";
import { getCurrentClinician } from "@/lib/auth";
import { CLINICIANS, getClinician } from "@/lib/clinicians";
import { listUserIds } from "@/lib/users";
import {
  listSubmissions,
  listAccessLog,
  pruneAccessLog,
  getSubmissionsByClinician,
} from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";
import IdleLogout from "@/components/IdleLogout";
import AdminClient, { type ClinicianAdminInfo } from "./AdminClient";

export const dynamic = "force-dynamic";

// The admin role is oversight-only: counts, logins, and the activity log.
// It never decrypts or displays client intake answers (PHI / minimum-necessary).

function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => w && !/^(dr|mrs|mr|ms|miss)\.?$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name[0] || "?").toUpperCase();
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const me = await getCurrentClinician();
  const expected = process.env.ADMIN_PASSWORD;
  const sessionAdmin = me?.admin === true;
  const bootstrapOk = !!expected && key === expected;

  // Access gate
  if (!sessionAdmin && !bootstrapOk) {
    return (
      <div className="container container-narrow">
        <div className="card">
          <div className="page-head">
            <div className="avatar">★</div>
            <div>
              <div className="greeting">Practice Admin</div>
              <h1 className="who">Admin access</h1>
            </div>
          </div>
          <p className="section-desc" style={{ marginTop: 18, marginBottom: 0 }}>
            {me
              ? "Your account doesn't have admin access. Ask a practice admin to enable it."
              : "Sign in with an admin account to oversee the practice."}{" "}
            {!me && <Link href="/login?next=/admin">Sign in →</Link>}
          </p>
        </div>
      </div>
    );
  }

  const withLogin = new Set(await listUserIds());
  const clinicianInfos: ClinicianAdminInfo[] = await Promise.all(
    CLINICIANS.map(async (c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      hasLogin: withLogin.has(c.id),
      submissionCount: (await getSubmissionsByClinician(c.id)).length,
    }))
  );
  const withLoginCount = clinicianInfos.filter((c) => c.hasLogin).length;

  // ---- Bootstrap mode (URL key, not a logged-in admin): logins only, no PHI ----
  if (!sessionAdmin) {
    return (
      <div className="container">
        <div className="card">
          <div className="page-head">
            <div className="avatar">★</div>
            <div>
              <div className="greeting">Practice Admin · Setup</div>
              <h1 className="who">Clinician logins</h1>
              <p className="who-sub">{withLoginCount} of {clinicianInfos.length} have an active login</p>
            </div>
          </div>
          <p className="section-desc" style={{ marginTop: 16, marginBottom: 0 }}>
            Bootstrap mode. Set passwords here, then sign in as an admin for full oversight.
          </p>
        </div>
        <AdminClient clinicians={clinicianInfos} adminKey={key ?? ""} />
      </div>
    );
  }

  // ---- Full admin oversight (logged-in admin) ----
  const all = await listSubmissions();
  const counts = {
    new: all.filter((r) => r.status === "new").length,
    reviewed: all.filter((r) => r.status === "reviewed").length,
    archived: all.filter((r) => r.status === "archived").length,
    total: all.length,
  };
  // Per-clinician breakdown.
  const perClinician = CLINICIANS.map((c) => {
    const subs = all.filter((r) => r.clinician_id === c.id);
    return {
      id: c.id,
      name: c.name,
      new: subs.filter((r) => r.status === "new").length,
      reviewed: subs.filter((r) => r.status === "reviewed").length,
      archived: subs.filter((r) => r.status === "archived").length,
      total: subs.length,
    };
  });

  // Retention: drop audit entries older than ~2 years before showing the latest.
  await pruneAccessLog(730);
  const audit = await listAccessLog(10);

  return (
    <div className="container">
      <IdleLogout />
      <div className="card">
        <div className="page-head">
          <div className="avatar">{me ? initials(me.name) : "★"}</div>
          <div>
            <div className="greeting">Practice Admin</div>
            <h1 className="who">Oversight</h1>
            <p className="who-sub">Submission counts, logins, and activity - no client data</p>
          </div>
          <div className="head-actions">
            <Link href="/dashboard" className="link-btn">My dashboard</Link>
            <LogoutButton />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat s-new"><div className="stat-num">{counts.new}</div><div className="stat-label">New</div></div>
        <div className="stat s-reviewed"><div className="stat-num">{counts.reviewed}</div><div className="stat-label">Reviewed</div></div>
        <div className="stat s-archived"><div className="stat-num">{counts.archived}</div><div className="stat-label">Archived</div></div>
        <div className="stat s-total"><div className="stat-num">{counts.total}</div><div className="stat-label">Total</div></div>
      </div>

      <div className="card">
        <h2 className="section-title">By clinician</h2>
        <p className="section-desc">Submission counts per clinician.</p>
        <div className="clin-table-wrap">
          <table className="clin-table">
            <thead>
              <tr>
                <th>Clinician</th>
                <th>New</th>
                <th>Reviewed</th>
                <th>Archived</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {perClinician.map((c) => (
                <tr key={c.id}>
                  <td className="clin-cell-name">{c.name}</td>
                  <td><span className="clin-pill clin-pill-new">{c.new}</span></td>
                  <td><span className="clin-pill clin-pill-reviewed">{c.reviewed}</span></td>
                  <td><span className="clin-pill">{c.archived}</span></td>
                  <td className="clin-cell-total">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Recent activity</h2>
        <p className="section-desc">Audit log - the 10 most recent views or changes.</p>
        {audit.length === 0 ? (
          <p className="muted">No activity recorded yet.</p>
        ) : (
          audit.map((e) => (
            <div className="answer-row" key={e.id}>
              <div className="a" style={{ fontSize: 14 }}>
                <strong>{getClinician(e.clinician_id)?.name ?? e.clinician_id}</strong> {e.detail}
              </div>
              <div className="q">{new Date(e.at).toLocaleString("en-US")}</div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Clinician logins</h2>
        <p className="section-desc">{withLoginCount} of {clinicianInfos.length} clinicians have an active login. Create or reset passwords below.</p>
      </div>
      <AdminClient clinicians={clinicianInfos} adminKey="" />
    </div>
  );
}
