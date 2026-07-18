import { buildIcs, googleCalendarUrl, outlookCalendarUrl } from "./calendar";

const event = {
  description: "World Cup 2026",
  end: new Date("2026-07-14T21:00:00.000Z"),
  start: new Date("2026-07-14T19:00:00.000Z"),
  title: "France vs England",
  uid: "fixture-18213979@fan-forecast",
  url: "https://example.com/match/18213979",
};

describe("buildIcs", () => {
  it("emits a valid VEVENT with UTC basic timestamps", () => {
    const ics = buildIcs(event);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:fixture-18213979@fan-forecast");
    expect(ics).toContain("DTSTART:20260714T190000Z");
    expect(ics).toContain("DTEND:20260714T210000Z");
    expect(ics).toContain("SUMMARY:France vs England");
    expect(ics).toContain("URL:https://example.com/match/18213979");
  });

  it("uses CRLF line endings", () => {
    expect(buildIcs(event)).toContain("\r\n");
  });

  it("escapes commas and semicolons in text per RFC 5545", () => {
    const ics = buildIcs({ ...event, title: "A, B; C" });

    expect(ics).toContain("SUMMARY:A\\, B\\; C");
  });

  it("folds description lines longer than 75 octets", () => {
    const ics = buildIcs({
      ...event,
      description: "x".repeat(120),
    });
    const descLine = ics
      .split("\r\n")
      .join("\n")
      .split("\n")
      .find((line) => line.startsWith("DESCRIPTION:"));

    // The unfolded logical line exceeds 75 chars, so it must be split with a
    // continuation (leading space) — no raw line stays over the limit.
    expect(ics).toContain("DESCRIPTION:");
    expect(descLine?.length ?? 0).toBeLessThanOrEqual(75);
  });
});

describe("googleCalendarUrl", () => {
  it("builds a TEMPLATE link with the kickoff window and details", () => {
    const url = new URL(googleCalendarUrl(event));

    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("France vs England");
    expect(url.searchParams.get("dates")).toBe(
      "20260714T190000Z/20260714T210000Z",
    );
    expect(url.searchParams.get("details")).toContain(
      "https://example.com/match/18213979",
    );
  });
});

describe("outlookCalendarUrl", () => {
  it("builds a compose deeplink with ISO start/end", () => {
    const url = new URL(outlookCalendarUrl(event));

    expect(url.origin).toBe("https://outlook.live.com");
    expect(url.searchParams.get("rru")).toBe("addevent");
    expect(url.searchParams.get("subject")).toBe("France vs England");
    expect(url.searchParams.get("startdt")).toBe("2026-07-14T19:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-07-14T21:00:00.000Z");
  });
});
