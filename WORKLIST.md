# TIFEC Billing — Features Worklist

A shared list between **Akeel** and **Nick**. Nick: add anything you need at the
bottom under **"Nick's requests"** using the template. Each item = **Name ·
Description · Flow** (where the action starts → where it ends).

**How to use:** copy the template block, fill it in, done. No need to be technical
— just describe what you want and how you'd use it.

---

## ✅ Already built & live

*(Reference — so we don't rebuild what's here. These also show the format.)*

### Billing queue

**Log a session**
- Record a visit: service code(s), client, insurer or self-pay, date.
- **Flow:** Log a session → pick client + code(s) + payment type → Save → the charge appears in the queue / on the client record.

**Bill → Awaiting → Paid lifecycle**
- Insurance claims move through three tabs as you work them.
- **Flow:** To bill → select claims → set **billed date** → Mark billed → Awaiting payment → set **paid date** → Mark paid → Paid (counts as collected).

**Back-date billed & paid dates**
- The date the claim actually came in / was settled, not the day you marked it.
- **Flow:** Billing queue → any Awaiting/Paid row → click the date → pick the real date. (Also on the bulk bar, and on the client record's charge editor.)

**Self-pay tab (acts like a payer)**
- Self-pay balances a client still owes sit in their own tab.
- **Flow:** Self-pay tab → select balance → set paid date → Mark paid → moves to Paid.

**Collapsible groups + filters**
- Group by insurer or clinician, filter by clinician, search by client, aging chips (0–14 / 15–30 / 31–60 / 60+ days).
- **Flow:** Billing queue → toggle "By insurer / By clinician" → collapse groups / apply filter.

### Co-pays & self-pay dispositions

**Collected / Didn't collect / Waive**
- Every co-pay (and self-pay) is one of: collected, **didn't collect** (still owed → invoice), or **waived** (written off, never chased).
- **Flow:** Log a session → Co-pay (or "Was it paid?") → pick disposition → Save → "didn't collect" goes to **Owed by clients**; "waived" is written off.

**Adventist discount**
- % off the fee for self-pay (50% preset), reason recorded.
- **Flow:** Log a session → self-pay + a code → Discount → "50% Adventist" → charge halves.

**Track waived vs not-collected**
- Two separate totals: co-pays not collected (owed) vs co-pays waived (written off).
- **Flow:** Business overview / a clinician's Payout page → see both figures.

### Owed by clients

**Owed-by-clients tracker**
- One list of everything clients still owe: self-pay balances + uncollected co-pays, oldest first.
- **Flow:** Sidebar → Owed by clients → per client, "Invoice →" (self-pay) or "Open →".

### Client records

**Edit a charge**
- Fix any logged charge: date of service, fee, insurer, status, billed/paid dates, self-pay disposition, co-pay.
- **Flow:** Clients → open a client → Appointments & charges → ✎ → change → Save.

**Generate invoice / CMS-1500**
- Build a self-pay invoice or an insurance claim form.
- **Flow:** Client record (or Clients list, tick several) → Generate invoice / Generate CMS-1500.

### Reporting & payout

**Business overview** — charged, collected, still owed, net, by clinician, waiting-on-insurance aging, waived vs uncollected co-pays. **Flow:** Overview → pick a month.

**Payout statements** — per clinician, per month; payout follows the month money was actually collected (rollover rule). **Flow:** By clinician → open one → month picker.

### Access

**Biller view** — Nick sees: Biller dashboard, Billing queue, By clinician, Owed by clients, Clients, Import, plus Team (notices/messages/tickets).

---

## 📝 Nick's requests — add below

*Copy this block for each new request:*

```
### [Feature name]
- **What it does:** [plain description — what you want and why]
- **Flow:** [where you'd start] → [what happens] → [where it ends]
- **Priority:** (nice-to-have / important / urgent)
- **Requested by:** Nick · [date]
```

<!-- Nick, add your features here -->

### [Example — delete or edit]
- **What it does:** Bulk-set a paid date on several self-pay balances at once.
- **Flow:** Owed by clients → tick several → "Set paid date" → apply to all.
- **Priority:** nice-to-have
- **Requested by:** Nick · 2026-08-03

---

## 💡 Already flagged / on deck (not built yet)

- **Change history / audit** — see who logged / marked paid / edited a record (per-client). *Scoped, ready to build.*
- **Bulk paid-date** — set the paid date on many records at once (per client or practice-wide).
- **Charge editor on mobile** — open the client-record charge editor as a stacked full-width form on phones (instead of scrolling sideways).
