// Official match highlights from FIFA.com's own content API (the same JSON
// the fifa.com match centre fetches). This is the global official source -
// no per-country broadcaster geo-restriction, no YouTube API key, no HTML
// scraping. Flow mirrors the site: resolve our fixture to a FIFA match via
// the tournament calendar, then read that match's highlights videos.
//
// Endpoints (public, CORS *, no auth):
//   calendar: api.fifa.com/api/v3/calendar/matches?idCompetition&idSeason
//   videos:   cxm-api.fifa.com/fifaplusweb/api/sections/matchdetails/videos

const COMPETITION_ID = "17"; // FIFA World Cup
const SEASON_ID = "285023"; // 2026 edition
const FIFA_WEB = "https://www.fifa.com";
// A browser-like UA avoids Akamai bot challenges on plain server-side fetches.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36";

export type FifaHighlight = {
  publishDate?: string;
  subtitle?: string;
  thumbnail?: string;
  title: string;
  url: string;
};

export type FifaHighlightsResult = {
  // Standard highlights video (the one fans want).
  official: FifaHighlight | null;
  // International Sign Language variant, when FIFA publishes one.
  accessible: FifaHighlight | null;
  // published: a highlights video exists. pending: match found, no video yet.
  // not-found: fixture couldn't be matched to a FIFA match.
  status: "published" | "pending" | "not-found";
};

type CalendarMatch = {
  idStage: string;
  idMatch: string;
  home: string;
  away: string;
  date: string;
};

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

// FIFA uses a few names that differ from ours; alias to a shared normal form.
const TEAM_ALIASES: Record<string, string> = {
  korearepublic: "southkorea",
  usmnt: "usa",
  unitedstates: "usa",
  ivorycoast: "cotedivoire",
};

function canonicalTeam(name: string): string {
  const normal = normalizeTeam(name);

  return TEAM_ALIASES[normal] ?? normal;
}

async function fetchFifaJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, origin: FIFA_WEB },
    // FIFA content is edge-cached; a short revalidate keeps highlights fresh
    // (they appear a few hours post-match) without hammering the API.
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`FIFA API ${response.status} for ${url}`);
  }

  return response.json();
}

function teamName(side: unknown): string {
  if (side && typeof side === "object") {
    const list = (side as { TeamName?: unknown }).TeamName;

    if (Array.isArray(list) && list[0] && typeof list[0] === "object") {
      const description = (list[0] as { Description?: unknown }).Description;

      if (typeof description === "string") return description;
    }
  }

  return "";
}

// The tournament calendar is effectively static for our purposes; cache it in
// module scope with a TTL so repeated highlight lookups don't refetch 104
// matches.
let calendarCache: { at: number; matches: CalendarMatch[] } | null = null;
const CALENDAR_TTL_MS = 60 * 60 * 1000;

async function getCalendar(now: number): Promise<CalendarMatch[]> {
  if (calendarCache && now - calendarCache.at < CALENDAR_TTL_MS) {
    return calendarCache.matches;
  }

  const raw = await fetchFifaJson(
    `https://api.fifa.com/api/v3/calendar/matches?language=en&idCompetition=${COMPETITION_ID}&idSeason=${SEASON_ID}&count=400`,
  );
  const results =
    raw && typeof raw === "object"
      ? ((raw as { Results?: unknown }).Results ?? [])
      : [];
  const matches: CalendarMatch[] = (Array.isArray(results) ? results : [])
    .map((entry) => {
      const record = entry as Record<string, unknown>;

      return {
        away: teamName(record.Away),
        date: typeof record.Date === "string" ? record.Date : "",
        home: teamName(record.Home),
        idMatch: String(record.IdMatch ?? ""),
        idStage: String(record.IdStage ?? ""),
      };
    })
    .filter((match) => match.home && match.away && match.idMatch);

  calendarCache = { at: now, matches };

  return matches;
}

// Find the FIFA match for our fixture by the (order-independent) team pair,
// disambiguating same-pair matches by nearest kickoff date.
function resolveMatch(
  matches: CalendarMatch[],
  homeTeam: string,
  awayTeam: string,
  kickoffUtc: string,
): CalendarMatch | null {
  const wanted = new Set([canonicalTeam(homeTeam), canonicalTeam(awayTeam)]);
  const candidates = matches.filter((match) => {
    const pair = new Set([canonicalTeam(match.home), canonicalTeam(match.away)]);

    return pair.size === wanted.size && [...wanted].every((t) => pair.has(t));
  });

  if (candidates.length <= 1) return candidates[0] ?? null;

  const target = new Date(kickoffUtc).getTime();

  return candidates.reduce((best, match) => {
    const delta = Math.abs(new Date(match.date).getTime() - target);
    const bestDelta = Math.abs(new Date(best.date).getTime() - target);

    return delta < bestDelta ? match : best;
  });
}

function toHighlight(item: Record<string, unknown>): FifaHighlight {
  const path =
    typeof item.readMorePageUrl === "string" ? item.readMorePageUrl : "";
  const image = item.image as { src?: unknown } | undefined;

  return {
    publishDate:
      typeof item.publishDate === "string" ? item.publishDate : undefined,
    subtitle: typeof item.subTitle === "string" ? item.subTitle : undefined,
    thumbnail: typeof image?.src === "string" ? image.src : undefined,
    title: typeof item.title === "string" ? item.title : "Highlights",
    url: path ? `${FIFA_WEB}${path}` : FIFA_WEB,
  };
}

const IS_VARIANT = /international sign language|\(IS\)/i;

export async function fetchFifaHighlights(
  homeTeam: string,
  awayTeam: string,
  kickoffUtc: string,
  now: number,
): Promise<FifaHighlightsResult> {
  const calendar = await getCalendar(now);
  const match = resolveMatch(calendar, homeTeam, awayTeam, kickoffUtc);

  if (!match) {
    return { accessible: null, official: null, status: "not-found" };
  }

  const raw = await fetchFifaJson(
    `https://cxm-api.fifa.com/fifaplusweb/api/sections/matchdetails/videos?locale=en&competitionId=${COMPETITION_ID}&seasonId=${SEASON_ID}&stageId=${match.idStage}&matchId=${match.idMatch}`,
  );
  const carousel =
    raw && typeof raw === "object"
      ? (raw as { vodVideosBaseCarousel?: { items?: unknown } })
          .vodVideosBaseCarousel
      : undefined;
  const items = Array.isArray(carousel?.items)
    ? (carousel.items as Record<string, unknown>[])
    : [];
  const official = items.find(
    (item) =>
      item.videoSubcategory === "Highlights" &&
      !IS_VARIANT.test(String(item.title ?? "")),
  );
  const accessible = items.find((item) =>
    IS_VARIANT.test(String(item.title ?? "")),
  );

  return {
    accessible: accessible ? toHighlight(accessible) : null,
    official: official ? toHighlight(official) : null,
    status: official ? "published" : "pending",
  };
}
