"use client";

// LOCAL DEV ONLY. Rendered only when devMode() is true (never in production).
// Flips the billing role/identity by setting cookies the server reads, so you can
// jump between the Owner, Clinician, and Biller dashboards without logging in.
import type { BillingRole } from "@/lib/billingRole";

interface ClinRef { id: string; name: string; }

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export default function DevBar({ role, meId, clinicians, ownerId }: { role: BillingRole; meId: string; clinicians: ClinRef[]; ownerId: string }) {
  function apply(nextRole: BillingRole, asId?: string) {
    setCookie("dev_role", nextRole);
    if (asId) setCookie("dev_as", asId);
    window.location.href = "/billing";
  }

  return (
    <div className="dev-bar">
      <span className="dev-tag">DEV</span>
      <span className="dev-label">View as</span>
      <div className="dev-btns">
        <button className={role === "owner" ? "on" : ""} onClick={() => apply("owner", ownerId)}>Owner</button>
        <button className={role === "biller" ? "on" : ""} onClick={() => apply("biller")}>Biller</button>
        <span className={`dev-clin ${role === "clinician" ? "on" : ""}`}>
          <button onClick={() => apply("clinician", meId && role !== "owner" ? meId : clinicians[0]?.id)}>Clinician</button>
          {role === "clinician" && (
            <select value={meId} onChange={(e) => apply("clinician", e.target.value)} aria-label="Which clinician">
              {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </span>
      </div>
      <span className="dev-hint">no login needed locally</span>
    </div>
  );
}
