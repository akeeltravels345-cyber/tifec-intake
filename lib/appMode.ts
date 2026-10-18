// Scheduling-app mode.
//
// ONE deployment serves both domains against the same database:
//   • portal.caymanessentialcare.com  -> the full TIFEC portal (default);
//   • schedule.caymanessentialcare.com -> the standalone Scheduling app, which
//     opens straight into the calendar and shows only scheduling navigation.
//
// Which one you get is decided by the domain the request came in on — so there's
// no second deployment, no duplicated secrets, and a fix lands once for both.
// A dedicated deployment can still force scheduling mode with SCHEDULING_APP=1.
//
// Everything this toggles is additive and gated, so the portal domain behaves
// exactly as before.
import { headers } from "next/headers";

const envForced = (): boolean => {
  const v = process.env.SCHEDULING_APP;
  return v === "1" || v === "true" || v === "yes";
};

/** True when this request should render the standalone Scheduling app — either
 *  the deployment forces it (SCHEDULING_APP) or it arrived on the scheduling
 *  domain (schedule.* / booking.*). Reads the request host, so callers are
 *  server components / server code; safe to call anywhere (falls back to false). */
export async function isSchedulingApp(): Promise<boolean> {
  if (envForced()) return true;
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase().split(":")[0];
    return host.startsWith("schedule.") || host.startsWith("booking.");
  } catch {
    return false; // no request context (build/edge) — default to the portal
  }
}

// Where the scheduling app sends people who land on the root or just signed in.
// /schedule is the responsive web calendar (and /m is the installable phone app).
export const SCHEDULING_HOME = "/schedule";
