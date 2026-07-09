import { getTxlineConfig } from "./txline-config";
import type { WorldCupFixture } from "./world-cup-fixtures";

type TxlineFixture = {
  Competition?: string;
  Fixture?: string;
  FixtureGroupId?: number;
  FixtureId: number;
  Participant1: string;
  Participant1IsHome: boolean;
  Participant2: string;
  StartTime: number | string;
};

export type TxlineScoreStat = {
  key?: number;
  name?: string;
  value?: number;
  Key?: number;
  Value?: number;
};

export type NormalizedTxlineScore = {
  action?: string;
  awayCorners: number;
  awayGoals: number;
  awayRedCards: number;
  awayYellowCards: number;
  gameState?: string;
  homeCorners: number;
  homeGoals: number;
  homeRedCards: number;
  homeYellowCards: number;
  raw: unknown;
  seq?: number;
  ts?: number;
};

export type NormalizedTxlineScoreUpdate = NormalizedTxlineScore & {
  id: string;
};

export type NormalizedTxlineOddsMarket = {
  inRunning: boolean;
  marketParameters: string | null;
  marketPeriod: string | null;
  priceNames: string[];
  prices: number[];
  probabilities: number[];
  type: string;
};

export type NormalizedTxlineOdds = {
  awayWinProbability: number | null;
  drawProbability: number | null;
  homeWinProbability: number | null;
  marketNote: string;
  markets: NormalizedTxlineOddsMarket[];
  raw: unknown;
};

export async function fetchTxlineFixtures(): Promise<WorldCupFixture[]> {
  const response = await txlineFetch("/fixtures/snapshot");
  const fixtures = (await response.json()) as TxlineFixture[];

  return fixtures.map((fixture) => {
    const homeTeam = fixture.Participant1IsHome
      ? fixture.Participant1
      : fixture.Participant2;
    const awayTeam = fixture.Participant1IsHome
      ? fixture.Participant2
      : fixture.Participant1;
    const fixtureGroup =
      fixture.Fixture ??
      `${fixture.Competition ?? "TxLINE fixture"}${
        fixture.FixtureGroupId ? ` > ${fixture.FixtureGroupId}` : ""
      }`;
    const stage =
      fixture.Fixture?.split(">").at(-1)?.trim() ??
      fixture.Competition ??
      "Scheduled";

    return {
      awayTeam,
      fixtureGroup,
      fixtureId: fixture.FixtureId,
      homeTeam,
      kickoffUtc:
        typeof fixture.StartTime === "number"
          ? new Date(fixture.StartTime).toISOString()
          : fixture.StartTime,
      stage,
    };
  });
}

export async function fetchTxlineScoreSnapshot(
  fixtureId: number,
): Promise<NormalizedTxlineScore> {
  const response = await txlineFetch(`/scores/snapshot/${fixtureId}`);
  const raw = await response.json();

  return normalizeScoreSnapshot(raw);
}

export async function fetchTxlineScoreUpdates(
  fixtureId: number,
): Promise<NormalizedTxlineScoreUpdate[]> {
  const response = await txlineFetch(`/scores/updates/${fixtureId}`, {
    accept: "text/event-stream",
    cache: "no-cache",
  });
  const text = await response.text();
  const updates = parseSsePayloads(text);

  return updates.map((raw, index) => {
    const normalized = normalizeScoreSnapshot(raw);

    return {
      ...normalized,
      id: String(normalized.seq ?? index),
    };
  });
}

export async function fetchTxlineOddsSnapshot(
  fixtureId: number,
): Promise<NormalizedTxlineOdds> {
  const response = await txlineFetch(`/odds/snapshot/${fixtureId}`);
  const raw = await response.json();

  return normalizeOddsSnapshot(raw);
}

export function normalizeScoreSnapshot(raw: unknown): NormalizedTxlineScore {
  const stats = extractStats(raw);
  const statMap = new Map<number, number>();
  const latestEntry = getLatestScoreEntry(raw);

  for (const stat of stats) {
    const key = stat.key ?? stat.Key;
    const value = stat.value ?? stat.Value;

    if (typeof key === "number" && typeof value === "number") {
      statMap.set(key, value);
    }
  }

  return {
    action: readString(latestEntry, "Action"),
    awayCorners: statMap.get(8) ?? 0,
    awayGoals: statMap.get(2) ?? 0,
    awayRedCards: statMap.get(6) ?? 0,
    awayYellowCards: statMap.get(4) ?? 0,
    gameState: readString(latestEntry, "GameState"),
    homeCorners: statMap.get(7) ?? 0,
    homeGoals: statMap.get(1) ?? 0,
    homeRedCards: statMap.get(5) ?? 0,
    homeYellowCards: statMap.get(3) ?? 0,
    raw,
    seq: readNumber(latestEntry, "Seq"),
    ts: readNumber(latestEntry, "Ts"),
  };
}

export function normalizeOddsSnapshot(raw: unknown): NormalizedTxlineOdds {
  const entries = Array.isArray(raw) ? raw : [];
  const markets = entries
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .map((entry) => ({
      inRunning: Boolean(entry.InRunning),
      marketParameters:
        typeof entry.MarketParameters === "string"
          ? entry.MarketParameters
          : null,
      marketPeriod:
        typeof entry.MarketPeriod === "string" ? entry.MarketPeriod : null,
      priceNames: Array.isArray(entry.PriceNames)
        ? entry.PriceNames.map(String)
        : [],
      prices: Array.isArray(entry.Prices)
        ? entry.Prices.map((price) => Number(price))
        : [],
      probabilities: Array.isArray(entry.Pct)
        ? entry.Pct.map((pct) => Number(pct))
        : [],
      type: typeof entry.SuperOddsType === "string" ? entry.SuperOddsType : "Market",
    }));
  const resultMarket = markets.find(
    (market) => market.type === "1X2_PARTICIPANT_RESULT",
  );

  return {
    awayWinProbability: resultMarket?.probabilities[2] ?? null,
    drawProbability: resultMarket?.probabilities[1] ?? null,
    homeWinProbability: resultMarket?.probabilities[0] ?? null,
    marketNote: resultMarket
      ? `TxLINE 1X2: ${formatPct(resultMarket.probabilities[0])} / ${formatPct(
          resultMarket.probabilities[1],
        )} / ${formatPct(resultMarket.probabilities[2])}`
      : `${markets.length} TxLINE odds markets available`,
    markets,
    raw,
  };
}

async function txlineFetch(
  path: string,
  options: { accept?: string; cache?: string } = {},
): Promise<Response> {
  const config = getTxlineConfig();

  if (!config.configured) {
    throw new Error("TxLINE credentials are not configured");
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    cache: "no-store",
    headers: {
      ...(options.accept ? { Accept: options.accept } : {}),
      Authorization: `Bearer ${config.jwt}`,
      ...(options.cache ? { "Cache-Control": options.cache } : {}),
      "X-Api-Token": config.token!,
    },
  });

  if (!response.ok) {
    throw new Error(`TxLINE request failed: ${response.status}`);
  }

  return response;
}

function extractStats(raw: unknown): TxlineScoreStat[] {
  if (Array.isArray(raw)) {
    return raw.flatMap(extractStats);
  }

  if (!raw || typeof raw !== "object") {
    return [];
  }

  const record = raw as Record<string, unknown>;

  for (const key of ["stats", "Stats", "statistics", "Statistics"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as TxlineScoreStat[];
    }
    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).map(([statKey, statValue]) => ({
        key: Number(statKey),
        value: Number(statValue),
      }));
    }
  }

  return [];
}

function parseSsePayloads(text: string): unknown[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n"),
    )
    .filter(Boolean)
    .map((data) => {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    });
}

function getLatestScoreEntry(raw: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object"),
      )
      .sort((left, right) => (readNumber(right, "Seq") ?? 0) - (readNumber(left, "Seq") ?? 0))[0];
  }

  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }

  return undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "number" ? value : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];

  return typeof value === "string" ? value : undefined;
}

function formatPct(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : "n/a";
}
