import { v } from "convex/values";

import { internalAction } from "./_generated/server";

// TxLINE feed access from the server (Convex). Convex can't import from src/,
// so the fetch + credentials + a focused score normalizer live here, ported
// from src/lib/txline-client.ts + src/lib/txline-normalize.ts. We only pull
// what the live-call bot needs: goals, status, clock — not player stats/cards.

function txlineConfig() {
  const network =
    process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet";
  const apiOrigin =
    process.env.TXLINE_API_ORIGIN ??
    (network === "mainnet"
      ? "https://txline.txodds.com"
      : "https://txline-dev.txodds.com");

  return {
    apiBaseUrl: `${apiOrigin}/api`,
    jwt: process.env.TXLINE_JWT,
    token: process.env.TXLINE_API_TOKEN,
  };
}

async function txlineFetch(path: string): Promise<Response> {
  const config = txlineConfig();

  if (!config.jwt || !config.token) {
    throw new Error("TxLINE credentials are not configured on this deployment.");
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${config.jwt}`,
      "X-Api-Token": config.token,
    },
  });

  if (!response.ok) {
    throw new Error(`TxLINE request failed: ${response.status}`);
  }

  return response;
}

// --- reading helpers (ported verbatim from txline-normalize.ts) -------------
function readNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "number" ? value : undefined;
}

function readBoolean(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "boolean" ? value : undefined;
}

function readRecord(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "string" ? value : undefined;
}

// Stats on one record: either an array of {Key,Value} or an object map keyed by
// the stat id. Key 1 = participant-1 goals, key 2 = participant-2 goals.
function statsOf(entry: Record<string, unknown>): Array<{
  key: number;
  value: number;
}> {
  for (const key of ["stats", "Stats", "statistics", "Statistics"]) {
    const value = entry[key];

    if (Array.isArray(value)) {
      return value
        .map((stat) => ({
          key: Number((stat as Record<string, unknown>).Key),
          value: Number((stat as Record<string, unknown>).Value),
        }))
        .filter((stat) => Number.isFinite(stat.key) && Number.isFinite(stat.value));
    }

    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>)
        .map(([statKey, statValue]) => ({
          key: Number(statKey),
          value: Number(statValue),
        }))
        .filter((stat) => Number.isFinite(stat.key) && Number.isFinite(stat.value));
    }
  }

  return [];
}

export type FixtureScore = {
  awayGoals: number;
  clockSeconds?: number;
  ended: boolean;
  gameState?: string;
  homeGoals: number;
  inPlay: boolean;
  statusId?: number;
  totalGoals: number;
};

// TxLINE StatusIds: 2/4 halves, 3 HT, 6-9 extra-time phases (all in play);
// 5 = full time, 10+ = over after ET / finalised. (Ported from home-page.tsx.)
const IN_PLAY_STATUS_IDS = new Set([2, 3, 4, 6, 7, 8, 9]);

export function statusInPlay(statusId?: number): boolean {
  return statusId !== undefined && IN_PLAY_STATUS_IDS.has(statusId);
}

export function statusEnded(statusId?: number): boolean {
  return statusId !== undefined && (statusId === 5 || statusId >= 10);
}

// Fold a snapshot (array of event records) into the current goals/status/clock.
// Records are walked oldest -> newest (ascending Seq) so the latest non-empty
// value for each stat wins, and status/clock come from the highest-Seq entry.
export function normalizeScore(raw: unknown): FixtureScore {
  const entries = (Array.isArray(raw) ? raw : [raw]).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
  );
  const ascending = [...entries].sort(
    (left, right) => (readNumber(left, "Seq") ?? 0) - (readNumber(right, "Seq") ?? 0),
  );
  const latest = ascending[ascending.length - 1];

  const participant1IsHome = readBoolean(latest, "Participant1IsHome") ?? true;
  const homeBase = participant1IsHome ? 1 : 2;
  const awayBase = participant1IsHome ? 2 : 1;

  const statMap = new Map<number, number>();
  for (const entry of ascending) {
    for (const stat of statsOf(entry)) {
      statMap.set(stat.key, stat.value);
    }
  }

  const data = readRecord(latest, "Data");
  const clock = readRecord(latest, "Clock");
  const statusId =
    readNumber(latest, "StatusId") ?? readNumber(data, "StatusId");
  const homeGoals = statMap.get(homeBase) ?? 0;
  const awayGoals = statMap.get(awayBase) ?? 0;

  return {
    awayGoals,
    clockSeconds: readNumber(clock, "Seconds"),
    ended: statusEnded(statusId),
    gameState: readString(latest, "GameState"),
    homeGoals,
    inPlay: statusInPlay(statusId),
    statusId,
    totalGoals: homeGoals + awayGoals,
  };
}

// Fetch + normalize one fixture's current score. Plain helper so pollers can
// call it directly (no action-to-action hop).
export async function getFixtureScore(fixtureId: number): Promise<FixtureScore> {
  const response = await txlineFetch(`/scores/snapshot/${fixtureId}`);

  return normalizeScore(await response.json());
}

// Testable wrapper: read one fixture's normalized score via the MCP / dashboard.
export const fetchScore = internalAction({
  args: { fixtureId: v.number() },
  returns: v.object({
    awayGoals: v.number(),
    clockSeconds: v.union(v.number(), v.null()),
    ended: v.boolean(),
    gameState: v.union(v.string(), v.null()),
    homeGoals: v.number(),
    inPlay: v.boolean(),
    statusId: v.union(v.number(), v.null()),
    totalGoals: v.number(),
  }),
  handler: async (_ctx, args) => {
    const score = await getFixtureScore(args.fixtureId);

    return {
      awayGoals: score.awayGoals,
      clockSeconds: score.clockSeconds ?? null,
      ended: score.ended,
      gameState: score.gameState ?? null,
      homeGoals: score.homeGoals,
      inPlay: score.inPlay,
      statusId: score.statusId ?? null,
      totalGoals: score.totalGoals,
    };
  },
});
