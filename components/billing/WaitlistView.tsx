"use client";

import { useState } from "react";
import type { WaitlistEntry, WaitStatus } from "@/lib/scheduling";

interface Row extends WaitlistEntry { typeName: string; clinicianName: string; }

export default function WaitlistView({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);

  async function set(id: string, status: WaitStatus) {
    setRows((rs) => status === "booked" || status === "removed" ? rs.filter((r) => r.id !== id) : rs.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch("/api/scheduling/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  }
  const ago = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86400e3); return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`; };

  return (
    <div className="wl2">
      <div className="wl2-head">
        <h1 className="wl2-h1">Waitlist</h1>
        <p className="wl2-sub">People waiting for a time. Reach out when a slot opens, then mark them booked or remove them.</p>
      </div>
      {rows.length === 0 ? (
        <p className="wl2-empty">No one is waiting right now.</p>
      ) : (
        <div className="wl2-list">
          {rows.map((r) => (
            <div key={r.id} className={`wl2-row ${r.status === "offered" ? "offered" : ""}`}>
              <div className="wl2-main">
                <div className="wl2-name">{r.name}{r.status === "offered" && <span className="wl2-pill">offered</span>}</div>
                <div className="wl2-meta">
                  {r.email && <span>{r.email}</span>}
                  {r.phone && <span>{r.phone}</span>}
                  {r.typeName && <span className="wl2-tag">{r.typeName}</span>}
                  {r.clinicianName && <span>prefers {r.clinicianName}</span>}
                  <span className="wl2-when">waiting {ago(r.createdAt)}</span>
                </div>
                {r.note && <div className="wl2-note">{r.note}</div>}
              </div>
              <div className="wl2-actions">
                {r.status !== "offered" && <button onClick={() => set(r.id, "offered")}>Mark offered</button>}
                <button className="ok" onClick={() => set(r.id, "booked")}>Booked</button>
                <button className="rm" onClick={() => set(r.id, "removed")}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
