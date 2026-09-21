import { getClinician } from "@/lib/clinicians";
import { listAppointmentTypes } from "@/lib/scheduling";
import { getOffer, readClaimToken } from "@/lib/waitlistOffers";
import { caymanWhen } from "@/lib/caymanTime";
import ClaimForm from "@/components/booking/ClaimForm";

export const dynamic = "force-dynamic";

const BRAND = "The Institute for Essential Care";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bk-page">
      <div className="bk-shell">
        <header className="bk-head"><div className="bk-brand">{BRAND}</div><div className="bk-title">Waitlist offer</div></header>
        <section className="bk-sec">{children}</section>
      </div>
    </div>
  );
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = readClaimToken(token);
  if (!parsed) {
    return <Shell><h2 className="bk-h2">This link isn&apos;t valid</h2><p className="bk-donesub">Please use the most recent link we emailed you, or reply and we&apos;ll help.</p></Shell>;
  }

  const offer = await getOffer(parsed.offerId);
  const taken = !offer || offer.status !== "open" || Date.parse(offer.expiresAt) <= Date.now();
  if (!offer) {
    return <Shell><h2 className="bk-h2">Offer not found</h2><p className="bk-donesub">This offer may have expired. You&apos;re still on the waitlist for the next opening.</p></Shell>;
  }

  const type = offer.typeId ? (await listAppointmentTypes()).find((t) => t.id === offer.typeId) : null;
  const serviceName = type?.name || "Appointment";
  const clinicianName = getClinician(offer.clinicianId)?.name || "your clinician";
  const whenText = caymanWhen(offer.startAt);

  if (taken) {
    return (
      <Shell>
        <h2 className="bk-h2">This time has been taken</h2>
        <p className="bk-donesub">Someone claimed it first, so it&apos;s no longer available. You&apos;re still on our waitlist and we&apos;ll email you the moment another spot opens.</p>
        <div className="bk-summary">
          <div className="bk-row"><span>Service</span><span>{serviceName}</span></div>
          <div className="bk-row"><span>Clinician</span><span>{clinicianName}</span></div>
          <div className="bk-row"><span>Was</span><span>{whenText}</span></div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="bk-h2">A spot just opened</h2>
      <p className="bk-donesub">You&apos;re on our waitlist, so this time is yours to claim. It&apos;s offered to everyone waiting, so confirm to lock it in before someone else does.</p>
      <div className="bk-summary">
        <div className="bk-row"><span>Service</span><span>{serviceName}</span></div>
        <div className="bk-row"><span>Clinician</span><span>{clinicianName}</span></div>
        <div className="bk-row"><span>When</span><span>{whenText}</span></div>
      </div>
      <ClaimForm token={token} />
    </Shell>
  );
}
