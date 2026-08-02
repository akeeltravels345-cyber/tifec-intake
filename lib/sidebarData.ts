// Data the one unified sidebar needs, computed once per request and shared by
// every area (Today / Intake / Billing / Team). Keeps the badge counts and the
// role gating in one place so the sidebar renders identically everywhere.

import { getSubmissionsByClinician } from "@/lib/db";
import { unreadCount, listTickets } from "@/lib/comms";
import { listSessions } from "@/lib/billing";
import { billingRoleOf, hasBillingBeta } from "@/lib/billingRole";
import type { Clinician } from "@/lib/clinicians";

export interface SidebarData {
  role: "owner" | "biller" | "clinician";
  hasBilling: boolean;
  isAdmin: boolean;
  meId: string;
  name: string;
  queueCount: number;
  needReview: number;
  teamUnread: number;
  openTickets: number;
}

export async function getSidebarData(me: Clinician): Promise<SidebarData> {
  const hasBilling = hasBillingBeta(me);
  const [subs, teamUnread, tickets, sessions] = await Promise.all([
    getSubmissionsByClinician(me.id),
    unreadCount(me.id),
    listTickets(),
    hasBilling ? listSessions() : Promise.resolve([]),
  ]);
  return {
    role: billingRoleOf(me),
    hasBilling,
    isAdmin: !!me.admin,
    meId: me.id,
    name: me.name,
    queueCount: sessions.filter((s) => s.insurerId && !s.insurancePaid).length,
    needReview: subs.filter((s) => s.status === "new").length,
    teamUnread,
    openTickets: tickets.filter((t) => t.assignees.includes(me.id) && t.status !== "resolved").length,
  };
}
