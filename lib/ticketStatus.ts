// Ticket lifecycle statuses — pure, no server deps, so client components and
// server code share ONE definition (labels, colours, allowed transitions).

export type TicketStatus = "open" | "in_progress" | "needs_info" | "on_hold" | "resolved";

export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "needs_info", "on_hold", "resolved"];

/** Plain, friendly labels (legibility pass). */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Not started",
  in_progress: "Being sorted",
  needs_info: "Needs info",
  on_hold: "On hold",
  resolved: "Done",
};

/** A ticket is "still open" (shows in the open tab, can be waiting on someone)
 *  unless it's been resolved. */
export const isOpenStatus = (s: TicketStatus): boolean => s !== "resolved";

export const isTicketStatus = (s: string): s is TicketStatus => (TICKET_STATUSES as string[]).includes(s);

/** The one-tap actions offered from each status, in display order. Each action
 *  names the status it moves the ticket TO, and a tone for styling. */
export interface StatusAction { to: TicketStatus; label: string; tone: "primary" | "ghost" }
export function statusActions(s: TicketStatus): StatusAction[] {
  switch (s) {
    case "open":
      return [{ to: "in_progress", label: "Start", tone: "primary" }, { to: "on_hold", label: "Put on hold", tone: "ghost" }];
    case "in_progress":
      return [{ to: "resolved", label: "Mark done", tone: "primary" }, { to: "needs_info", label: "Need info", tone: "ghost" }, { to: "on_hold", label: "Put on hold", tone: "ghost" }];
    case "needs_info":
      return [{ to: "in_progress", label: "Resume", tone: "primary" }, { to: "resolved", label: "Mark done", tone: "ghost" }];
    case "on_hold":
      return [{ to: "in_progress", label: "Resume", tone: "primary" }, { to: "resolved", label: "Mark done", tone: "ghost" }];
    case "resolved":
      return [{ to: "open", label: "Reopen", tone: "ghost" }];
  }
}
