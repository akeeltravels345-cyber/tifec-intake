// Parses an Acuity Scheduling CSV export into structured rows the scheduling
// importer can turn into appointments. Pure (no app/DB deps) so it's easy to
// test. Times are converted from each row's own IANA timezone to UTC ISO.

export interface AcuityRow {
  acuityId: string;
  calendarName: string;   // Acuity "Calendar" = the clinician
  clientName: string;
  clientEmail: string;    // first address only if several are listed
  phone: string;
  typeName: string;
  startAt: string;        // ISO UTC
  endAt: string;          // ISO UTC
  timezone: string;
  meetLink: string;       // a URL found in the notes, if any
  notes: string;          // Acuity notes (the meeting-link line stripped out)
  rescheduled: boolean;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Split one CSV line, honouring double-quoted fields (which may contain commas).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Full CSV into rows of fields (handles quoted fields with embedded newlines).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "October 5, 2026 5:00 pm" in `tz` -> ISO UTC. Returns "" if unparseable.
export function zonedTimeToUtcIso(text: string, tz: string): string {
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return "";
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return "";
  const day = +m[2], year = +m[3];
  let hour = +m[4]; const min = +m[5]; const ap = m[6].toLowerCase();
  if (ap === "pm" && hour !== 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;
  // Interpret the wall-clock time as being in `tz` and resolve to a UTC instant.
  const asIfUtc = Date.UTC(year, mon - 1, day, hour, min);
  let offset = 0;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(asIfUtc))) if (part.type !== "literal") p[part.type] = part.value;
    const asTz = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    offset = asTz - asIfUtc; // how far `tz` is ahead of UTC at that moment
  } catch { offset = 0; /* unknown tz: treat the time as UTC */ }
  return new Date(asIfUtc - offset).toISOString();
}

export function parseAcuityCsv(csvText: string): AcuityRow[] {
  const grid = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iStart = col("Start Time"), iEnd = col("End Time"), iTz = col("Timezone");
  const iFirst = col("First Name"), iLast = col("Last Name"), iPhone = col("Phone");
  const iEmail = col("Email"), iType = col("Type"), iCal = col("Calendar");
  const iNotes = col("Notes"), iId = col("Appointment ID"), iResched = col("Date Rescheduled");

  const rows: AcuityRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const f = grid[r];
    const get = (i: number) => (i >= 0 && i < f.length ? f[i].trim() : "");
    const tz = get(iTz) || "America/Cayman";
    const notesRaw = get(iNotes);
    const linkMatch = notesRaw.match(/https?:\/\/\S+/);
    const meetLink = linkMatch ? linkMatch[0].replace(/[.,]+$/, "") : "";
    const email = get(iEmail).split(",")[0].trim();
    const phone = get(iPhone).replace(/^'/, "").trim();
    rows.push({
      acuityId: get(iId),
      calendarName: get(iCal),
      clientName: `${get(iFirst)} ${get(iLast)}`.trim(),
      clientEmail: email,
      phone,
      typeName: get(iType).trim(),
      startAt: zonedTimeToUtcIso(get(iStart), tz),
      endAt: zonedTimeToUtcIso(get(iEnd), tz),
      timezone: tz,
      meetLink,
      notes: notesRaw,
      rescheduled: !!get(iResched),
    });
  }
  return rows;
}

// Collapse a type/name to a comparison key so small punctuation/spacing
// differences between the Acuity label and our catalogue still match.
export function normalizeTypeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
