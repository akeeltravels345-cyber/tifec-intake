"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

// Shared "go back" control for the mobile app's full-screen flows (detail,
// book, block, hours). It returns to WHATEVER screen you came from — the
// browser's previous entry — instead of always jumping to Today, so opening an
// appointment from a colleague's calendar and pressing back lands you on that
// calendar again. Falls back to a fixed route only when there's no history to
// go back to (e.g. the flow was opened from a deep link or notification).
export default function MobileBack({
  className,
  ariaLabel,
  fallback = "/m",
  style,
  children,
}: {
  className?: string;
  ariaLabel?: string;
  fallback?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button type="button" className={className} aria-label={ariaLabel} onClick={back} style={style}>
      {children}
    </button>
  );
}
