"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BillingRole } from "@/lib/billingRole";

export default function BillingNav({ role }: { role: BillingRole }) {
  const path = usePathname();
  const items = [
    { href: "/billing/sessions", label: "Sessions", show: true },
    { href: "/billing/payments", label: "Payments", show: role === "biller" || role === "admin" },
    { href: "/billing/config", label: "Setup", show: role === "admin" },
    { href: "/billing/dashboard", label: "Disbursements", show: role === "admin" },
  ].filter((i) => i.show);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="bz-bar">
      <div className="bz-bar-inner">
        <div className="bz-brand">
          <span className="bz-logo">$</span> TIFEC Billing
        </div>
        <nav className="bz-nav">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`bz-link ${path === i.href || path.startsWith(i.href + "/") ? "active" : ""}`}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="bz-bar-right">
          <span className="bz-role">{role}</span>
          <Link href="/dashboard" className="bz-link">← Intake</Link>
          <button type="button" className="bz-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
