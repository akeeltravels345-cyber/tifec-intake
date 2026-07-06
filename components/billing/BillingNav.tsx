"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BillingRole } from "@/lib/billingRole";

export default function BillingNav({ role }: { role: BillingRole }) {
  const path = usePathname();
  const items = [
    { href: "/billing/overview", label: "Overview", show: role === "owner" },
    { href: "/billing/me", label: "My clients", show: role === "owner" || role === "clinician" },
    { href: "/billing/payments", label: "Billing queue", show: role === "biller" || role === "owner" },
    { href: "/billing/config", label: "Setup", show: role === "owner" },
  ].filter((i) => i.show);

  const roleLabel = role === "owner" ? "Owner" : role === "biller" ? "Biller" : "Clinician";

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="bz-bar">
      <div className="bz-bar-inner">
        <div className="bz-brand">
          <span className="bz-logo">$</span> TIFEC Billing
        </div>
        <nav className="bz-nav">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`bz-link ${active(i.href) ? "active" : ""}`}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="bz-bar-right">
          <span className="bz-role">{roleLabel}</span>
          <Link href="/dashboard" className="bz-link">← Intake</Link>
          <button type="button" className="bz-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
