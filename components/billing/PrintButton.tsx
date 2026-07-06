"use client";

export default function PrintButton({ label = "Print / Save PDF", className = "primary" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={`${className} stmt-print-btn`} onClick={() => window.print()}>
      {label}
    </button>
  );
}
