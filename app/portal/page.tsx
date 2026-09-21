import PortalRequest from "@/components/portal/PortalRequest";

export const dynamic = "force-dynamic";

const BRAND = "The Institute for Essential Care";

export default function PortalLanding() {
  return (
    <div className="pt">
      <div className="pt-inner">
        <header className="pt-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-logo" src="/tifec-mark.png" alt="" />
          <div className="pt-brand">{BRAND}</div>
          <h1 className="pt-title">My appointments</h1>
        </header>
        <PortalRequest />
      </div>
    </div>
  );
}
