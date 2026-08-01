// =============================================================================
// Self-pay invoice builder (pure). A session the client pays for in full (no
// insurer) doesn't go on a CMS-1500 claim — it gets an invoice. This turns a
// client + their self-pay sessions into the data an invoice prints from.
// Kept side-effect free so it's easy to test and reuse.
// =============================================================================

import type { Client } from "./clients";
import type { BillingSession } from "./billing";
import type { ProviderConfig } from "./billing";

export interface InvoiceLine {
  date: string;         // date of service, YYYY-MM-DD
  description: string;  // e.g. "Psychotherapy, 60 mins"
  provider: string;     // rendering clinician, name + credentials
  fee: number;          // full fee for the session
  portion: number;      // what the client owes (self-pay = full fee)
}

export interface InvoiceData {
  number: string;
  issueDate: string;    // YYYY-MM-DD
  dueDate: string;      // YYYY-MM-DD (issue + 30 days)
  practice: {
    name: string;
    addressLines: string[];
    phone?: string;
    email?: string;
    website?: string;
  };
  billTo: { name: string; lines: string[] };
  clientName: string;   // "Last, First"
  lines: InvoiceLine[];
  managingProvider?: string;  // set when every line shares one provider
  subtotal: number;
  amountDue: number;
}

export interface InvoiceResolvers {
  clinName: (clinicianId: string) => string;    // full display name
  clinCredentials: (clinicianId: string) => string; // e.g. "PhD" (may be "")
  cptDesc: (code: string) => string;            // CPT description (may be "")
}

/** A stable-ish invoice number derived from the sessions it covers, so the same
 *  selection always prints the same number without needing a counter table. */
function invoiceNumber(sessionIds: string[]): string {
  const seed = [...sessionIds].sort().join("|");
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String(5000 + (Math.abs(h) % 90000)); // 4–5 digits, like a real invoice #
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Build the invoice for a client's self-pay sessions. `sessions` should already
 *  be filtered to self-pay (no insurer) and to whatever selection the caller made. */
export function buildInvoice(
  client: Client,
  sessions: BillingSession[],
  provider: ProviderConfig,
  issueDate: string,
  r: InvoiceResolvers,
): InvoiceData {
  const ordered = [...sessions].sort((a, b) => a.dateOfService.localeCompare(b.dateOfService));

  const lines: InvoiceLine[] = ordered.map((s) => {
    // The CPT description usually already reads "Psychotherapy, 60 min", so only
    // synthesise a duration when there's no code to describe the service.
    const cptText = s.cptCodes.map((c) => r.cptDesc(c)).filter(Boolean).join(", ");
    const mins = Math.round((s.durationHours || 0) * 60);
    const description = cptText ? cap(cptText) : mins > 0 ? `Psychotherapy, ${mins} mins` : "Psychotherapy";
    return {
      date: s.dateOfService,
      description,
      provider: r.clinName(s.clinicianId), // name only; registration goes on the managing-provider line
      fee: s.totalCost,
      portion: s.totalCost, // self-pay: the client owes the whole fee
    };
  });

  const providerIds = [...new Set(ordered.map((s) => s.clinicianId))];
  let managingProvider: string | undefined;
  if (providerIds.length === 1) {
    const creds = r.clinCredentials(providerIds[0]);
    managingProvider = creds ? `${r.clinName(providerIds[0])}, ${creds}` : r.clinName(providerIds[0]);
  }

  const subtotal = lines.reduce((t, l) => t + l.fee, 0);
  const amountDue = lines.reduce((t, l) => t + l.portion, 0);

  const addr = client.profile.address;
  const billLines = addr
    ? [addr.line1, addr.line2, [addr.city, addr.region, addr.postal].filter(Boolean).join(", "), addr.country].filter(Boolean).map(String)
    : [];

  const practiceAddr = [
    provider.addressLine1,
    provider.addressLine2,
    [provider.city, provider.region, provider.postal].filter(Boolean).join(", "),
    provider.country,
  ].filter(Boolean).map(String);

  const dueMs = Date.parse(`${issueDate}T00:00:00Z`);
  const dueDate = isNaN(dueMs) ? "" : new Date(dueMs + 30 * 86400000).toISOString().slice(0, 10);

  return {
    number: invoiceNumber(ordered.map((s) => s.id)),
    issueDate,
    dueDate,
    practice: {
      name: provider.practiceName || "TIFEC · Essential Care",
      addressLines: practiceAddr,
      phone: provider.phone || undefined,
      email: provider.email || undefined,
      website: provider.website || undefined,
    },
    billTo: { name: `${client.last}, ${client.first}`, lines: billLines },
    clientName: `${client.last}, ${client.first}`,
    lines,
    managingProvider,
    subtotal,
    amountDue,
  };
}
