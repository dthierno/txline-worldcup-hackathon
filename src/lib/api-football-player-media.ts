import fs from "node:fs";
import path from "node:path";

import type {
  LineupPosition,
  NormalizedLineupPlayer,
  NormalizedLineups,
} from "@/lib/txline-normalize";

const DEFAULT_ORIGIN = "https://v3.football.api-sports.io";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ApiFootballTeam = {
  country?: string;
  id?: number;
  name?: string;
  national?: boolean;
};

type ApiFootballPlayer = {
  age?: number;
  id?: number;
  name?: string;
  number?: number | null;
  photo?: string;
  position?: string;
};

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type ResolverOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: number;
  origin?: string;
};

export type PlayerMediaEnrichment = {
  configured: boolean;
  lineups: NormalizedLineups | null;
  provider: "api-football";
  resolved: number;
};

export type ScorerPoolPlayer = {
  imageUrl?: string;
  name: string;
  // TxLINE player id on a verified pool; provider id on a provisional one.
  playerId: number;
  position?: LineupPosition;
  // The provider squad entry this TxLINE player matched, when one did. It is
  // the only bridge between the two id spaces.
  providerId?: number;
  shirtNumber?: number;
};

export type ScorerPoolTeam = {
  isHome: boolean;
  players: ScorerPoolPlayer[];
  teamName: string;
};

// Scorer picks settle against TxLINE goal-feed player ids, but TxLINE only
// publishes an XI about an hour before kickoff. Before that the pool falls back
// to the provider squad, whose ids belong to a different space: such a pool is
// flagged provisional, and a pick taken from it has to be rewritten to the
// TxLINE id (via providerId on the verified pool) before it can settle.
export type ScorerPool = {
  configured: boolean;
  // api-football squads, or a previous match's TxLINE lineup when the squad
  // provider is unavailable.
  provider: "api-football" | "txline";
  provisional: boolean;
  teams: ScorerPoolTeam[];
};

const teamCache = new Map<string, CachedValue<number | null>>();
const squadCache = new Map<string, CachedValue<ApiFootballPlayer[]>>();

// The free plan allows 100 requests a day, and the in-memory cache dies with
// every dev restart and serverless cold start - a restart-heavy afternoon
// burned the whole quota on 2026-07-16. The disk copy makes the cache survive
// the process. Best-effort on both ends; tests stay deterministic by skipping
// it. Only ever runs on the server: the client imports nothing but types from
// this module.
const DISK_CACHE_FILE = path.join(process.cwd(), "data", "api-football-cache.json");
let diskCacheLoaded = false;

function hydrateDiskCache(now: number) {
  if (diskCacheLoaded || process.env.NODE_ENV === "test") {
    return;
  }

  diskCacheLoaded = true;

  try {
    const raw = JSON.parse(fs.readFileSync(DISK_CACHE_FILE, "utf8")) as {
      squads?: Record<string, CachedValue<ApiFootballPlayer[]>>;
      teams?: Record<string, CachedValue<number | null>>;
    };

    for (const [key, value] of Object.entries(raw.teams ?? {})) {
      if (value.expiresAt > now && !teamCache.has(key)) {
        teamCache.set(key, value);
      }
    }

    for (const [key, value] of Object.entries(raw.squads ?? {})) {
      if (value.expiresAt > now && !squadCache.has(key)) {
        squadCache.set(key, value);
      }
    }
  } catch {
    // First run, or an unreadable file: start from the network as before.
  }
}

function persistDiskCache() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(DISK_CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      DISK_CACHE_FILE,
      JSON.stringify({
        squads: Object.fromEntries(squadCache),
        teams: Object.fromEntries(teamCache),
      }),
    );
  } catch {
    // The cache is an optimisation; failing to write it costs quota, not
    // correctness.
  }
}

const TEAM_ALIASES: Record<string, string> = {
  coteivoire: "ivorycoast",
  england: "england",
  korearepublic: "southkorea",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  usmnt: "usa",
};

const TEAM_SEARCH_NAMES: Record<string, string> = {
  ivorycoast: "Ivory Coast",
  southkorea: "South Korea",
  usa: "United States",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function canonicalTeam(value: string): string {
  const normalized = normalize(value);

  return TEAM_ALIASES[normalized] ?? normalized;
}

function displayOrderName(value: string): string {
  const [surname, given] = value.split(",").map((part) => part.trim());

  return given ? `${given} ${surname}` : value.trim();
}

function nameTokens(value: string): string[] {
  return displayOrderName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function nameParts(value: string): {
  family: string[];
  given: string[];
} {
  const commaIndex = value.indexOf(",");

  if (commaIndex >= 0) {
    return {
      family: nameTokens(value.slice(0, commaIndex)),
      given: nameTokens(value.slice(commaIndex + 1)),
    };
  }

  const tokens = nameTokens(value);

  return {
    family: tokens.slice(-1),
    given: tokens.slice(0, -1),
  };
}

function ageOn(dateOfBirth: string | undefined, now: number): number | null {
  if (!dateOfBirth) return null;

  const birth = new Date(dateOfBirth);

  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date(now);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() >= birth.getUTCDate());

  if (!birthdayHasPassed) age -= 1;

  return age;
}

function providerPosition(position: string | undefined): LineupPosition | null {
  switch (position?.toLowerCase()) {
    case "goalkeeper":
      return "GK";
    case "defender":
      return "DEF";
    case "midfielder":
      return "MID";
    case "attacker":
    case "forward":
      return "FWD";
    default:
      return null;
  }
}

function nameScore(txlineName: string, providerName: string): number {
  const txlineTokens = nameTokens(txlineName);
  const providerTokens = nameTokens(providerName);
  const txlineNormalized = txlineTokens.join("");
  const providerNormalized = providerTokens.join("");

  if (!txlineNormalized || !providerNormalized) return 0;
  if (txlineNormalized === providerNormalized) return 100;

  const txlineSet = new Set(txlineTokens);
  const providerSet = new Set(providerTokens);
  const overlap = [...txlineSet].filter((token) => providerSet.has(token)).length;
  const smallerSize = Math.min(txlineSet.size, providerSet.size);
  const largerSize = Math.max(txlineSet.size, providerSet.size);

  // Handles provider names that omit an additional family name while still
  // requiring at least a given name + surname match.
  if (smallerSize >= 2 && overlap === smallerSize) return 82;

  if (overlap >= 2 && overlap / largerSize >= 0.66) return 70;

  const txlineParts = nameParts(txlineName);
  const providerParts = nameParts(providerName);
  const sharedFamilyName = txlineParts.family.some((token) =>
    providerParts.family.includes(token),
  );

  if (sharedFamilyName) {
    const sharedGivenName = txlineParts.given.some((token) =>
      providerParts.given.includes(token),
    );
    const compatibleGivenName = txlineParts.given.some((txlineToken) =>
      providerParts.given.some(
        (providerToken) =>
          txlineToken[0] === providerToken[0] &&
          (txlineToken.length === 1 ||
            providerToken.length === 1 ||
            (Math.min(txlineToken.length, providerToken.length) >= 4 &&
              (txlineToken.startsWith(providerToken) ||
                providerToken.startsWith(txlineToken)))),
      ),
    );

    if (sharedGivenName) return 82;
    if (compatibleGivenName) return 78;

    // A family-name-only match needs exact age, number, and position to clear
    // the final confidence threshold below.
    return 58;
  }

  // Mononyms are valid in football, but need corroborating age/number data.
  if (
    smallerSize === 1 &&
    overlap === 1 &&
    (txlineTokens.length === 1 || providerTokens.length === 1)
  ) {
    return 55;
  }

  return 0;
}

function candidateScore(
  player: NormalizedLineupPlayer,
  candidate: ApiFootballPlayer,
  now: number,
): number {
  if (!candidate.name) return 0;

  let score = nameScore(player.name, candidate.name);

  if (!score) return 0;

  const age = ageOn(player.dateOfBirth, now);

  if (age !== null && typeof candidate.age === "number") {
    const ageDelta = Math.abs(age - candidate.age);

    if (ageDelta === 0) score += 12;
    else if (ageDelta === 1) score += 5;
    else score -= 25;
  }

  if (
    player.number &&
    candidate.number !== null &&
    candidate.number !== undefined
  ) {
    score += String(candidate.number) === player.number ? 15 : -8;
  }

  const position = providerPosition(candidate.position);

  if (player.position && position) {
    score += position === player.position ? 5 : -10;
  }

  return score;
}

function resolvePlayerMatch(
  player: NormalizedLineupPlayer,
  squad: ApiFootballPlayer[],
  now: number,
): ApiFootballPlayer | undefined {
  const ranked = squad
    .map((candidate) => ({
      candidate,
      score: candidateScore(player, candidate, now),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];

  // A high floor plus a clear lead avoids silently pairing the wrong squad mate
  // when names are short or shared.
  if (!best || best.score < 90) return undefined;
  if (runnerUp && best.score - runnerUp.score < 12) return undefined;

  return best.candidate;
}

function matchedPhoto(candidate: ApiFootballPlayer | undefined): string | undefined {
  return typeof candidate?.photo === "string" &&
    /^https:\/\//i.test(candidate.photo)
    ? candidate.photo
    : undefined;
}

function readCached<T>(
  cache: Map<string, CachedValue<T>>,
  key: string,
  now: number,
): T | undefined {
  const entry = cache.get(key);

  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

async function fetchApiFootball(
  path: string,
  apiKey: string,
  origin: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>[]> {
  const response = await fetcher(`${origin}${path}`, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 604800 },
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed with ${response.status}`);
  }

  const body = (await response.json()) as {
    errors?: unknown;
    response?: unknown;
  };
  const hasErrors =
    Array.isArray(body.errors)
      ? body.errors.length > 0
      : Boolean(
          body.errors &&
            typeof body.errors === "object" &&
            Object.keys(body.errors).length,
        );

  if (hasErrors || !Array.isArray(body.response)) {
    throw new Error("API-Football returned an invalid response");
  }

  return body.response.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object",
  );
}

async function resolveTeamId(
  teamName: string,
  apiKey: string,
  origin: string,
  fetcher: typeof fetch,
  now: number,
): Promise<number | null> {
  const canonical = canonicalTeam(teamName);
  const cacheKey = `${origin}:${canonical}`;
  hydrateDiskCache(now);

  const cached = readCached(teamCache, cacheKey, now);

  if (cached !== undefined) return cached;

  const query = TEAM_SEARCH_NAMES[canonical] ?? teamName;
  const results = await fetchApiFootball(
    `/teams?search=${encodeURIComponent(query)}`,
    apiKey,
    origin,
    fetcher,
  );
  const teams = results
    .map((entry) => entry.team)
    .filter(
      (team): team is ApiFootballTeam =>
        Boolean(team) && typeof team === "object",
    );
  const ranked = teams
    .filter((team) => typeof team.id === "number")
    .map((team) => {
      const name = typeof team.name === "string" ? team.name : "";
      const country = typeof team.country === "string" ? team.country : "";
      let score = team.national ? 30 : 0;

      if (canonicalTeam(name) === canonical) score += 100;
      if (canonicalTeam(country) === canonical) score += 70;

      return { id: team.id as number, score };
    })
    .sort((a, b) => b.score - a.score);
  const teamId = ranked[0] && ranked[0].score >= 70 ? ranked[0].id : null;

  teamCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: teamId,
  });
  persistDiskCache();

  return teamId;
}

async function fetchSquad(
  teamId: number,
  apiKey: string,
  origin: string,
  fetcher: typeof fetch,
  now: number,
): Promise<ApiFootballPlayer[]> {
  const cacheKey = `${origin}:${teamId}`;
  hydrateDiskCache(now);

  const cached = readCached(squadCache, cacheKey, now);

  if (cached) return cached;

  const results = await fetchApiFootball(
    `/players/squads?team=${teamId}`,
    apiKey,
    origin,
    fetcher,
  );
  const first = results[0];
  const players = Array.isArray(first?.players)
    ? first.players.filter(
        (player): player is ApiFootballPlayer =>
          Boolean(player) && typeof player === "object",
      )
    : [];

  squadCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: players,
  });
  persistDiskCache();

  return players;
}

async function resolveTeamSquad(
  teamName: string,
  apiKey: string,
  origin: string,
  fetcher: typeof fetch,
  now: number,
): Promise<ApiFootballPlayer[]> {
  const teamId = await resolveTeamId(
    teamName,
    apiKey,
    origin,
    fetcher,
    now,
  );

  return teamId === null
    ? []
    : fetchSquad(teamId, apiKey, origin, fetcher, now);
}

export async function enrichLineupsWithApiFootballImages(
  lineups: NormalizedLineups | null,
  options: ResolverOptions = {},
): Promise<PlayerMediaEnrichment> {
  const apiKey = options.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
  const origin = (options.origin ?? process.env.API_FOOTBALL_ORIGIN ?? DEFAULT_ORIGIN)
    .replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();

  if (!lineups || !apiKey) {
    return {
      configured: Boolean(apiKey),
      lineups,
      provider: "api-football",
      resolved: 0,
    };
  }

  try {
    const squads = await Promise.all(
      lineups.teams.map(async (team) => {
        try {
          return await resolveTeamSquad(
            team.teamName,
            apiKey,
            origin,
            fetcher,
            now,
          );
        } catch {
          return [];
        }
      }),
    );
    let resolved = 0;
    const teams = lineups.teams.map((team, teamIndex) => ({
      ...team,
      players: team.players.map((player) => {
        if (player.imageUrl) return player;

        const imageUrl = matchedPhoto(
          resolvePlayerMatch(player, squads[teamIndex] ?? [], now),
        );

        if (!imageUrl) return player;

        resolved += 1;
        return { ...player, imageUrl };
      }),
    }));

    return {
      configured: true,
      lineups: resolved > 0 ? { ...lineups, teams } : lineups,
      provider: "api-football",
      resolved,
    };
  } catch {
    // Player media is progressive enhancement. TxLINE lineups remain usable
    // when the optional provider is unavailable or its quota is exhausted.
    return {
      configured: true,
      lineups,
      provider: "api-football",
      resolved: 0,
    };
  }
}

function verifiedPoolTeams(
  lineups: NormalizedLineups,
  squads: ApiFootballPlayer[][],
  now: number,
): ScorerPoolTeam[] {
  return lineups.teams.map((team, teamIndex) => ({
    isHome: team.isHome,
    players: team.players.flatMap((player) => {
      // A player TxLINE carries no id for can never settle, so it is not offered.
      if (typeof player.playerId !== "number") return [];

      const match = resolvePlayerMatch(player, squads[teamIndex] ?? [], now);
      const shirtNumber = Number.parseInt(player.number ?? "", 10);

      return [
        {
          imageUrl: player.imageUrl ?? matchedPhoto(match),
          name: player.name,
          playerId: player.playerId,
          position: player.position,
          providerId: match?.id,
          shirtNumber: Number.isFinite(shirtNumber) ? shirtNumber : undefined,
        },
      ];
    }),
    teamName: team.teamName,
  }));
}

function provisionalPoolTeams(
  teams: Array<{ isHome: boolean; teamName: string }>,
  squads: ApiFootballPlayer[][],
): ScorerPoolTeam[] {
  return teams.map((team, teamIndex) => ({
    isHome: team.isHome,
    players: (squads[teamIndex] ?? []).flatMap((player) =>
      typeof player.id === "number" && player.name
        ? [
            {
              imageUrl: matchedPhoto(player),
              name: player.name,
              playerId: player.id,
              position: providerPosition(player.position) ?? undefined,
              providerId: player.id,
              shirtNumber:
                typeof player.number === "number" ? player.number : undefined,
            },
          ]
        : [],
    ),
    teamName: team.teamName,
  }));
}

// Builds the player pool the scorer markets pick from: the TxLINE XI once it
// exists, otherwise the provider squad so the markets are playable in the days
// before kickoff rather than only in the final hour.
export async function resolveScorerPool(
  lineups: NormalizedLineups | null,
  fixtureTeams: Array<{ isHome: boolean; teamName: string }>,
  options: ResolverOptions = {},
): Promise<ScorerPool> {
  const apiKey = options.apiKey ?? process.env.API_FOOTBALL_KEY ?? "";
  const origin = (
    options.origin ??
    process.env.API_FOOTBALL_ORIGIN ??
    DEFAULT_ORIGIN
  ).replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  // The TxLINE XI names the teams itself; before it lands the fixture does.
  const teams = lineups
    ? lineups.teams.map((team) => ({
        isHome: team.isHome,
        teamName: team.teamName,
      }))
    : fixtureTeams;

  if (!apiKey) {
    return {
      configured: false,
      provider: "api-football",
      provisional: false,
      teams: lineups ? verifiedPoolTeams(lineups, [], now) : [],
    };
  }

  let squads: ApiFootballPlayer[][] = [];

  try {
    squads = await Promise.all(
      teams.map(async (team) => {
        try {
          return await resolveTeamSquad(team.teamName, apiKey, origin, fetcher, now);
        } catch {
          return [];
        }
      }),
    );
  } catch {
    squads = [];
  }

  if (lineups) {
    return {
      configured: true,
      provider: "api-football",
      provisional: false,
      teams: verifiedPoolTeams(lineups, squads, now),
    };
  }

  const provisional = provisionalPoolTeams(teams, squads);
  // A pool missing one side would read as "that team cannot score", so a
  // half-resolved provisional pool is treated as no pool at all.
  const usable =
    provisional.length > 0 && provisional.every((team) => team.players.length);

  return {
    configured: true,
    provider: "api-football",
    provisional: true,
    teams: usable ? provisional : [],
  };
}

export function clearApiFootballMediaCache(): void {
  teamCache.clear();
  squadCache.clear();
}
