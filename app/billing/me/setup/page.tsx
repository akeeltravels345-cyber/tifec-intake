import Link from "next/link";
import { caymanYearMonth } from "@/lib/caymanTime";
import { redirect } from "next/navigation";
import { getBillingUser } from "@/lib/billingRole";
import { listSessions, getClinicianSettings, getPracticeConfig } from "@/lib/billing";
import { computeClinicianMonth } from "@/lib/billingCalc";
import { resolveClinicianExpenses, monthKey as mKey } from "@/lib/clinicianExpenses";
import { CLINICIANS } from "@/lib/clinicians";
import MonthNav from "@/components/billing/MonthNav";
import MyExpenses from "@/components/billing/MyExpenses";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function fmtSaved(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Cayman local time, deterministic on the server (passed to the client as a string).
  return d.toLocaleString("en-GB", { timeZone: "America/Cayman", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export default async function ClinicianSetupPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const user = await getBillingUser();
  if (!user) redirect("/login?next=/billing/me/setup");
  const id = user.clinician.id;

  const sp = await searchParams;
  const nowYM = caymanYearMonth();
  const year = Number(sp.y) || nowYM.year;
  const month = Number(sp.m) || nowYM.month;

  const [sessions, settings, cfg, exp] = await Promise.all([
    listSessions({ clinicianId: id }),
    getClinicianSettings(id),
    getPracticeConfig(),
    resolveClinicianExpenses(id, year, month),
  ]);
  const c = computeClinicianMonth(sessions, settings, year, month, cfg.billerCommissionPct);
  const ownerName = CLINICIANS.find((x) => x.contact === "owner")?.name ?? "the practice owner";

  return (
    <>
      <Link href="/billing/me" className="ls-back">← Back to my payout</Link>
      <div className="cd-secrow" style={{ marginTop: 4 }}>
        <div>
          <h1 className="ls-h1">Setup</h1>
          <p className="ls-sub">Your private expenses for the month, and your agreement with the practice.</p>
        </div>
        <MonthNav year={year} month={month} path="/billing/me/setup" />
      </div>

      <MyExpenses
        key={`${year}-${month}`}
        monthKey={mKey(year, month)}
        monthLabel={`${MONTHS[month - 1]} ${year}`}
        initial={exp.expenses}
        source={exp.source}
        from={exp.from}
        savedLabel={fmtSaved(exp.savedAt)}
        netPayout={c.payout}
      />

      {/* My agreement — read-only; set by the owner. */}
      <div className="su-sec">
        <div className="su-sechead">
          <h2 className="su-sech">My agreement</h2>
          <span className="su-hint">How your payout is worked out. Set by the practice — read-only here.</span>
        </div>
        <div className="agr-grid">
          <div className="agr-cell"><div className="agr-k">Company retention</div><div className="agr-v">{settings.retentionPct}%</div></div>
          <div className="agr-cell"><div className="agr-k">Billing rate</div><div className="agr-v">{settings.billerPct ?? 0}%</div></div>
          <div className="agr-cell"><div className="agr-k">Health deduction</div><div className="agr-v">{money(settings.otherDeductionFixed)}</div></div>
          <div className="agr-cell"><div className="agr-k">Pension</div><div className="agr-v">{settings.pensionPct ?? 10}%</div><div className="agr-sub">of your share after the {settings.retentionPct}% retention</div></div>
        </div>
        <p className="agr-note">Only the owner can change these. If something looks wrong, raise it with {ownerName}.</p>
      </div>
    </>
  );
}
