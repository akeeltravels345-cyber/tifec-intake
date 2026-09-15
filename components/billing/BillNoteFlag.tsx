"use client";

import { useState } from "react";

// The red "Read note" flag on a billing row. It hides the biller's short note
// behind a tap so the row stays calm, then reveals the full note inline when
// clicked (click again to hide). A plain title tooltip was easy to miss and did
// nothing on a tap, so this is a real button.
export default function BillNoteFlag({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="cd-billnote-wrap">
      <button
        type="button"
        className={`cd-billnote ${open ? "open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⚑ {open ? "Hide note" : "Read note"}
      </button>
      {open && <span className="cd-billnote-text">{note}</span>}
    </span>
  );
}
