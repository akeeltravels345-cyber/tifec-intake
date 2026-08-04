"use client";

import { useState, useRef, useLayoutEffect, useCallback } from "react";

/**
 * Site convention: any list/table with more than `max` rows (default 6) is
 * collapsed to the first `max` rows with a "Show all N / Show fewer" toggle, so
 * long lists never dump everything on screen.
 *
 * Height-based, so it works for ANY content without knowing the markup: it
 * measures the row elements and caps the container's height to the first `max`.
 * Rows are found via `rowSelector` (default: table body rows, else the direct
 * children of the wrapped element).
 */
export default function Foldable({
  children,
  max = 6,
  rowSelector,
  unit = "rows",
  className = "",
}: {
  children: React.ReactNode;
  max?: number;
  rowSelector?: string;
  unit?: string;
  className?: string;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [cap, setCap] = useState<number | null>(null);

  const measure = useCallback(() => {
    const clip = clipRef.current;
    if (!clip) return;
    const rows = rowSelector
      ? clip.querySelectorAll(rowSelector)
      : (() => {
          const trs = clip.querySelectorAll("table tbody > tr");
          if (trs.length) return trs;
          const firstList = clip.querySelector(":scope > *");
          return firstList ? firstList.children : ([] as unknown as NodeListOf<Element>);
        })();
    setCount(rows.length);
    if (rows.length > max) {
      const top = clip.getBoundingClientRect().top;
      const boundary = rows[max - 1].getBoundingClientRect().bottom;
      setCap(Math.ceil(boundary - top));
    } else {
      setCap(null);
    }
  }, [max, rowSelector]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (clipRef.current) ro.observe(clipRef.current);
    return () => ro.disconnect();
  }, [measure, children]);

  const foldable = cap != null && count > max;

  return (
    <div className={`fold ${className}`}>
      <div
        ref={clipRef}
        className="fold-clip"
        style={foldable && !open ? { maxHeight: cap!, overflow: "hidden" } : undefined}
      >
        {children}
      </div>
      {foldable && (
        <button type="button" className="fold-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Show fewer" : `Show all ${count} ${unit}`}
          <svg className={`fold-chev ${open ? "up" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
