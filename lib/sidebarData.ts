// Data the one unified sidebar needs, computed once per request and shared by
// every area (Today / Intake / Billing / Team). Keeps the badge counts and the
// role gating in one place so the sidebar renders identically everywhere.

import { getSubmissionsByClinician } from "@/lib/db";
import { unreadCount, listTickets, unreadNotifications } from "@/lib/comms";
import { listSessions } from "@/lib/billing";
import { billingRoleOf, hasBillingBeta } from "@/lib/billingRole";
import { CLINICIANS, isSystemAdmin, type Clinician } from "@/lib/clinicians";
import { getViewAsState } from "@/lib/auth";
import { touchPresence } from "@/lib/comms";
import { listStaged } from "@/lib/importStaging";
import { NOTES_ENABLED } from "@/lib/sessionNotes";

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
  importPending: number;
  noteCount: number;
  notesEnabled: boolean;
  // "Viewing as" switcher (system admin only). canSwitchViews = the REAL user is
  // the admin; viewingAsRole = the role currently being impersonated (null when
  // the admin is on their own menu); switchTargets = who to impersonate per role.
  canSwitchViews: boolean;
  viewingAsRole: "owner" | "biller" | "clinician" | null;
  viewingAsName: string | null;
  switchTargets: { owner: string | null; biller: string | null; clinician: string | null };
}

export async function getSidebarData(me: Clinician): Promise<SidebarData> {
  void touchPresence(me.id); // stamp "active now" on every navigation (fire-and-forget)
  const hasBilling = hasBillingBeta(me);
  const [subs, teamUnread, tickets, sessions, view, staged, noteCount] = await Promise.all([
    getSubmissionsByClinician(me.id),
    unreadCount(me.id),
    listTickets(),
    hasBilling ? listSessions() : Promise.resolve([]),
    getViewAsState(),
    hasBilling ? listStaged("pending") : Promise.resolve([]),
    unreadNotifications(me.id),
  ]);
  const canSwitchViews = !!view && isSystemAdmin(view.real);
  const impersonating = canSwitchViews && !!view && view.impersonating;
  const billingFolks = CLINICIANS.filter((c) => hasBillingBeta(c));
  const pick = (r: "owner" | "biller" | "clinician") =>
    billingFolks.find((c) => !isSystemAdmin(c) && billingRoleOf(c) === r && (r !== "clinician" || !c.intakeHidden))?.id ?? null;
  return {
    role: billingRoleOf(me),
    hasBilling,
    canSwitchViews,
    viewingAsRole: impersonating ? billingRoleOf(me) : null,
    viewingAsName: impersonating ? me.name : null,
    switchTargets: { owner: pick("owner"), biller: pick("biller"), clinician: pick("clinician") },
    // The builder/oversight account (contact === "admin", e.g. Akeel) gets the
    // three-role builder sidebar. The practice owner (Dr. Shion) also carries
    // admin: true for oversight, but they are an OWNER and must see only the
    // owner's own menu — never the builder view.
    isAdmin: me.contact === "admin",
    meId: me.id,
    name: me.name,
    queueCount: sessions.filter((s) => s.insurerId && !s.insurancePaid).length,
    needReview: subs.filter((s) => s.status === "new").length,
    teamUnread,
    openTickets: tickets.filter((t) => t.assignees.includes(me.id) && t.status !== "resolved").length,
    importPending: staged.length,
    noteCount,
    notesEnabled: NOTES_ENABLED,
  };
}
