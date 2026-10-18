// Scheduling-app mode.
//
// This one codebase can run as two deployments against the SAME database:
//   • the full TIFEC portal (default) — billing, intake, scheduling, everything;
//   • the standalone Scheduling app — when SCHEDULING_APP is set on that
//     deployment, it opens straight into the calendar and shows only scheduling
//     navigation, so clinicians get a focused scheduling app on its own URL
//     while sharing the same logins and data. Nothing is forked — a fix lands
//     once and both deployments get it.
//
// Everything this flag changes is additive and gated, so the portal deployment
// (flag unset) behaves exactly as before.
export const isSchedulingApp = (): boolean => {
  const v = process.env.SCHEDULING_APP;
  return v === "1" || v === "true" || v === "yes";
};

// Where the scheduling app sends people who land on the root or just signed in.
// /schedule is the responsive web calendar (and /m is the installable phone app).
export const SCHEDULING_HOME = "/schedule";
