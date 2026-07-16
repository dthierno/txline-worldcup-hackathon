import { getTxlineConfig } from "./txline-config";
import {
  buildOddsBoard,
  buildOddsMovementSeries,
  extractLineups,
  normalizeOddsSnapshot,
  normalizeOddsValidation,
  normalizeScoreSnapshot,
  normalizeValidationSummary,
  normalizeValidationSummaryV3,
  parseSsePayloads,
  parseTxlinePayloads,
  readNumber,
  type NormalizedLineups,
  type NormalizedTxlineOdds,
  type NormalizedTxlineScore,
  type NormalizedTxlineScoreUpdate,
  type OddsBoard,
  type TxlineOddsSeriesPoint,
  type TxlineOddsValidationSummary,
  type TxlineValidationSummary,
  type TxlineValidationV3Summary,
} from "./txline-normalize";
import type { WorldCupFixture } from "./world-cup-fixtures";

export {
  buildOddsMovementSeries,
  computePossessionSplit,
  extractLineups,
  findFirstGoal,
  normalizeOddsSnapshot,
  normalizeScoreSnapshot,
  normalizeValidationSummary,
  withoutRaw,
} from "./txline-normalize";
export type {
  FirstGoal,
  NormalizedLineups,
  NormalizedTxlineOdds,
  NormalizedTxlineOddsMarket,
  NormalizedTxlineScore,
  NormalizedTxlineScoreUpdate,
  PossessionSplit,
  TxlineOddsSeriesPoint,
  TxlineScoreStat,
  TxlineValidationSummary,
} from "./txline-normalize";

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

export type TxlineOddsUpdatesSummary = {
  board: OddsBoard;
  // Latest pre-match prices (closing line): the meaningful board once a match
  // has started or finished, when `board` holds extreme in-play prices.
  closingBoard: OddsBoard;
  count: number;
  latestTs: number | null;
  marketTypes: string[];
  series: TxlineOddsSeriesPoint[];
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

export async function fetchTxlineHistoricalScoreUpdates(
  fixtureId: number,
): Promise<NormalizedTxlineScoreUpdate[]> {
  const response = await txlineFetch(`/scores/historical/${fixtureId}`, {
    accept: "text/event-stream",
    cache: "no-cache",
  });
  const text = await response.text();
  const updates = parseTxlinePayloads(text);

  return updates.map((raw, index) => {
    const normalized = normalizeScoreSnapshot(raw);

    return {
      ...normalized,
      id: `historical-${String(normalized.seq ?? index)}`,
    };
  });
}

// Lineups (with real player names) arrive as records on the score feeds: the
// current updates feed pre-match and during play, the historical replay after.
export async function fetchTxlineLineups(
  fixtureId: number,
): Promise<NormalizedLineups | null> {
  const updatesResponse = await txlineFetch(`/scores/updates/${fixtureId}`, {
    accept: "text/event-stream",
    cache: "no-cache",
  });
  const fromUpdates = extractLineups(
    parseSsePayloads(await updatesResponse.text()),
  );

  if (fromUpdates) {
    return fromUpdates;
  }

  const historicalResponse = await txlineFetch(
    `/scores/historical/${fixtureId}`,
    {
      accept: "text/event-stream",
      cache: "no-cache",
    },
  );
  return extractLineups(parseTxlinePayloads(await historicalResponse.text()));
}

export async function fetchTxlineOddsSnapshot(
  fixtureId: number,
): Promise<NormalizedTxlineOdds> {
  const response = await txlineFetch(`/odds/snapshot/${fixtureId}`);
  const raw = await response.json();

  return normalizeOddsSnapshot(raw);
}

export async function fetchTxlineOddsUpdates(
  fixtureId: number,
): Promise<TxlineOddsUpdatesSummary> {
  const response = await txlineFetch(`/odds/updates/${fixtureId}`);
  const raw = await response.json();
  const entries = Array.isArray(raw) ? raw : [];
  const marketTypes = Array.from(
    new Set(
      entries
        .map((entry) =>
          entry && typeof entry === "object"
            ? String((entry as Record<string, unknown>).SuperOddsType ?? "")
            : "",
        )
        .filter(Boolean),
    ),
  );
  const latestTs = entries.reduce<number | null>((latest, entry) => {
    const ts =
      entry && typeof entry === "object"
        ? readNumber(entry as Record<string, unknown>, "Ts")
        : undefined;

    return typeof ts === "number" && (latest === null || ts > latest)
      ? ts
      : latest;
  }, null);

  return {
    board: buildOddsBoard(entries),
    closingBoard: buildOddsBoard(
      entries.filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          !(entry as Record<string, unknown>).InRunning,
      ),
    ),
    count: entries.length,
    latestTs,
    marketTypes,
    series: buildOddsMovementSeries(entries),
  };
}

export async function fetchTxlineScoreStatValidation({
  fixtureId,
  seq,
  statKey,
  statKey2,
}: {
  fixtureId: number;
  seq: number;
  statKey: number;
  statKey2?: number;
}): Promise<TxlineValidationSummary> {
  const params = new URLSearchParams({
    fixtureId: String(fixtureId),
    seq: String(seq),
    statKey: String(statKey),
  });

  if (typeof statKey2 === "number") {
    params.set("statKey2", String(statKey2));
  }

  const response = await txlineFetch(`/scores/stat-validation?${params}`);
  const raw = await response.json();

  return normalizeValidationSummary(raw);
}

// stat-validation-v3: compressed multiproof for up to 5 stat keys per call,
// returning the proven values alongside the Merkle material.
export async function fetchTxlineScoreStatValidationV3({
  fixtureId,
  seq,
  statKeys,
}: {
  fixtureId: number;
  seq: number;
  statKeys: number[];
}): Promise<TxlineValidationV3Summary> {
  const params = new URLSearchParams({
    fixtureId: String(fixtureId),
    seq: String(seq),
    statKeys: statKeys.join(","),
  });
  const response = await txlineFetch(`/scores/stat-validation-v3?${params}`);

  return normalizeValidationSummaryV3(await response.json());
}

// Merkle proof for a single odds record: the fixture's closing full-match 1X2
// line (latest pre-match record - the odds predictions settle against),
// falling back to the latest in-play record before kickoff data exists.
export async function fetchTxlineOddsValidationForFixture(
  fixtureId: number,
): Promise<TxlineOddsValidationSummary | null> {
  const updatesResponse = await txlineFetch(`/odds/updates/${fixtureId}`);
  const raw = await updatesResponse.json();
  const entries = (Array.isArray(raw) ? raw : []).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
  );
  const priced = entries
    .filter(
      (entry) =>
        entry.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
        !entry.MarketPeriod &&
        Array.isArray(entry.Prices) &&
        entry.Prices.length >= 3 &&
        typeof entry.MessageId === "string" &&
        typeof entry.Ts === "number",
    )
    .sort((left, right) => (readNumber(right, "Ts") ?? 0) - (readNumber(left, "Ts") ?? 0));
  const candidate = priced.find((entry) => !entry.InRunning) ?? priced[0];

  if (!candidate) {
    return null;
  }

  const params = new URLSearchParams({
    messageId: String(candidate.MessageId),
    ts: String(candidate.Ts),
  });
  const response = await txlineFetch(`/odds/validation?${params}`);

  return normalizeOddsValidation(await response.json());
}

export async function fetchTxlineFixtureBatchValidation(): Promise<unknown> {
  const response = await txlineFetch("/fixtures/batch-validation");

  return response.json();
}

export async function openTxlineStream(
  stream: "odds" | "scores",
): Promise<Response> {
  return txlineFetch(`/${stream}/stream`, {
    accept: "text/event-stream",
    cache: "no-cache",
  });
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
