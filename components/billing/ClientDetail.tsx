"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientProfile } from "@/lib/clients";

export interface Activity {
  id: string; date: string; clinician: string; codes: string[]; codeLabel: string;
  insurer: string; total: number; copay: number;
  stage: "self" | "logged" | "billed" | "paid"; paidDate: string | null; billedDate: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STAGE: Record<Activity["stage"], { label: string; cls: string }> = {
  self: { label: "Self-pay", cls: "self" },
  logged: { label: "To bill", cls: "logged" },
  billed: { label: "Awaiting payment", cls: "billed" },
  paid: { label: "Paid", cls: "paid" },
};

export default function ClientDetail({
  id, first, last, insurerId, profile, seenBy, insurers, activity, canEdit,
}: {
  id: string; first: string; last: string; insurerId: string | null;
  profile: ClientProfile; seenBy: string[];
  insurers: { id: string; name: string }[]; activity: Activity[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Flat form state mirrors the nested profile; assembled back on save.
  const [ins, setIns] = useState(insurerId ?? "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [line1, setLine1] = useState(profile.address?.line1 ?? "");
  const [line2, setLine2] = useState(profile.address?.line2 ?? "");
  const [city, setCity] = useState(profile.address?.city ?? "");
  const [region, setRegion] = useState(profile.address?.region ?? "");
  const [postal, setPostal] = useState(profile.address?.postal ?? "");
  const [country, setCountry] = useState(profile.address?.country ?? "");
  const [memberId, setMemberId] = useState(profile.insurance?.memberId ?? "");
  const [groupNo, setGroupNo] = useState(profile.insurance?.groupNo ?? "");
  const [planName, setPlanName] = useState(profile.insurance?.planName ?? "");
  const [relationship, setRelationship] = useState(profile.insurance?.relationship ?? "self");
  const [insuredFirst, setInsuredFirst] = useState(profile.insurance?.insuredFirst ?? "");
  const [insuredLast, setInsuredLast] = useState(profile.insurance?.insuredLast ?? "");
  const [insuredDob, setInsuredDob] = useState(profile.insurance?.insuredDob ?? "");
  const [dx, setDx] = useState((profile.diagnosis ?? []).join(", "));

  async function save() {
    setBusy(true); setMsg("");
    const nextProfile: ClientProfile = {
      dob: dob || undefined,
      sex: (sex || undefined) as ClientProfile["sex"],
      phone: phone || undefined,
      address: (line1 || city || region || postal || country || line2)
        ? { line1: line1 || undefined, line2: line2 || undefined, city: city || undefined, region: region || undefined, postal: postal || undefined, country: country || undefined }
        : undefined,
      insurance: (memberId || groupNo || planName || relationship !== "self" || insuredFirst || insuredLast || insuredDob)
        ? { memberId: memberId || undefined, groupNo: groupNo || undefined, planName: planName || undefined, relationship: relationship as NonNullable<ClientProfile["insurance"]>["relationship"], insuredFirst: insuredFirst || undefined, insuredLast: insuredLast || undefined, insuredDob: insuredDob || undefined }
        : undefined,
      diagnosis: dx.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    };
    try {
      const res = await fetch(`/api/billing/clients/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insurerId: ins || null, profile: nextProfile }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setMsg("Saved."); setEdit(false); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }

  const billable = activity.filter((a) => a.stage !== "self");
  const field = (label: string, node: React.ReactNode) => (
    <div className="cd-f"><span className="cd-fl">{label}</span>{node}</div>
  );
  const val = (v: string) => (v ? <span className="cd-v">{v}</span> : <span className="cd-v muted">—</span>);

  return (
    <div className="cd-wrap">
      <div className="cd-head">
        <div>
          <h1 className="cd-name">{first} {last}</h1>
          <div className="cd-sub">
            {profile.dob ? `Born ${profile.dob}` : "No date of birth on file"}
            {seenBy.length > 0 && <> · seen by {seenBy.join(", ")}</>}
          </div>
        </div>
        <div className="cd-actions">
          <a className="bl-cta" href={`/billing/clients/${id}/cms1500`}>Generate CMS-1500</a>
          {canEdit && !edit && <button className="su-del" onClick={() => setEdit(true)}>Edit details</button>}
        </div>
      </div>

      {msg && <div className="ls-saved" style={{ margin: "0 0 14px" }}>{msg}</div>}

      {/* ---- Record ---- */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Client record</h2>
          <span className="su-hint">Everything a CMS-1500 claim needs. Fill in what you have.</span></div>

        {!edit ? (
          <div className="su-card cd-grid">
            {field("Date of birth", val(profile.dob ?? ""))}
            {field("Sex", val(profile.sex ?? ""))}
            {field("Phone", val(profile.phone ?? ""))}
            {field("Address", val([profile.address?.line1, profile.address?.line2, profile.address?.city, profile.address?.region, profile.address?.postal, profile.address?.country].filter(Boolean).join(", ")))}
            {field("Usual insurer", val(insurers.find((i) => i.id === insurerId)?.name ?? (insurerId ? "" : "Self-pay")))}
            {field("Member / ID no.", val(profile.insurance?.memberId ?? ""))}
            {field("Group no.", val(profile.insurance?.groupNo ?? ""))}
            {field("Plan name", val(profile.insurance?.planName ?? ""))}
            {field("Relationship to insured", val(profile.insurance?.relationship ?? "self"))}
            {profile.insurance?.relationship && profile.insurance.relationship !== "self" &&
              field("Insured", val([profile.insurance?.insuredFirst, profile.insurance?.insuredLast, profile.insurance?.insuredDob].filter(Boolean).join(" ")))}
            {field("Diagnosis (ICD-10)", val((profile.diagnosis ?? []).join(", ")))}
          </div>
        ) : (
          <div className="su-card cd-grid">
            {field("Date of birth", <input type="date" className="ls-in" value={dob} onChange={(e) => setDob(e.target.value)} />)}
            {field("Sex", <select className="ls-in" value={sex} onChange={(e) => setSex(e.target.value)}><option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="U">Unknown</option></select>)}
            {field("Phone", <input className="ls-in" value={phone} onChange={(e) => setPhone(e.target.value)} />)}
            {field("Usual insurer", <select className="ls-in" value={ins} onChange={(e) => setIns(e.target.value)}><option value="">Self-pay</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>)}
            {field("Address line 1", <input className="ls-in" value={line1} onChange={(e) => setLine1(e.target.value)} />)}
            {field("Address line 2", <input className="ls-in" value={line2} onChange={(e) => setLine2(e.target.value)} />)}
            {field("City", <input className="ls-in" value={city} onChange={(e) => setCity(e.target.value)} />)}
            {field("District / region", <input className="ls-in" value={region} onChange={(e) => setRegion(e.target.value)} />)}
            {field("Postal code", <input className="ls-in" value={postal} onChange={(e) => setPostal(e.target.value)} />)}
            {field("Country", <input className="ls-in" value={country} onChange={(e) => setCountry(e.target.value)} />)}
            {field("Member / ID no.", <input className="ls-in" value={memberId} onChange={(e) => setMemberId(e.target.value)} />)}
            {field("Group no.", <input className="ls-in" value={groupNo} onChange={(e) => setGroupNo(e.target.value)} />)}
            {field("Plan name", <input className="ls-in" value={planName} onChange={(e) => setPlanName(e.target.value)} />)}
            {field("Relationship to insured", <select className="ls-in" value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)}><option value="self">Self</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="other">Other</option></select>)}
            {relationship !== "self" && <>
              {field("Insured first name", <input className="ls-in" value={insuredFirst} onChange={(e) => setInsuredFirst(e.target.value)} />)}
              {field("Insured last name", <input className="ls-in" value={insuredLast} onChange={(e) => setInsuredLast(e.target.value)} />)}
              {field("Insured date of birth", <input type="date" className="ls-in" value={insuredDob} onChange={(e) => setInsuredDob(e.target.value)} />)}
            </>}
            {field("Diagnosis (ICD-10, comma-separated)", <input className="ls-in" placeholder="e.g. F41.1, F32.1" value={dx} onChange={(e) => setDx(e.target.value)} />)}
            <div className="cd-save">
              <button className="ls-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save record"}</button>
              <button className="su-del" disabled={busy} onClick={() => { setEdit(false); setMsg(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Activity ---- */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Everything logged with this client</h2>
          <span className="su-hint">{activity.length} session{activity.length === 1 ? "" : "s"}{billable.length ? ` · ${billable.length} billable` : ""}</span></div>
        <div className="su-card">
          {activity.length === 0 ? (
            <div className="bq-empty" style={{ padding: 24 }}><div className="big">No sessions logged yet</div></div>
          ) : (
            <div className="su-tblwrap">
              <table className="su-tbl" style={{ minWidth: 620 }}>
                <thead><tr><th>Date</th><th>Clinician</th><th>Service</th><th>Insurer</th><th className="num">Fee</th><th>Status</th></tr></thead>
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td className="nm">{a.date}</td>
                      <td className="su-hint">{a.clinician}</td>
                      <td>{a.codes.join(", ") || "—"}{a.codeLabel && <span className="su-hint"> · {a.codeLabel}</span>}</td>
                      <td>{a.insurer}</td>
                      <td className="num">{money(a.total)}</td>
                      <td><span className={`cd-stage ${STAGE[a.stage].cls}`}>{STAGE[a.stage].label}{a.stage === "paid" && a.paidDate ? ` ${a.paidDate}` : ""}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
