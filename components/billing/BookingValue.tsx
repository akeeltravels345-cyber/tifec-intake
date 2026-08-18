"use client";

import { useState } from "react";

// Admin-only "value per booking" helper: takes the average revenue per paying
// client (computed from live collected cash) and a booking→client conversion
// rate you type in, and shows the value to set on a Google Ads booking
// conversion. value per booking = avg revenue per client × conversion rate.
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BookingValue({ avgPerClient, payingClients }: { avgPerClient: number; payingClients: number }) {
  const [rate, setRate] = useState("");
  const pct = Math.max(0, Math.min(100, Number(rate) || 0));
  const perBooking = Math.round((avgPerClient * (pct / 100) + Number.EPSILON) * 100) / 100;
  const hasRate = rate.trim() !== "" && pct > 0;

  return (
    <div className="bv-card">
      <div className="bv-head">
        <span className="bv-title">Value per booking</span>
        <span className="bv-sub">for Google Ads conversion tracking</span>
      </div>
      <div className="bv-body">
        <div className="bv-stat">
          <div className="k">Avg revenue per paying client</div>
          <div className="v">{money(avgPerClient)}</div>
          <div className="s">across {payingClients} paying client{payingClients === 1 ? "" : "s"}, from cash collected</div>
        </div>
        <div className="bv-op">×</div>
        <div className="bv-stat">
          <div className="k">Booking → client conversion</div>
          <div className="bv-rate">
            <input type="number" step="1" min="0" max="100" inputMode="decimal" value={rate} placeholder="e.g. 45" onChange={(e) => setRate(e.target.value)} aria-label="Conversion rate percent" />
            <span className="pct">%</span>
          </div>
          <div className="s">share of bookings that become paying clients</div>
        </div>
        <div className="bv-op">=</div>
        <div className="bv-stat result">
          <div className="k">Value per booking</div>
          <div className="v">{hasRate ? money(perBooking) : "—"}</div>
          <div className="s">{hasRate ? "set this on the Google booking conversion" : "enter your conversion rate"}</div>
        </div>
      </div>
      <p className="bv-note">Avg revenue is all-time cash collected per paying client. The conversion rate comes from Google / your scheduler — it isn&apos;t in the billing data.</p>
    </div>
  );
}
