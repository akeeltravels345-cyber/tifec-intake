"use client";

import { useEffect } from "react";

// Intake forms always render in light mode, regardless of the viewer's device or
// saved theme. The pre-paint script in the root layout already forces light on a
// fresh /intake load; this covers in-app navigation (e.g. an admin previewing a
// form from a dark dashboard) and restores the previous theme on the way out, so
// the rest of the app keeps whatever theme the user chose.
export default function ForceLightTheme() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", "light");
    return () => { if (prev) el.setAttribute("data-theme", prev); };
  }, []);
  return null;
}
