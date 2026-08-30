"use client";

import { useState } from "react";
import type { AppointmentType, AppointmentMode } from "@/lib/scheduling";

interface CptOpt { code: string; description: string; }
interface FormOpt { key: string; label: string; }

const MODE_LABEL: Record<AppointmentMode, string> = { in_person: "In person", virtual: "Virtual", either: "Either" };
const COLORS = ["#2f8e93", "#2e3192", "#3f8f5f", "#c2841d", "#b1543c", "#7a4fa3", "#3b7ea1", "#8a8f2f"];
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Draft = Omit<AppointmentType, "id" | "createdAt" | "updatedAt"> & { id?: string };
const blank = (): Draft => ({
  name: "", category: "", durationMin: 50, bufferBeforeMin: 0, bufferAfterMin: 0, price: 0,
  color: COLORS[0], mode: "in_person", baselineCptCodes: [], intakeFormKey: null,
  newClientIntakeOnly: true, active: true, sortOrder: 0,
});

export default function AppointmentTypesManager({ initial, cptCodes, formOptions }: {
  initial: AppointmentType[]; cptCodes: CptOpt[]; formOptions: FormOpt[];
}) {
  const [types, setTypes] = useState<AppointmentType[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function post(action: string, payload: Record<string, unknown>) {
    setErr("");
    const res = await fetch("/api/scheduling/types", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Something went wrong."); return null; }
    return data;
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setErr("Give the appointment type a name."); return; }
    setBusy(true);
    const action = draft.id ? "update" : "create";
    const data = await post(action, draft as Record<string, unknown>);
    setBusy(false);
    if (!data) return;
    const t = data.type as AppointmentType;
    setTypes((ts) => draft.id ? ts.map((x) => (x.id === t.id ? t : x)) : [...ts, t]);
    setDraft(null);
  }

  async function del(t: AppointmentType) {
    if (!confirm(`Delete "${t.name}"? Existing appointments keep their details.`)) return;
    setTypes((ts) => ts.filter((x) => x.id !== t.id));
    await post("delete", { id: t.id });
  }

  async function toggleActive(t: AppointmentType) {
    setTypes((ts) => ts.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)));
    await post("update", { id: t.id, active: !t.active });
  }

  async function move(t: AppointmentType, dir: -1 | 1) {
    const i = types.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= types.length) return;
    const next = types.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setTypes(next);
    await post("reorder", { orderedIds: next.map((x) => x.id) });
  }

  const addCode = (code: string) => { if (code && draft && !draft.baselineCptCodes.includes(code)) set("baselineCptCodes", [...draft.baselineCptCodes, code]); };
  const codeLabel = (code: string) => { const c = cptCodes.find((x) => x.code === code); return c ? `${c.code} · ${c.description}` : code; };

  return (
    <div className="st">
      <div className="st-head">
        <div>
          <h1 className="st-h1">Appointment types</h1>
          <p className="st-sub">What clients can book, and how each one maps into intake and billing.</p>
        </div>
        {!draft && <button className="st-add" onClick={() => setDraft(blank())}>+ New type</button>}
      </div>

      {err && <p className="st-err">{err}</p>}

      {draft && (
        <div className="st-editor">
          <div className="st-erow">
            <label className="st-f grow"><span>Name</span>
              <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Individual therapy" autoFocus /></label>
            <label className="st-f"><span>Category</span>
              <input value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Therapy" /></label>
          </div>

          <div className="st-erow">
            <label className="st-f"><span>Duration (min)</span>
              <input type="number" min={5} step={5} value={draft.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} /></label>
            <label className="st-f"><span>Buffer before</span>
              <input type="number" min={0} step={5} value={draft.bufferBeforeMin} onChange={(e) => set("bufferBeforeMin", Number(e.target.value))} /></label>
            <label className="st-f"><span>Buffer after</span>
              <input type="number" min={0} step={5} value={draft.bufferAfterMin} onChange={(e) => set("bufferAfterMin", Number(e.target.value))} /></label>
            <label className="st-f"><span>Price (KYD)</span>
              <input type="number" min={0} step={5} value={draft.price} onChange={(e) => set("price", Number(e.target.value))} /></label>
          </div>

          <div className="st-erow">
            <div className="st-f"><span>Mode</span>
              <div className="st-seg">
                {(["in_person", "virtual", "either"] as AppointmentMode[]).map((m) => (
                  <button key={m} type="button" className={draft.mode === m ? "on" : ""} onClick={() => set("mode", m)}>{MODE_LABEL[m]}</button>
                ))}
              </div>
            </div>
            <div className="st-f"><span>Calendar colour</span>
              <div className="st-swatches">
                {COLORS.map((c) => (
                  <button key={c} type="button" className={`st-sw ${draft.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => set("color", c)} aria-label={c} />
                ))}
              </div>
            </div>
          </div>

          <div className="st-erow">
            <div className="st-f grow"><span>Baseline billing codes <em>(editable on the session later)</em></span>
              <div className="st-chips">
                {draft.baselineCptCodes.map((code) => (
                  <span key={code} className="st-chip">{codeLabel(code)}<button type="button" onClick={() => set("baselineCptCodes", draft.baselineCptCodes.filter((c) => c !== code))}>×</button></span>
                ))}
                <select className="st-addcode" value="" onChange={(e) => { addCode(e.target.value); e.target.value = ""; }}>
                  <option value="">+ Add a code…</option>
                  {cptCodes.filter((c) => !draft.baselineCptCodes.includes(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} · {c.description}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="st-erow">
            <label className="st-f grow"><span>Intake form</span>
              <select value={draft.intakeFormKey ?? ""} onChange={(e) => set("intakeFormKey", e.target.value || null)}>
                <option value="">No form</option>
                {formOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            {draft.intakeFormKey && (
              <label className="st-check"><input type="checkbox" checked={draft.newClientIntakeOnly} onChange={(e) => set("newClientIntakeOnly", e.target.checked)} /> New clients only</label>
            )}
          </div>

          <div className="st-actions">
            <label className="st-check"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> Active (bookable)</label>
            <span className="st-sp" />
            <button className="st-btn" onClick={() => { setDraft(null); setErr(""); }}>Cancel</button>
            <button className="st-btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create type"}</button>
          </div>
        </div>
      )}

      <div className="st-list">
        {types.length === 0 && !draft && <p className="st-empty">No appointment types yet. Add your first one to get started.</p>}
        {types.map((t, i) => (
          <div key={t.id} className={`st-card ${t.active ? "" : "off"}`}>
            <span className="st-color" style={{ background: t.color }} />
            <div className="st-main" onClick={() => setDraft({ ...t })}>
              <div className="st-name">{t.name}{t.category && <span className="st-cat">{t.category}</span>}{!t.active && <span className="st-inactive">inactive</span>}</div>
              <div className="st-meta">
                <span>{t.durationMin} min</span>
                <span>{MODE_LABEL[t.mode]}</span>
                {t.price > 0 && <span>{money(t.price)}</span>}
                {t.baselineCptCodes.length > 0 && <span className="st-tag bil">{t.baselineCptCodes.join(", ")}</span>}
                {t.intakeFormKey && <span className="st-tag int">intake{t.newClientIntakeOnly ? " · new" : ""}</span>}
              </div>
            </div>
            <div className="st-rowbtns">
              <button title="Move up" disabled={i === 0} onClick={() => move(t, -1)}>↑</button>
              <button title="Move down" disabled={i === types.length - 1} onClick={() => move(t, 1)}>↓</button>
              <button title={t.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(t)}>{t.active ? "◉" : "○"}</button>
              <button title="Delete" className="del" onClick={() => del(t)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
