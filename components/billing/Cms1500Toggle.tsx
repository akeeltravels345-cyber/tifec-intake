"use client";

import { useState } from "react";

/** Switches between the official red-form facsimile (what prints/submits) and the
 *  plain review sheet (easier to scan on screen). Both are rendered server-side
 *  and passed in; only the chosen one is shown, and Print prints what's visible. */
export default function Cms1500Toggle({ official, sheet }: { official: React.ReactNode; sheet: React.ReactNode }) {
  const [view, setView] = useState<"official" | "sheet">("official");
  return (
    <>
      <div className="bq-tabs hcfa-noprint" style={{ marginBottom: 14 }}>
        <button className={`bq-tab ${view === "official" ? "on" : ""}`} onClick={() => setView("official")}>Official form</button>
        <button className={`bq-tab ${view === "sheet" ? "on" : ""}`} onClick={() => setView("sheet")}>Review sheet</button>
      </div>
      <div>{view === "official" ? official : sheet}</div>
    </>
  );
}
