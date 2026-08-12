"use client";

import { useRef } from "react";
import { RICH_MARKERS } from "@/lib/richText";

// A plain textarea with a small Bold / Italic / Underline toolbar. It works by
// wrapping the current selection in simple markers (**bold**, *italic*,
// __underline__) — no contentEditable, so the value stays plain text and there's
// nothing unsafe to store. formatText() renders those markers when displaying.
export default function RichTextArea({ value, onChange, id, rows = 3, placeholder }: {
  value: string; onChange: (v: string) => void; id?: string; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(marker: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const sel = value.slice(start, end);
    const inner = sel || "text";
    const next = value.slice(0, start) + marker + inner + marker + value.slice(end);
    onChange(next);
    // Re-select the wrapped text so the user can keep typing / toggling.
    requestAnimationFrame(() => {
      ta.focus();
      const from = start + marker.length;
      ta.setSelectionRange(from, from + inner.length);
    });
  }

  return (
    <div className="rt-wrap">
      <div className="rt-bar">
        <button type="button" className="rt-btn b" onClick={() => wrap(RICH_MARKERS.bold)} title="Bold" aria-label="Bold">B</button>
        <button type="button" className="rt-btn i" onClick={() => wrap(RICH_MARKERS.italic)} title="Italic" aria-label="Italic">I</button>
        <button type="button" className="rt-btn u" onClick={() => wrap(RICH_MARKERS.underline)} title="Underline" aria-label="Underline">U</button>
        <button type="button" className="rt-btn s" onClick={() => wrap(RICH_MARKERS.strike)} title="Strikethrough" aria-label="Strikethrough">S</button>
      </div>
      <textarea
        ref={ref} id={id} className="ls-in tm-in rt-area" rows={rows} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
