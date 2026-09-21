import PortalRequest from "@/components/portal/PortalRequest";

export const dynamic = "force-dynamic";

const BRAND = "The Institute for Essential Care";

export default function PortalLanding() {
  return (
    <div className="bk-page">
      <div className="bk-shell">
        <header className="bk-head"><div className="bk-brand">{BRAND}</div><div className="bk-title">My appointments</div></header>
        <section className="bk-sec">
          <PortalRequest />
        </section>
      </div>
    </div>
  );
}
