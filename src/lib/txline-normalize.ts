// Pure TxLINE payload normalizers. This module must stay free of server-only
// imports (config, credentials) so the browser can normalize stream records.

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
  clockSeconds?: number;
  data?: Record<string, unknown>;
  // TxLINE event Id: shared by the multiple feed records one real-world event
  // can emit (unconfirmed then confirmed), used to dedupe event counts.
  eventId?: number;
  gameState?: string;
  homeCorners: number;
  homeGoals: number;
  homeRedCards: number;
  homeYellowCards: number;
  participant?: number;
  participant1IsHome: boolean;
  // Which participant (1|2) has the ball, from live possession-phase records.
  possession?: number;
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

export type TxlineOddsSeriesPoint = {
  away: number;
  draw: number;
  home: number;
  ts: number;
};

export type NormalizedLineupPlayer = {
  name: string;
  number?: string;
  playerId?: number;
  starter: boolean;
};

export type NormalizedLineupTeam = {
  isHome: boolean;
  players: NormalizedLineupPlayer[];
  teamName: string;
};

export type NormalizedLineups = {
  teams: NormalizedLineupTeam[];
  ts?: number;
};

export type PossessionSplit = {
  team1Pct: number;
  team1Seconds: number;
  team2Pct: number;
  team2Seconds: number;
};

export type FirstGoal = {
  playerId?: number;
  scoringSide: "home" | "away";
};

export type GoalEvent = {
  awayGoals: number;
  clockSeconds?: number;
  homeGoals: number;
  playerId?: number;
  scoringSide: "home" | "away";
  seq: number;
};

export type SubstitutionEvent = {
  clockSeconds?: number;
  playerInId?: number;
  playerOutId?: number;
};

export type TxlineValidationSummary = {
  eventStatRoot?: unknown;
  fixtureId?: number;
  mainTreeProofCount: number;
  statKeys: number[];
  statProofCount: number;
  subTreeProofCount: number;
  ts?: number;
  updateCount?: number;
};

export function withoutRaw<T extends { raw?: unknown }>(value: T): Omit<T, "raw"> {
  const clone = { ...value };

  delete clone.raw;

  return clone;
}

export function normalizeScoreSnapshot(raw: unknown): NormalizedTxlineScore {
  const stats = extractStats(raw);
  const statMap = new Map<number, number>();
  const latestEntry = getLatestScoreEntry(raw);
  const participant1IsHome = readBoolean(latestEntry, "Participant1IsHome") ?? true;
  const data = readRecord(latestEntry, "Data");
  const clock = readRecord(latestEntry, "Clock");
  const participant =
    readNumber(latestEntry, "Participant") ?? readNumber(data, "Participant");
  const homeBase = participant1IsHome ? 1 : 2;
  const awayBase = participant1IsHome ? 2 : 1;

  for (const stat of stats) {
    const key = stat.key ?? stat.Key;
    const value = stat.value ?? stat.Value;

    if (typeof key === "number" && typeof value === "number") {
      statMap.set(key, value);
    }
  }

  return {
    action: readString(latestEntry, "Action"),
    awayCorners: statMap.get(awayBase + 6) ?? 0,
    eventId: readNumber(latestEntry, "Id"),
    awayGoals: statMap.get(awayBase) ?? 0,
    awayRedCards: statMap.get(awayBase + 4) ?? 0,
    awayYellowCards: statMap.get(awayBase + 2) ?? 0,
    clockSeconds: readNumber(clock, "Seconds"),
    data,
    gameState: readString(latestEntry, "GameState"),
    homeCorners: statMap.get(homeBase + 6) ?? 0,
    homeGoals: statMap.get(homeBase) ?? 0,
    homeRedCards: statMap.get(homeBase + 4) ?? 0,
    homeYellowCards: statMap.get(homeBase + 2) ?? 0,
    participant,
    participant1IsHome,
    possession: readNumber(latestEntry, "Possession"),
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

// Compresses a raw list of odds update records into a bounded 1X2 movement
// series: full-match result market only, sorted by timestamp, keeping a point
// only when any probability moved by at least minMovePct versus the last kept
// point, capped to the most recent maxPoints entries.
export function buildOddsMovementSeries(
  raw: unknown,
  { maxPoints = 30, minMovePct = 0.5 }: { maxPoints?: number; minMovePct?: number } = {},
): TxlineOddsSeriesPoint[] {
  const entries = Array.isArray(raw) ? raw : [];
  const candidates = entries
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .filter(
      (entry) =>
        entry.SuperOddsType === "1X2_PARTICIPANT_RESULT" &&
        !entry.MarketParameters &&
        !entry.MarketPeriod,
    )
    .map((entry) => {
      const pct = Array.isArray(entry.Pct) ? entry.Pct.map(Number) : [];
      const ts = readNumber(entry, "Ts");

      return pct.length >= 3 && pct.every(Number.isFinite) && typeof ts === "number"
        ? { away: pct[2], draw: pct[1], home: pct[0], ts }
        : null;
    })
    .filter((point): point is TxlineOddsSeriesPoint => point !== null)
    .sort((left, right) => left.ts - right.ts);

  const series: TxlineOddsSeriesPoint[] = [];

  for (const point of candidates) {
    const last = series[series.length - 1];
    const moved =
      !last ||
      Math.abs(point.home - last.home) >= minMovePct ||
      Math.abs(point.draw - last.draw) >= minMovePct ||
      Math.abs(point.away - last.away) >= minMovePct;

    if (moved) {
      series.push(point);
    }
  }

  return series.length > maxPoints ? series.slice(-maxPoints) : series;
}

// Pulls the most recent lineups record out of a raw TxLINE score feed.
// Player names come from the lineup player objects; the `normativeId` there is
// the same ID goal events carry as Data.PlayerId.
export function extractLineups(records: unknown[]): NormalizedLineups | null {
  const lineupRecords = records
    .filter((record): record is Record<string, unknown> =>
      Boolean(record && typeof record === "object"),
    )
    .filter(
      (record) =>
        record.Action === "lineups" && Array.isArray(record.Lineups),
    )
    .sort((left, right) => (readNumber(left, "Seq") ?? 0) - (readNumber(right, "Seq") ?? 0));
  const latest = lineupRecords[lineupRecords.length - 1];

  if (!latest) {
    return null;
  }

  const participant1Id = readNumber(latest, "Participant1Id");
  const participant1IsHome = latest.Participant1IsHome !== false;
  const teams = (latest.Lineups as unknown[])
    .filter((team): team is Record<string, unknown> =>
      Boolean(team && typeof team === "object"),
    )
    .map((team) => {
      const isParticipant1 = readNumber(team, "normativeId") === participant1Id;
      const players = (Array.isArray(team.lineups) ? team.lineups : [])
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object"),
        )
        .map((entry) => {
          const player =
            entry.player && typeof entry.player === "object"
              ? (entry.player as Record<string, unknown>)
              : undefined;

          return {
            name:
              typeof player?.preferredName === "string"
                ? player.preferredName
                : "Unknown player",
            number:
              typeof entry.rosterNumber === "string"
                ? entry.rosterNumber
                : undefined,
            playerId: readNumber(player, "normativeId"),
            starter: entry.starter === true,
          };
        })
        .sort((left, right) => Number(right.starter) - Number(left.starter));

      return {
        isHome: participant1IsHome ? isParticipant1 : !isParticipant1,
        players,
        teamName:
          typeof team.preferredName === "string"
            ? team.preferredName
            : "Unknown team",
      };
    })
    .sort((left, right) => Number(right.isHome) - Number(left.isHome));

  return {
    teams,
    ts: readNumber(latest, "Ts"),
  };
}

// Accumulates ball-in-play seconds per participant from the possession-phase
// records TxLINE streams (safe/attack/danger possession etc.). Returns null
// until at least a minute of play has been attributed.
export function computePossessionSplit(
  updates: Array<{
    clockSeconds?: number;
    possession?: number;
    seq?: number;
  }>,
): PossessionSplit | null {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const seconds = { 1: 0, 2: 0 };
  let currentTeam: 1 | 2 | null = null;
  let lastClock: number | null = null;

  for (const update of sorted) {
    const clock = update.clockSeconds;

    if (typeof clock === "number" && Number.isFinite(clock)) {
      if (currentTeam !== null && lastClock !== null && clock > lastClock) {
        seconds[currentTeam] += clock - lastClock;
      }

      lastClock = clock;
    }

    if (update.possession === 1 || update.possession === 2) {
      currentTeam = update.possession;
    }
  }

  const tracked = seconds[1] + seconds[2];

  if (tracked < 60) {
    return null;
  }

  return {
    team1Pct: Math.round((seconds[1] / tracked) * 100),
    team1Seconds: seconds[1],
    team2Pct: Math.round((seconds[2] / tracked) * 100),
    team2Seconds: seconds[2],
  };
}

type GoalSourceUpdate = {
  action?: string;
  awayGoals: number;
  clockSeconds?: number;
  data?: Record<string, unknown>;
  homeGoals: number;
  participant?: number;
  participant1IsHome: boolean;
  seq?: number;
};

// Every goal of the match: score advances mark the goals; the scorer PlayerId
// can sit on a sibling record of the same goal (TxLINE emits several records
// per real-world event), so search goal-action records in a window from just
// before the advance up to the next goal.
export function extractGoals(updates: GoalSourceUpdate[]): GoalEvent[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const goals: Array<Omit<GoalEvent, "playerId">> = [];
  let previousHome = 0;
  let previousAway = 0;

  for (const update of sorted) {
    if (update.homeGoals > previousHome || update.awayGoals > previousAway) {
      goals.push({
        awayGoals: update.awayGoals,
        clockSeconds: update.clockSeconds,
        homeGoals: update.homeGoals,
        scoringSide: update.homeGoals > previousHome ? "home" : "away",
        seq: update.seq ?? 0,
      });
    }

    previousHome = Math.max(previousHome, update.homeGoals);
    previousAway = Math.max(previousAway, update.awayGoals);
  }

  return goals.map((goal, index) => {
    const nextGoalSeq =
      goals[index + 1]?.seq ?? Number.POSITIVE_INFINITY;
    let playerId: number | undefined;

    for (const update of sorted) {
      const seq = update.seq ?? 0;

      if (seq < goal.seq - 5 || seq >= nextGoalSeq) {
        continue;
      }

      if (update.action === "goal") {
        playerId = readNumber(update.data, "PlayerId");

        if (playerId !== undefined) {
          break;
        }
      }
    }

    return { ...goal, playerId };
  });
}

export function findFirstGoal(updates: GoalSourceUpdate[]): FirstGoal | null {
  const first = extractGoals(updates)[0];

  return first
    ? { playerId: first.playerId, scoringSide: first.scoringSide }
    : null;
}

// Substitutions: TxLINE emits several records per sub (the unconfirmed one is
// empty; player IDs and clock arrive on confirmed siblings), and the records
// carry no Participant — merge per event Id and let callers resolve the team
// via lineup membership. Events that never get player IDs are dropped.
export function extractSubstitutionEvents(
  updates: Array<{
    action?: string;
    clockSeconds?: number;
    data?: Record<string, unknown>;
    eventId?: number;
    seq?: number;
  }>,
): SubstitutionEvent[] {
  const merged = new Map<string, SubstitutionEvent>();
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );

  for (const update of sorted) {
    if (update.action !== "substitution") {
      continue;
    }

    const key = String(update.eventId ?? `seq-${update.seq}`);
    const previous = merged.get(key) ?? {};

    merged.set(key, {
      clockSeconds: previous.clockSeconds ?? update.clockSeconds,
      playerInId: previous.playerInId ?? readNumber(update.data, "PlayerInId"),
      playerOutId:
        previous.playerOutId ?? readNumber(update.data, "PlayerOutId"),
    });
  }

  return [...merged.values()].filter(
    (event) =>
      event.playerInId !== undefined || event.playerOutId !== undefined,
  );
}

export function normalizeValidationSummary(raw: unknown): TxlineValidationSummary {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary = readRecord(record, "summary");
  const updateStats = readRecord(summary, "updateStats");
  const statToProve = readRecord(record, "statToProve");
  const statToProve2 = readRecord(record, "statToProve2");
  const statKeys = [
    readNumber(statToProve, "key"),
    readNumber(statToProve2, "key"),
  ].filter((key): key is number => typeof key === "number");

  return {
    eventStatRoot: record.eventStatRoot,
    fixtureId: readNumber(summary, "fixtureId"),
    mainTreeProofCount: Array.isArray(record.mainTreeProof)
      ? record.mainTreeProof.length
      : 0,
    statKeys,
    statProofCount: Array.isArray(record.statProof) ? record.statProof.length : 0,
    subTreeProofCount: Array.isArray(record.subTreeProof)
      ? record.subTreeProof.length
      : 0,
    ts: readNumber(record, "ts"),
    updateCount: readNumber(updateStats, "updateCount"),
  };
}

export function parseSsePayloads(text: string): unknown[] {
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

export function parseTxlinePayloads(text: string): unknown[] {
  const parsedSse = parseSsePayloads(text);

  if (parsedSse.length > 0) {
    return parsedSse;
  }

  try {
    const parsed = JSON.parse(text);

    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
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

export function readNumber(record: Record<string, unknown> | undefined, key: string) {
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

function formatPct(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : "n/a";
}
