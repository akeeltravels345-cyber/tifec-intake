"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientProfile } from "@/lib/clients";
import type { LinkedIntake } from "@/lib/intakeLink";
import { referralStatus, chargeAfterReferral } from "@/lib/referral";

const randId = () => Math.random().toString(36).slice(2, 10);

export interface Activity {
  id: string; date: string; clinician: string; codes: string[]; codeLabel: string;
  insurer: string; total: number; copay: number;
  stage: "self" | "logged" | "billed" | "paid"; paidDate: string | null; billedDate: string | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSize = (n?: number) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const noteWhen = (iso: string) => { const d = iso.slice(0, 10); const t = iso.slice(11, 16); return t ? `${d} ${t}` : d; };
const STAGE: Record<Activity["stage"], { label: string; cls: string }> = {
  self: { label: "Self-pay", cls: "self" },
  logged: { label: "To bill", cls: "logged" },
  billed: { label: "Awaiting payment", cls: "billed" },
  paid: { label: "Paid", cls: "paid" },
};

export default function ClientDetail({
  id, first, last, insurerId, profile, seenBy, insurers, clinicians = [], activity, canEdit, canDelete = false, today = "", intakeForms = [], currentUserId = "", currentUserRole = "clinician",
}: {
  id: string; first: string; last: string; insurerId: string | null;
  profile: ClientProfile; seenBy: string[];
  insurers: { id: string; name: string }[]; clinicians?: { id: string; name: string }[];
  activity: Activity[]; canEdit: boolean; canDelete?: boolean; today?: string;
  intakeForms?: LinkedIntake[]; currentUserId?: string; currentUserRole?: string;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [delCharge, setDelCharge] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  // add-charge form
  const [acDate, setAcDate] = useState("");
  const [acClin, setAcClin] = useState(clinicians[0]?.id ?? "");
  const [acInsurer, setAcInsurer] = useState(insurerId ?? "");
  const [acAmount, setAcAmount] = useState("");
  const [acStage, setAcStage] = useState<"tobill" | "awaiting" | "paid">("awaiting");

  async function deleteClientNow() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete.");
      router.push("/billing/clients"); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete."); setBusy(false); }
  }
  async function deleteChargeNow(sid: string) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/sessions/${sid}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete.");
      setDelCharge(null); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete."); }
    finally { setBusy(false); }
  }
  async function addChargeNow() {
    if (!acDate || !acAmount) { setMsg("Enter a date and amount for the charge."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}/charges`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId: acClin, dateOfService: acDate, insurerId: acInsurer || null, totalCost: Number(acAmount) || 0, stage: acStage }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not add.");
      setShowAdd(false); setAcDate(""); setAcAmount(""); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add."); }
    finally { setBusy(false); }
  }
  const activityTotal = activity.reduce((t, a) => t + a.total, 0);
  const canManageCharges = canDelete || clinicians.length > 0;

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
  const [relationship, setRelationship] = useState(profile.insurance?.relationship ?? "self");
  const [insuredFirst, setInsuredFirst] = useState(profile.insurance?.insuredFirst ?? "");
  const [insuredLast, setInsuredLast] = useState(profile.insurance?.insuredLast ?? "");
  const [insuredDob, setInsuredDob] = useState(profile.insurance?.insuredDob ?? "");
  const [dx, setDx] = useState((profile.diagnosis ?? []).join(", "));
  // referral
  const [refSource, setRefSource] = useState(profile.referral?.source ?? "");
  const [refAuth, setRefAuth] = useState(profile.referral?.authNumber ?? "");
  const [refStart, setRefStart] = useState(profile.referral?.startDate ?? "");
  const [refEnd, setRefEnd] = useState(profile.referral?.endDate ?? "");
  const [refSessions, setRefSessions] = useState(profile.referral?.sessions ? String(profile.referral.sessions) : "");
  // documents (edited live; add/remove sync back the returned list)
  const [docs, setDocs] = useState(profile.documents ?? []);
  const [ndName, setNdName] = useState("");
  const [ndKind, setNdKind] = useState("referral");
  const [ndUrl, setNdUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // shared cross-role notes
  const [notes, setNotes] = useState(profile.notes ?? []);
  const [noteText, setNoteText] = useState("");
  const canModerate = currentUserRole === "owner" || currentUserRole === "admin";

  // Assemble the WHOLE profile from state — every PATCH must send it complete,
  // or fields it omits get wiped. `documents` can be overridden (add/remove).
  function buildProfile(documents = docs): ClientProfile {
    return {
      dob: dob || undefined,
      sex: (sex || undefined) as ClientProfile["sex"],
      phone: phone || undefined,
      address: (line1 || city || region || postal || country || line2)
        ? { line1: line1 || undefined, line2: line2 || undefined, city: city || undefined, region: region || undefined, postal: postal || undefined, country: country || undefined }
        : undefined,
      insurance: (memberId || relationship !== "self" || insuredFirst || insuredLast || insuredDob)
        ? { memberId: memberId || undefined, relationship: relationship as NonNullable<ClientProfile["insurance"]>["relationship"], insuredFirst: insuredFirst || undefined, insuredLast: insuredLast || undefined, insuredDob: insuredDob || undefined }
        : undefined,
      diagnosis: dx.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      referral: (refSource || refAuth || refStart || refEnd || refSessions)
        ? { source: refSource || undefined, authNumber: refAuth || undefined, startDate: refStart || undefined, endDate: refEnd || undefined, sessions: refSessions ? Number(refSessions) : undefined }
        : undefined,
      documents,
    };
  }
  async function patchProfile(nextProfile: ClientProfile, done?: () => void) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insurerId: ins || null, profile: nextProfile }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      done?.(); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  const save = () => patchProfile(buildProfile(), () => { setMsg("Saved."); setEdit(false); });
  function addDocument() {
    if (!ndName.trim()) { setMsg("Give the document a name."); return; }
    const next = [...docs, { id: randId(), name: ndName.trim(), kind: ndKind, url: ndUrl.trim() || undefined, addedAt: today || new Date().toISOString().slice(0, 10) }];
    setDocs(next); setNdName(""); setNdUrl("");
    patchProfile(buildProfile(next));
  }
  async function uploadFile() {
    if (!file) { setMsg("Choose a file to upload."); return; }
    setBusy(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", ndName.trim() || file.name);
      fd.append("kind", ndKind);
      const res = await fetch(`/api/billing/clients/${id}/documents`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed.");
      setDocs(j.documents); setFile(null); setNdName(""); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  async function removeDocument(doc: { id: string; stored?: boolean }) {
    setBusy(true); setMsg("");
    try {
      if (doc.stored) {
        const res = await fetch(`/api/billing/clients/${id}/documents/${doc.id}`, { method: "DELETE" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Could not remove.");
        setDocs(j.documents); router.refresh();
      } else {
        const next = docs.filter((d) => d.id !== doc.id);
        setDocs(next);
        await patchProfile(buildProfile(next));
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not remove."); }
    finally { setBusy(false); }
  }
  async function addNote() {
    if (!noteText.trim()) { setMsg("Write something first."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not add note.");
      setNotes(j.notes); setNoteText(""); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add note."); }
    finally { setBusy(false); }
  }
  async function removeNote(noteId: string) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}/notes?noteId=${noteId}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not remove note.");
      setNotes(j.notes); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not remove note."); }
    finally { setBusy(false); }
  }
  const referral = referralStatus(profile.referral?.endDate, today);
  const refDays = referral.daysLeft;

  // Only insured (non self-pay) entries can go on a CMS-1500.
  const billable = activity.filter((a) => a.stage !== "self");
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = billable.length > 0 && billable.every((a) => sel.has(a.id));
  const toggleAll = () => setSel((s) => { if (allSelected) return new Set(); const n = new Set(s); billable.forEach((a) => n.add(a.id)); return n; });
  const generateSelected = () => { if (sel.size) router.push(`/billing/clients/batch?sessions=${[...sel].join(",")}`); };
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
          {canDelete && <button className="cd-danger" onClick={() => setConfirmDel(true)}>Delete client</button>}
        </div>
      </div>

      {confirmDel && (
        <div className="cd-confirm">
          <span>Delete <b>{first} {last}</b> and all {activity.length} charge{activity.length === 1 ? "" : "s"}? This can&apos;t be undone.</span>
          <div style={{ flex: 1 }} />
          <button className="cd-danger" disabled={busy} onClick={deleteClientNow}>{busy ? "Deleting…" : "Yes, delete client"}</button>
          <button className="su-del" disabled={busy} onClick={() => setConfirmDel(false)}>Cancel</button>
        </div>
      )}

      {msg && <div className="ls-saved" style={{ margin: "0 0 14px" }}>{msg}</div>}

      {/* ---- Referral status (payment-critical) ---- */}
      <div className={`cd-ref ${referral.state}`}>
        <div className="cd-refrow">
          <span className="cd-reflab">Referral</span>
          {referral.state === "none" ? (
            <span className="cd-refval">No referral on file — add one so claims stay payable.</span>
          ) : referral.state === "expired" ? (
            <span className="cd-refval"><b>Expired {profile.referral?.endDate}</b> — coverage has ended; sessions after this date can&apos;t be billed.</span>
          ) : (
            <span className="cd-refval">
              Covered for <b>{refDays} more day{refDays === 1 ? "" : "s"}</b> · until <b>{profile.referral?.endDate}</b>
            </span>
          )}
          {profile.referral?.source && <span className="cd-reffrom">from {profile.referral.source}{profile.referral.authNumber ? ` · #${profile.referral.authNumber}` : ""}{profile.referral.sessions ? ` · ${profile.referral.sessions} sessions` : ""}</span>}
        </div>
        {canEdit && !edit && <button className="su-del" onClick={() => setEdit(true)}>{referral.state === "none" ? "Add referral" : referral.state === "valid" ? "Update" : "Renew referral"}</button>}
      </div>
      {(referral.state === "expiring" || referral.state === "expired") && (
        <div className={`cd-refprompt ${referral.state}`}>
          ⚠ {referral.state === "expiring"
            ? <>This referral ends in <b>{refDays} day{refDays === 1 ? "" : "s"}</b> ({profile.referral?.endDate}). Apply for a new referral now so {first}&apos;s coverage doesn&apos;t lapse — sessions after the end date can&apos;t be billed.</>
            : <>This referral has <b>expired</b>. Apply for a new referral before billing further sessions for {first}.</>}
          {canEdit && !edit && <button className="cd-refprompt-btn" onClick={() => setEdit(true)}>Renew referral</button>}
        </div>
      )}

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
            {field("Relationship to insured", <select className="ls-in" value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)}><option value="self">Self</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="other">Other</option></select>)}
            {relationship !== "self" && <>
              {field("Insured first name", <input className="ls-in" value={insuredFirst} onChange={(e) => setInsuredFirst(e.target.value)} />)}
              {field("Insured last name", <input className="ls-in" value={insuredLast} onChange={(e) => setInsuredLast(e.target.value)} />)}
              {field("Insured date of birth", <input type="date" className="ls-in" value={insuredDob} onChange={(e) => setInsuredDob(e.target.value)} />)}
            </>}
            {field("Diagnosis (ICD-10, comma-separated)", <input className="ls-in" placeholder="e.g. F41.1, F32.1" value={dx} onChange={(e) => setDx(e.target.value)} />)}
            <div className="cd-refhead">Referral <span className="cd-refhint">the window claims can be billed in — after the end date they can&apos;t be paid</span></div>
            {field("Referring provider", <input className="ls-in" value={refSource} onChange={(e) => setRefSource(e.target.value)} />)}
            {field("Referral / auth number", <input className="ls-in" value={refAuth} onChange={(e) => setRefAuth(e.target.value)} />)}
            {field("Valid from", <input type="date" className="ls-in" value={refStart} onChange={(e) => setRefStart(e.target.value)} />)}
            {field("Valid until (end date)", <input type="date" className="ls-in" value={refEnd} onChange={(e) => setRefEnd(e.target.value)} />)}
            {field("Sessions authorised", <input type="number" min="0" step="1" className="ls-in" value={refSessions} onChange={(e) => setRefSessions(e.target.value)} />)}
            <div className="cd-refupload-hint">📎 Upload the referral letter itself in <b>Documents</b> below — it&apos;s stored securely on this record. The end date above flags the clinician 30 days before it lapses.</div>
            <div className="cd-save">
              <button className="ls-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save record"}</button>
              <button className="su-del" disabled={busy} onClick={() => { setEdit(false); setMsg(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Documents ---- */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Documents</h2>
          <span className="su-hint">The intake form (linked from the intake system), the referral letter, and anything else for this client.</span></div>

        {intakeForms.length > 0 && (
          <div className="su-card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="cd-fl" style={{ marginBottom: 8 }}>From the intake system</div>
            <div className="cd-doclist">
              {intakeForms.map((f) => (
                <div className="cd-doc" key={f.token}>
                  <span className="cd-dockind intake">intake</span>
                  {currentUserId === f.clinicianId
                    ? <Link href={`/submissions/${f.token}`} className="cd-docname">{f.formLabel}</Link>
                    : <span className="cd-docname" style={{ color: "var(--ink,#1c2330)" }}>{f.formLabel}</span>}
                  <span className="su-hint">{f.clinicianName} · {f.status}{currentUserId !== f.clinicianId ? " · clinician only" : ""}</span>
                  <span className="cd-docdate">{f.createdAt.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="su-card" style={{ padding: 16 }}>
          {docs.length === 0 ? (
            <p className="su-hint" style={{ margin: "0 0 12px" }}>No documents yet.</p>
          ) : (
            <div className="cd-doclist">
              {docs.map((d) => {
                const href = d.stored ? `/api/billing/clients/${id}/documents/${d.id}` : d.url;
                return (
                  <div className="cd-doc" key={d.id}>
                    <span className={`cd-dockind ${d.kind}`}>{d.kind}</span>
                    {href
                      ? <a href={href} target="_blank" rel="noopener noreferrer" className="cd-docname">{d.stored ? "⬇ " : ""}{d.name}</a>
                      : <span className="cd-docname">{d.name}</span>}
                    {d.stored && <span className="cd-docmeta">file{d.size ? ` · ${fmtSize(d.size)}` : ""}</span>}
                    <span className="cd-docdate">{d.addedAt}</span>
                    {canEdit && <button className="cd-xbtn" title="Remove document" disabled={busy} onClick={() => removeDocument(d)}>×</button>}
                  </div>
                );
              })}
            </div>
          )}
          {canEdit && (
            <div className="cd-docadd-group">
              <div className="cd-docadd">
                <select className="ls-in" value={ndKind} onChange={(e) => setNdKind(e.target.value)}>
                  <option value="referral">Referral</option>
                  <option value="intake">Intake form</option>
                  <option value="other">Other</option>
                </select>
                <input className="ls-in" placeholder="Name (optional)" value={ndName} onChange={(e) => setNdName(e.target.value)} />
              </div>
              <div className="cd-docadd">
                <label className="cd-filepick">
                  <input type="file" style={{ display: "none" }} disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <span>{file ? `📄 ${file.name}` : "Choose a file to upload…"}</span>
                </label>
                <button className="su-add" disabled={busy || !file} onClick={uploadFile}>{busy ? "Uploading…" : "Upload file"}</button>
              </div>
              <div className="cd-docadd">
                <input className="ls-in" placeholder="…or paste a link (URL)" value={ndUrl} onChange={(e) => setNdUrl(e.target.value)} />
                <button className="su-add" disabled={busy || !ndName.trim()} onClick={addDocument}>Add link</button>
              </div>
              <p className="su-hint" style={{ margin: "8px 2px 0" }}>Files up to 4&nbsp;MB (PDF, image, or Word) are stored securely, encrypted, on this record. Larger files can be added as a link.</p>
            </div>
          )}
        </div>
      </div>

      {/* ---- Shared notes (all roles) ---- */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Notes</h2>
          <span className="su-hint">Shared across everyone who works this record — clinicians, biller, owner, admin. Add benefits, authorisations, calls with the insurer, anything the team should see. (Private clinical notes stay separate.)</span></div>
        <div className="su-card" style={{ padding: 16 }}>
          {notes.length === 0 ? (
            <p className="su-hint" style={{ margin: "0 0 12px" }}>No notes yet.</p>
          ) : (
            <div className="cd-notelist">
              {[...notes].reverse().map((n) => (
                <div className="cd-note" key={n.id}>
                  <div className="cd-noterow">
                    <span className="cd-noteauthor">{n.authorName}</span>
                    <span className={`cd-noterole ${n.role}`}>{n.role}</span>
                    <span className="cd-notedate">{noteWhen(n.addedAt)}</span>
                    {(n.authorId === currentUserId || canModerate) && (
                      <button className="cd-xbtn" title="Delete note" disabled={busy} onClick={() => removeNote(n.id)}>×</button>
                    )}
                  </div>
                  <div className="cd-notetext">{n.text}</div>
                </div>
              ))}
            </div>
          )}
          <div className="cd-noteadd">
            <textarea className="ls-in" rows={2} placeholder="Add a note for the team…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <button className="su-add" disabled={busy || !noteText.trim()} onClick={addNote}>{busy ? "Saving…" : "Add note"}</button>
          </div>
        </div>
      </div>

      {/* ---- Activity ---- */}
      <div className="su-sec">
        <div className="su-sechead">
          <h2 className="su-sech">Appointments &amp; charges{activity.length > 0 && <span className="su-tag">{money(activityTotal)} total</span>}</h2>
          <span className="su-hint">Every date of service that makes up this client&apos;s total. {billable.length ? "Tick the ones you're claiming to build a CMS-1500, " : ""}or add and remove charges below.</span>
        </div>

        {sel.size > 0 && (
          <div className="cd-selbar">
            <span>{sel.size} entr{sel.size === 1 ? "y" : "ies"} selected · {money(billable.filter((a) => sel.has(a.id)).reduce((t, a) => t + a.total, 0))}</span>
            <div style={{ flex: 1 }} />
            <button className="bl-cta" onClick={generateSelected}>Generate CMS-1500 from selected</button>
            <button className="su-del" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        )}

        {canManageCharges && (
          <div style={{ marginBottom: 10 }}>
            {!showAdd ? (
              <button className="su-add" onClick={() => setShowAdd(true)}>+ Add a charge (date of service)</button>
            ) : (
              <div className="cd-addform">
                <div className="cd-addrow">
                  <label>Date of service<input type="date" className="ls-in" value={acDate} onChange={(e) => setAcDate(e.target.value)} /></label>
                  {clinicians.length > 1 && <label>Clinician<select className="ls-in" value={acClin} onChange={(e) => setAcClin(e.target.value)}>{clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
                  <label>Insurer<select className="ls-in" value={acInsurer} onChange={(e) => setAcInsurer(e.target.value)}><option value="">Self-pay</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                  <label>Amount<input type="number" step="0.01" min="0" className="ls-in" placeholder="0.00" value={acAmount} onChange={(e) => setAcAmount(e.target.value)} /></label>
                  <label>Stage<select className="ls-in" value={acStage} onChange={(e) => setAcStage(e.target.value as typeof acStage)}><option value="tobill">To bill</option><option value="awaiting">Awaiting payment</option><option value="paid">Paid</option></select></label>
                </div>
                {chargeAfterReferral(acDate, profile.referral?.endDate) && (
                  <p className="cd-refwarn">⚠ This date is after the referral ends ({profile.referral?.endDate}) — it won&apos;t be paid.</p>
                )}
                <div className="cd-addbtns">
                  <button className="ls-save" disabled={busy} onClick={addChargeNow}>{busy ? "Adding…" : "Add charge"}</button>
                  <button className="su-del" disabled={busy} onClick={() => { setShowAdd(false); setMsg(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="su-card">
          {activity.length === 0 ? (
            <div className="bq-empty" style={{ padding: 24 }}><div className="big">No charges yet</div><div className="small">Add a date of service above, or they&apos;ll appear here once logged.</div></div>
          ) : (
            <div className="su-tblwrap">
              <table className="su-tbl" style={{ minWidth: 700 }}>
                <thead><tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all billable entries" /></th>
                  <th>Date</th><th>Clinician</th><th>Service</th><th>Insurer</th><th className="num">Fee</th><th>Status</th>
                  {canManageCharges && <th></th>}
                </tr></thead>
                <tbody>
                  {activity.map((a) => {
                    const claimable = a.stage !== "self";
                    return (
                      <tr key={a.id} className={sel.has(a.id) ? "cd-selrow" : ""}>
                        <td><input type="checkbox" checked={sel.has(a.id)} disabled={!claimable} onChange={() => toggleSel(a.id)} title={claimable ? undefined : "Self-pay visits don't go on a CMS-1500"} aria-label={`Select ${a.date}`} /></td>
                        <td className="nm">{a.date}</td>
                        <td className="su-hint">{a.clinician}</td>
                        <td>{a.codes.join(", ") || "—"}{a.codeLabel && <span className="su-hint"> · {a.codeLabel}</span>}</td>
                        <td>{a.insurer}</td>
                        <td className="num">{money(a.total)}</td>
                        <td>
                          <span className={`cd-stage ${STAGE[a.stage].cls}`}>{STAGE[a.stage].label}{a.stage === "paid" && a.paidDate ? ` ${a.paidDate}` : ""}</span>
                          {chargeAfterReferral(a.date, profile.referral?.endDate) && <span className="cd-afterref" title="Date of service is after the referral end date — this won't be paid">⚠ after referral</span>}
                        </td>
                        {canManageCharges && (
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {delCharge === a.id ? (
                              <>
                                <button className="cd-danger sm" disabled={busy} onClick={() => deleteChargeNow(a.id)}>Delete</button>
                                <button className="su-del sm" disabled={busy} onClick={() => setDelCharge(null)}>Cancel</button>
                              </>
                            ) : (
                              <button className="cd-xbtn" title="Delete this charge" onClick={() => setDelCharge(a.id)}>×</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="num" style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{money(activityTotal)}</td><td colSpan={canManageCharges ? 2 : 1}></td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
