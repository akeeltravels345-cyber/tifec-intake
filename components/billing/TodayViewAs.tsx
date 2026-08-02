"use client";

// Dev-only affordance to preview Today as each role. Sets the same dev cookies
// the billing sidebar uses; in production these are ignored (real login wins).
export default function TodayViewAs() {
  function viewAs(r: "owner" | "biller" | "clinician") {
    const who = r === "owner" ? "shion-oconnor" : r === "clinician" ? "donnet-oconnor" : "nick-oconnor";
    document.cookie = `dev_role=${r}; path=/; max-age=31536000`;
    document.cookie = `dev_as=${who}; path=/; max-age=31536000`;
    window.location.href = "/today";
  }
  return (
    <div className="today-viewas">
      <span className="today-va-lab">View as</span>
      {(["owner", "biller", "clinician"] as const).map((r) => (
        <button key={r} type="button" onClick={() => viewAs(r)}>{r[0].toUpperCase() + r.slice(1)}</button>
      ))}
    </div>
  );
}
