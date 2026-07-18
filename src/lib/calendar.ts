// Add-to-calendar helpers. Pure builders for the three things a fan can do with
// a fixture: open it in Google or Outlook web, or download a standards-compliant
// .ics that Apple Calendar / Outlook desktop / everything else imports. Kept
// framework-free so any surface (home cards, match page) can reuse it.

export type CalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  // Stable id so re-adding updates the same event instead of duplicating it.
  uid?: string;
  url?: string;
};

// iCal UTC "basic" timestamp: 20260714T190000Z.
function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// RFC 5545 text escaping: backslash, semicolon, comma and newlines.
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold content lines at 75 octets with a leading space on continuations, so a
// long DESCRIPTION (it carries a URL) stays valid for strict parsers.
function foldIcsLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }

  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);

  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }

  parts.push(` ${rest}`);

  return parts.join("\r\n");
}

export function buildIcs(event: CalendarEvent): string {
  const uid = event.uid ?? `${icsStamp(event.start)}-${Math.round(event.start.getTime())}@fan-forecast`;
  const descriptionParts = [event.description, event.url].filter(Boolean);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fan Forecast//Fixtures//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(event.start)}`,
    `DTSTART:${icsStamp(event.start)}`,
    `DTEND:${icsStamp(event.end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    ...(descriptionParts.length
      ? [`DESCRIPTION:${icsEscape(descriptionParts.join(" — "))}`]
      : []),
    ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n");
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsStamp(event.start)}/${icsStamp(event.end)}`,
  });

  const details = [event.description, event.url].filter(Boolean).join("\n");

  if (details) {
    params.set("details", details);
  }

  if (event.location) {
    params.set("location", event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
  });

  const body = [event.description, event.url].filter(Boolean).join("\n");

  if (body) {
    params.set("body", body);
  }

  if (event.location) {
    params.set("location", event.location);
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// Trigger a client-side .ics download. No-op during SSR.
export function downloadIcs(event: CalendarEvent, filename = "event.ics"): void {
  if (typeof document === "undefined") {
    return;
  }

  const blob = new Blob([buildIcs(event)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
