"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientProfile } from "@/lib/clients";
import Icd10Section from "./Icd10Section";
import type { LinkedIntake } from "@/lib/intakeLink";
import { referralStatus, chargeAfterReferral } from "@/lib/referral";
import DobInput from "./DobInput";
import Foldable from "./Foldable";
import { collapseUnits, codeSummary } from "@/lib/cptUnits";

const randId = () => Math.random().toString(36).slice(2, 10);

export interface Activity {
  id: string; date: string; clinician: string; codes: string[]; codeLabel: string;
  insurer: string; insurerId: string | null; total: number; copay: number; copayDue: number;
  stage: "self" | "logged" | "billed" | "paid" | "writeoff" | "writedown"; paidDate: string | null; billedDate: string | null;
  selfPayStatus?: "owing" | "waived" | null; selfPayOwed?: number; insuranceCollected?: number | null;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtSize = (n?: number) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const noteWhen = (iso: string) => { const d = iso.slice(0, 10); const t = iso.slice(11, 16); return t ? `${d} ${t}` : d; };
const STAGE: Record<Activity["stage"], { label: string; cls: string }> = {
  self: { label: "Self-pay", cls: "self" },
  logged: { label: "To bill", cls: "logged" },
  billed: { label: "Awaiting payment", cls: "billed" },
  paid: { label: "Collected", cls: "paid" },
  writeoff: { label: "Write-off", cls: "paid" },
  writedown: { label: "Write-down", cls: "paid" },
};

export default function ClientDetail({
  id, first, last, insurerId, profile, seenBy, insurers, clinicians = [], activity, canEdit, canDelete = false, today = "", intakeForms = [], currentUserId = "", currentUserRole = "clinician", cptCodes = [],
}: {
  id: string; first: string; last: string; insurerId: string | null;
  profile: ClientProfile; seenBy: string[];
  insurers: { id: string; name: string }[]; clinicians?: { id: string; name: string }[];
  activity: Activity[]; canEdit: boolean; canDelete?: boolean; today?: string;
  intakeForms?: LinkedIntake[]; currentUserId?: string; currentUserRole?: string;
  cptCodes?: { code: string; description: string; fee: number }[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [delCharge, setDelCharge] = useState<string | null>(null);
  // Inline edit of a logged charge (fix a mistake).
  const [editCharge, setEditCharge] = useState<string | null>(null);
  const [ecDate, setEcDate] = useState("");
  const [ecTotal, setEcTotal] = useState("");
  const [ecInsurer, setEcInsurer] = useState("");
  const [ecCopay, setEcCopay] = useState("");
  const [ecDue, setEcDue] = useState("");
  const [ecStage, setEcStage] = useState<"tobill" | "awaiting" | "paid" | "writeoff" | "writedown">("awaiting");
  // For a write-off / write-down: the amount, and whether it's the collected cash
  // or the adjusted-off amount (the biller can enter either).
  const [ecAdjAmt, setEcAdjAmt] = useState("");
  const [ecAdjMode, setEcAdjMode] = useState<"collected" | "adjusted">("adjusted");
  const [ecBilled, setEcBilled] = useState("");
  const [ecPaid, setEcPaid] = useState("");
  const [ecSelfPay, setEcSelfPay] = useState<"paid" | "owing" | "waived">("paid");
  const [ecCodes, setEcCodes] = useState<string[]>([]);
  const cptFee = (code: string) => cptCodes.find((c) => c.code === code)?.fee ?? 0;
  const cptLabel = (code: string) => { const c = cptCodes.find((x) => x.code === code); return c ? `${c.code} · ${c.description}` : code; };
  const [showAdd, setShowAdd] = useState(false);
  // add-charge form
  const [acDate, setAcDate] = useState("");
  const [acClin, setAcClin] = useState(clinicians[0]?.id ?? "");
  const [acInsurer, setAcInsurer] = useState(insurerId ?? "");
  const [acAmount, setAcAmount] = useState("");
  const [acCodes, setAcCodes] = useState<string[]>([]);
  const [acPaidDate, setAcPaidDate] = useState(today);
  const [acStage, setAcStage] = useState<"tobill" | "awaiting" | "paid">("awaiting");
  // Bulk-edit: apply one change to every selected charge at once.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStage, setBulkStage] = useState<"keep" | "tobill" | "awaiting" | "paid">("keep");
  const [bulkInsurer, setBulkInsurer] = useState("keep"); // "keep" | "self" | insurerId
  const [bulkDate, setBulkDate] = useState(""); // "" = keep; YYYY-MM-DD to move all selected to that date

  async function deleteClientNow() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete.");
      router.push("/billing/clients"); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not delete."); setBusy(false); }
  }
  function startEditCharge(a: Activity) {
    setDelCharge(null);
    setEditCharge(a.id);
    setEcDate(a.date);
    setEcTotal(String(a.total));
    setEcInsurer(a.insurerId ?? "");
    setEcCopay(String(a.copay));
    setEcDue(String(a.copayDue));
    setEcStage(a.stage === "writeoff" || a.stage === "writedown" ? a.stage : a.stage === "paid" ? "paid" : a.stage === "billed" ? "awaiting" : "tobill");
    setEcBilled(a.billedDate ?? "");
    setEcPaid(a.paidDate ?? "");
    setEcSelfPay(a.selfPayStatus === "owing" ? "owing" : a.selfPayStatus === "waived" ? "waived" : "paid");
    // Seed the adjustment amount from the stored collected amount (as the "adjusted" figure).
    const billedIns = round2(Math.max(0, (a.total || 0) - (a.copayDue || 0)));
    setEcAdjMode("adjusted");
    setEcAdjAmt(a.insuranceCollected != null ? String(round2(Math.max(0, billedIns - a.insuranceCollected))) : "");
    setEcCodes(a.codes ?? []);
  }
  // Re-suggest the fee as the sum over the (possibly repeated) code array; the
  // clinician can still override the Fee field afterwards.
  function resuggestFee(next: string[]) {
    if (cptCodes.length) {
      const sum = next.reduce((s, c) => s + cptFee(c), 0);
      if (sum > 0) setEcTotal(String(round2(sum)));
    }
  }
  // Add a code (one unit) or remove a code entirely. Codes may repeat = units.
  function toggleEcCode(code: string, on: boolean) {
    setEcCodes((prev) => {
      const next = on ? [...prev, code] : prev.filter((c) => c !== code);
      resuggestFee(next);
      return next;
    });
  }
  // Nudge a code's unit count up (+1 occurrence) or down (remove one occurrence).
  function bumpEcCode(code: string, delta: number) {
    setEcCodes((prev) => {
      const next = [...prev];
      if (delta > 0) next.push(code);
      else { const i = next.lastIndexOf(code); if (i >= 0) next.splice(i, 1); }
      resuggestFee(next);
      return next;
    });
  }
  // The same CPT picker on the ADD-a-charge form, auto-suggesting the Amount.
  function resuggestAcFee(next: string[]) {
    if (cptCodes.length) { const sum = next.reduce((s, c) => s + cptFee(c), 0); if (sum > 0) setAcAmount(String(round2(sum))); }
  }
  function toggleAcCode(code: string, on: boolean) {
    setAcCodes((prev) => { const next = on ? [...prev, code] : prev.filter((c) => c !== code); resuggestAcFee(next); return next; });
  }
  function bumpAcCode(code: string, delta: number) {
    setAcCodes((prev) => {
      const next = [...prev];
      if (delta > 0) next.push(code);
      else { const i = next.lastIndexOf(code); if (i >= 0) next.splice(i, 1); }
      resuggestAcFee(next);
      return next;
    });
  }
  // The insurance billed to the payer on the currently-edited charge.
  const ecBilledInsurance = round2(Math.max(0, (Number(ecTotal) || 0) - (Number(ecDue) || 0)));
  // For a write-off/write-down, resolve the cash collected from what the biller typed.
  const ecInsuranceCollected = () => {
    const amt = Number(ecAdjAmt) || 0;
    const collected = ecAdjMode === "collected" ? amt : ecBilledInsurance - amt;
    return round2(Math.min(ecBilledInsurance, Math.max(0, collected)));
  };
  async function saveEditCharge(sid: string) {
    if (!ecDate || ecTotal === "") { setMsg("Enter a date and amount."); return; }
    setBusy(true); setMsg("");
    try {
      const adjusting = ecInsurer && (ecStage === "writeoff" || ecStage === "writedown");
      const res = await fetch(`/api/billing/sessions/${sid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateOfService: ecDate, totalCost: Number(ecTotal) || 0,
          insurerId: ecInsurer || null,
          copayCollected: ecInsurer ? Number(ecCopay) || 0 : (ecSelfPay === "owing" ? Number(ecCopay) || 0 : 0),
          copayDue: ecInsurer ? Number(ecDue) || 0 : 0,
          stage: ecInsurer ? ecStage : "paid",
          selfPayStatus: ecInsurer ? null : (ecSelfPay === "paid" ? null : ecSelfPay),
          billedDate: ecBilled || null,
          paidDate: ecPaid || null,
          insuranceCollected: adjusting ? ecInsuranceCollected() : null,
          cptCodes: ecCodes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save.");
      setEditCharge(null); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
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
    if (acStage === "paid" && !acPaidDate) { setMsg("Enter the date the payment was collected."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/billing/clients/${id}/charges`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicianId: acClin, dateOfService: acDate, insurerId: acInsurer || null, totalCost: Number(acAmount) || 0, stage: acStage, cptCodes: acCodes, ...(acStage === "paid" ? { paidDate: acPaidDate } : {}) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not add.");
      setShowAdd(false); setAcDate(""); setAcAmount(""); setAcCodes([]); setAcPaidDate(today); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add."); }
    finally { setBusy(false); }
  }
  async function applyBulk() {
    const ids = [...sel];
    if (!ids.length) return;
    const patch: Record<string, unknown> = {};
    if (bulkStage !== "keep") patch.stage = bulkStage;
    if (bulkInsurer !== "keep") patch.insurerId = bulkInsurer === "self" ? null : bulkInsurer;
    if (bulkDate) patch.dateOfService = bulkDate;
    if (Object.keys(patch).length === 0) { setMsg("Choose what to change first."); return; }
    setBusy(true); setMsg("");
    try {
      const results = await Promise.all(ids.map((sid) =>
        fetch(`/api/billing/sessions/${sid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      ));
      const failed = results.filter((r) => !r.ok).length;
      if (failed) throw new Error(`${failed} of ${ids.length} couldn't be changed.`);
      setMsg(`Updated ${ids.length} charge${ids.length === 1 ? "" : "s"}.`);
      setBulkOpen(false); setBulkStage("keep"); setBulkInsurer("keep"); setBulkDate(""); setSel(new Set());
      router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not apply the change."); }
    finally { setBusy(false); }
  }
  const activityTotal = activity.reduce((t, a) => t + a.total, 0);
  const canManageCharges = canDelete || clinicians.length > 0;

  // Flat form state mirrors the nested profile; assembled back on save.
  const [ins, setIns] = useState(insurerId ?? "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [email, setEmail] = useState(profile.email ?? "");
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
      email: email.trim() || undefined,
      address: (line1 || city || region || postal || country || line2)
        ? { line1: line1 || undefined, line2: line2 || undefined, city: city || undefined, region: region || undefined, postal: postal || undefined, country: country || undefined }
        : undefined,
      insurance: (memberId || relationship !== "self" || insuredFirst || insuredLast || insuredDob)
        ? { memberId: memberId || undefined, relationship: relationship as NonNullable<ClientProfile["insurance"]>["relationship"], insuredFirst: insuredFirst || undefined, insuredLast: insuredLast || undefined, insuredDob: insuredDob || undefined }
        : undefined,
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

  // Insured entries → CMS-1500 claim; self-pay entries (paid in full by the
  // client) → invoice. Both are selectable; the action bar offers whichever
  // generator matches what's ticked.
  const billable = activity.filter((a) => a.stage !== "self");
  const selfPayEntries = activity.filter((a) => a.stage === "self");
  const hasInsured = billable.length > 0;
  const hasSelfPay = selfPayEntries.length > 0;
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = activity.length > 0 && activity.every((a) => sel.has(a.id));
  const toggleAll = () => setSel((s) => { if (allSelected) return new Set(); const n = new Set(s); activity.forEach((a) => n.add(a.id)); return n; });
  const selInsuredIds = billable.filter((a) => sel.has(a.id)).map((a) => a.id);
  const selSelfIds = selfPayEntries.filter((a) => sel.has(a.id)).map((a) => a.id);
  const generateSelectedClaims = () => { if (selInsuredIds.length) router.push(`/billing/clients/batch?sessions=${selInsuredIds.join(",")}`); };
  const generateSelectedInvoice = () => { if (selSelfIds.length) router.push(`/billing/clients/${id}/invoice?sessions=${selSelfIds.join(",")}`); };
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
          {hasInsured && <a className="bl-cta" href={`/billing/clients/${id}/cms1500`}>Generate CMS-1500</a>}
          {hasSelfPay && <a className="bl-cta" href={`/billing/clients/${id}/invoice`}>Generate invoice</a>}
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
            {field("Email", val(profile.email ?? ""))}
            {field("Address", val([profile.address?.line1, profile.address?.line2, profile.address?.city, profile.address?.region, profile.address?.postal, profile.address?.country].filter(Boolean).join(", ")))}
            {field("Usual insurer", val(insurers.find((i) => i.id === insurerId)?.name ?? (insurerId ? "" : "Self-pay")))}
            {field("Member / ID no.", val(profile.insurance?.memberId ?? ""))}
            {field("Relationship to insured", val(profile.insurance?.relationship ?? "self"))}
            {profile.insurance?.relationship && profile.insurance.relationship !== "self" &&
              field("Insured", val([profile.insurance?.insuredFirst, profile.insurance?.insuredLast, profile.insurance?.insuredDob].filter(Boolean).join(" ")))}
          </div>
        ) : (
          <div className="su-card cd-grid">
            {field("Date of birth", <DobInput value={dob} onChange={setDob} />)}
            {field("Sex", <select className="ls-in" value={sex} onChange={(e) => setSex(e.target.value)}><option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="U">Unknown</option></select>)}
            {field("Phone", <input className="ls-in" value={phone} onChange={(e) => setPhone(e.target.value)} />)}
            {field("Email", <input className="ls-in" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />)}
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
              {field("Insured date of birth", <DobInput value={insuredDob} onChange={setInsuredDob} />)}
            </>}
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

      {/* ---- Diagnoses ---- */}
      <div className="su-sec">
        <div className="su-sechead"><h2 className="su-sech">Diagnoses</h2>
          <span className="su-hint">The client&apos;s ICD-10 diagnoses (CMS-1500 box 21). Anyone on the record can edit; every add and removal is logged.</span></div>
        <div className="su-card" style={{ padding: 16 }}>
          <Icd10Section clientId={id} initial={profile.diagnosis ?? []} initialLog={profile.diagnosisLog ?? []} />
        </div>
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
                  <span className="cd-docdate">{(f.createdAt || "").slice(0, 10)}</span>
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
          <span className="su-hint">Every date of service that makes up this client&apos;s total. Tick insured visits to build a CMS-1500, or self-pay visits to build an invoice. Add and remove charges below.</span>
        </div>

        {sel.size > 0 && (
          <>
          <div className="cd-selbar">
            <span>{sel.size} entr{sel.size === 1 ? "y" : "ies"} selected · {money(activity.filter((a) => sel.has(a.id)).reduce((t, a) => t + a.total, 0))}</span>
            <div style={{ flex: 1 }} />
            {selInsuredIds.length > 0 && <button className="bl-cta" onClick={generateSelectedClaims}>CMS-1500 ({selInsuredIds.length})</button>}
            {selSelfIds.length > 0 && <button className="bl-cta" onClick={generateSelectedInvoice}>Invoice ({selSelfIds.length})</button>}
            {canManageCharges && <button className="su-add" onClick={() => setBulkOpen((o) => !o)}>Change selected…</button>}
            <button className="su-del" onClick={() => { setSel(new Set()); setBulkOpen(false); }}>Clear</button>
          </div>
          {bulkOpen && canManageCharges && (
            <div className="cd-addform" style={{ marginBottom: 12 }}>
              <div className="cd-addrow">
                <label>Set status<select className="ls-in" value={bulkStage} onChange={(e) => setBulkStage(e.target.value as typeof bulkStage)}>
                  <option value="keep">Keep as is</option>
                  <option value="tobill">To bill</option>
                  <option value="awaiting">Awaiting payment</option>
                  <option value="paid">Collected</option>
                </select></label>
                <label>Set insurer<select className="ls-in" value={bulkInsurer} onChange={(e) => setBulkInsurer(e.target.value)}>
                  <option value="keep">Keep as is</option>
                  <option value="self">Self-pay</option>
                  {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select></label>
                <label>Set date of service<input type="date" className="ls-in" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} /></label>
              </div>
              <p className="su-hint" style={{ margin: "2px 2px 8px" }}>Applies the changes you pick to all {sel.size} selected charge{sel.size === 1 ? "" : "s"}. &ldquo;Keep as is&rdquo; (or a blank date) leaves that field untouched. Setting a date moves every selected charge to that same day.</p>
              <div className="cd-addbtns">
                <button className="ls-save" disabled={busy} onClick={applyBulk}>{busy ? "Applying…" : `Apply to ${sel.size}`}</button>
                <button className="su-del" disabled={busy} onClick={() => setBulkOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          </>
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
                  <label>Stage<select className="ls-in" value={acStage} onChange={(e) => setAcStage(e.target.value as typeof acStage)}><option value="tobill">To bill</option><option value="awaiting">Awaiting payment</option><option value="paid">Collected</option></select></label>
                  {acStage === "paid" && <label>Collected date<input type="date" className="ls-in" value={acPaidDate} max={today} onChange={(e) => setAcPaidDate(e.target.value)} title="When the payment actually came in — this books it to the right month" /></label>}
                </div>
                {cptCodes.length > 0 && (
                  <div className="cd-editcodes">
                    <span className="cd-lab">Service codes <span className="opt">sets the amount and builds the CMS-1500</span></span>
                    <div className="cd-codechips">
                      {acCodes.length === 0 && <span className="cd-nocodes">No codes yet</span>}
                      {collapseUnits(acCodes).map(({ code, units }) => (
                        <span className="cd-codechip" key={code} title={cptLabel(code)}>
                          {code}
                          <span className="cd-qty">
                            <button type="button" className="qb" aria-label={`Fewer units of ${code}`} onClick={() => bumpAcCode(code, -1)} disabled={units <= 1}>−</button>
                            <span className="qn">×{units}</span>
                            <button type="button" className="qb" aria-label={`More units of ${code}`} onClick={() => bumpAcCode(code, 1)}>+</button>
                          </span>
                          <button type="button" className="cx" aria-label={`Remove ${code}`} onClick={() => toggleAcCode(code, false)}>×</button>
                        </span>
                      ))}
                    </div>
                    <select className="ls-in" value="" onChange={(e) => { if (e.target.value) toggleAcCode(e.target.value, true); }}>
                      <option value="">+ Add a code…</option>
                      {cptCodes.filter((c) => !acCodes.includes(c.code)).map((c) => (
                        <option key={c.code} value={c.code}>{c.code} · {c.description} ({money(c.fee)})</option>
                      ))}
                    </select>
                  </div>
                )}
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
            <Foldable unit="charges">
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
                      <Fragment key={a.id}>
                      <tr className={sel.has(a.id) ? "cd-selrow" : ""}>
                        <td><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} title={claimable ? "Insured, goes on a CMS-1500" : "Self-pay, goes on an invoice"} aria-label={`Select ${a.date}`} /></td>
                        <td className="nm">{a.date}</td>
                        <td className="su-hint">{a.clinician}</td>
                        <td>{codeSummary(a.codes) || "—"}{a.codeLabel && <span className="su-hint"> · {a.codeLabel}</span>}</td>
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
                            ) : editCharge === a.id ? (
                              <button className="su-del sm" disabled={busy} onClick={() => setEditCharge(null)}>Close</button>
                            ) : (
                              <>
                                <button className="cd-editbtn" title="Edit this charge" onClick={() => startEditCharge(a)}>✎</button>
                                <button className="cd-xbtn" title="Delete this charge" onClick={() => setDelCharge(a.id)}>×</button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                      {editCharge === a.id && (
                        <tr className="cd-editrow">
                          <td colSpan={canManageCharges ? 8 : 7}>
                            <div className="cd-editform">
                              <label>Date<input type="date" className="ls-in" value={ecDate} onChange={(e) => setEcDate(e.target.value)} /></label>
                              <label>Fee<input type="number" step="0.01" min="0" className="ls-in" value={ecTotal} onChange={(e) => setEcTotal(e.target.value)} /></label>
                              {cptCodes.length > 0 && (
                                <div className="cd-editcodes">
                                  <span className="cd-lab">Service codes <span className="opt">changing these re-suggests the fee</span></span>
                                  <div className="cd-codechips">
                                    {ecCodes.length === 0 && <span className="cd-nocodes">No codes yet</span>}
                                    {collapseUnits(ecCodes).map(({ code, units }) => (
                                      <span className="cd-codechip" key={code} title={cptLabel(code)}>
                                        {code}
                                        <span className="cd-qty">
                                          <button type="button" className="qb" aria-label={`Fewer units of ${code}`} onClick={() => bumpEcCode(code, -1)} disabled={units <= 1}>−</button>
                                          <span className="qn">×{units}</span>
                                          <button type="button" className="qb" aria-label={`More units of ${code}`} onClick={() => bumpEcCode(code, 1)}>+</button>
                                        </span>
                                        <button type="button" className="cx" aria-label={`Remove ${code}`} onClick={() => toggleEcCode(code, false)}>×</button>
                                      </span>
                                    ))}
                                  </div>
                                  <select className="ls-in" value="" onChange={(e) => { if (e.target.value) toggleEcCode(e.target.value, true); }}>
                                    <option value="">+ Add a code…</option>
                                    {cptCodes.filter((c) => !ecCodes.includes(c.code)).map((c) => (
                                      <option key={c.code} value={c.code}>{c.code} · {c.description} ({money(c.fee)})</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <label>Insurer<select className="ls-in" value={ecInsurer} onChange={(e) => setEcInsurer(e.target.value)}><option value="">Self-pay</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                              {!ecInsurer && <>
                                <label>Was it paid?<select className="ls-in" value={ecSelfPay} onChange={(e) => setEcSelfPay(e.target.value as typeof ecSelfPay)}><option value="paid">Paid in full</option><option value="owing">Owing</option><option value="waived">Waived</option></select></label>
                                {ecSelfPay === "owing" && <label>Collected so far<input type="number" step="0.01" min="0" className="ls-in" value={ecCopay} onChange={(e) => setEcCopay(e.target.value)} /></label>}
                                {ecSelfPay !== "waived" && <label>Paid date <span className="opt">when collected</span><input type="date" className="ls-in" value={ecPaid} max={today} onChange={(e) => setEcPaid(e.target.value)} title="When the self-pay money was collected — set independently of the date of service" /></label>}
                              </>}
                              {ecInsurer && <>
                                <label>Co-pay due<input type="number" step="0.01" min="0" className="ls-in" value={ecDue} onChange={(e) => setEcDue(e.target.value)} /></label>
                                <label>Co-pay collected<input type="number" step="0.01" min="0" className="ls-in" value={ecCopay} onChange={(e) => setEcCopay(e.target.value)} /></label>
                                <label>Status<select className="ls-in" value={ecStage} onChange={(e) => setEcStage(e.target.value as typeof ecStage)}><option value="tobill">To bill</option><option value="awaiting">Awaiting payment</option><option value="paid">Collected</option><option value="writeoff">Contractual write-off</option><option value="writedown">Write down</option></select></label>
                                {ecStage !== "tobill" && <label>Billed date<input type="date" className="ls-in" value={ecBilled} max={today} onChange={(e) => setEcBilled(e.target.value)} title="When this claim was submitted to the insurer — back-date to the real date if needed" /></label>}
                                {ecStage === "paid" && <label>Paid date<input type="date" className="ls-in" value={ecPaid} max={today} onChange={(e) => setEcPaid(e.target.value)} title="When the insurer actually settled — this drives the payout month" /></label>}
                                {(ecStage === "writeoff" || ecStage === "writedown") && <>
                                  <label>Amount is<select className="ls-in" value={ecAdjMode} onChange={(e) => setEcAdjMode(e.target.value as typeof ecAdjMode)}><option value="adjusted">{ecStage === "writeoff" ? "Written off" : "Written down"}</option><option value="collected">Collected</option></select></label>
                                  <label>{ecAdjMode === "adjusted" ? (ecStage === "writeoff" ? "Written off" : "Written down") : "Collected"}<input type="number" step="0.01" min="0" className="ls-in" value={ecAdjAmt} onChange={(e) => setEcAdjAmt(e.target.value)} placeholder="0.00" /></label>
                                  <label>Settled date<input type="date" className="ls-in" value={ecPaid} max={today} onChange={(e) => setEcPaid(e.target.value)} title="When this claim was settled — drives the month it lands in" /></label>
                                  <div className="cd-adjnote">Of {money(ecBilledInsurance)} billed: collected <b>{money(ecInsuranceCollected())}</b>, {ecStage === "writeoff" ? "written off" : "written down"} <b>{money(round2(ecBilledInsurance - ecInsuranceCollected()))}</b>. Only the collected part pays out; the rest tracks in its own bucket, not with waived co-pays.</div>
                                </>}
                              </>}
                              <div className="cd-editactions">
                                <button className="ls-save sm" disabled={busy} onClick={() => saveEditCharge(a.id)}>{busy ? "Saving…" : "Save change"}</button>
                                <button className="su-del sm" disabled={busy} onClick={() => setEditCharge(null)}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="num" style={{ fontWeight: 700 }}>Total</td><td className="num" style={{ fontWeight: 700 }}>{money(activityTotal)}</td><td colSpan={canManageCharges ? 2 : 1}></td></tr>
                </tfoot>
              </table>
            </div>
            </Foldable>
          )}
        </div>
      </div>
    </div>
  );
}
