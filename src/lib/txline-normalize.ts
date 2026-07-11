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
  clockRunning?: boolean;
  clockSeconds?: number;
  // Scout match phase: 1 pre-match, 2 first half, 3 half-time, 4 second half,
  // 5 full time (awaiting finalisation), 100 finalised.
  statusId?: number;
  // Which participant (1|2) kicks off, from the Kickoff.Team field.
  kickoffTeam?: number;
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
  // Per-half splits decoded from TxLINE's period stat banks (1000s = first
  // half, 3000s = second half); present when any bank key is set.
  halfStats?: {
    first: TxlineHalfLine;
    second: TxlineHalfLine;
  };
  raw: unknown;
  seq?: number;
  ts?: number;
};

export type TxlineHalfLine = {
  awayCorners: number;
  awayGoals: number;
  awayYellowCards: number;
  homeCorners: number;
  homeGoals: number;
  homeYellowCards: number;
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

export type LineupPosition = "GK" | "DEF" | "MID" | "FWD";

export type NormalizedLineupPlayer = {
  name: string;
  number?: string;
  playerId?: number;
  position?: LineupPosition;
  starter: boolean;
};

// TxLINE lineup positionId bands observed on World Cup fixtures.
const POSITION_BY_ID: Record<number, LineupPosition> = {
  34: "GK",
  35: "DEF",
  36: "MID",
  37: "FWD",
};

const POSITION_ORDER: Record<LineupPosition, number> = {
  DEF: 1,
  FWD: 3,
  GK: 0,
  MID: 2,
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

// A scout-raised "possible goal" moment: the basis for live goal calls.
// Resolved either by an actual score advance (stood) or by the clearing
// `possible { Goal: false }` record (didn't stand). Unresolved = still open
// (live betting window).
export type GoalCallEvent = {
  clockSeconds?: number;
  key: string;
  participant?: number;
  resolved: boolean;
  seq: number;
  stood: boolean;
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

  const halfLine = (bank: number): TxlineHalfLine => ({
    awayCorners: statMap.get(bank + awayBase + 6) ?? 0,
    awayGoals: statMap.get(bank + awayBase) ?? 0,
    awayYellowCards: statMap.get(bank + awayBase + 2) ?? 0,
    homeCorners: statMap.get(bank + homeBase + 6) ?? 0,
    homeGoals: statMap.get(bank + homeBase) ?? 0,
    homeYellowCards: statMap.get(bank + homeBase + 2) ?? 0,
  });
  const hasBanks = [...statMap.keys()].some((key) => key >= 1000);

  return {
    action: readString(latestEntry, "Action"),
    awayCorners: statMap.get(awayBase + 6) ?? 0,
    clockRunning: readBoolean(clock, "Running"),
    eventId: readNumber(latestEntry, "Id"),
    kickoffTeam: readNumber(readRecord(latestEntry, "Kickoff"), "Team"),
    statusId:
      readNumber(latestEntry, "StatusId") ?? readNumber(data, "StatusId"),
    ...(hasBanks
      ? { halfStats: { first: halfLine(1000), second: halfLine(3000) } }
      : {}),
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
  // Prefer the full-match result market: TxLINE also quotes 1X2 per half
  // (MarketPeriod "half=1"), which must not be read as match-winner odds.
  const resultMarket =
    markets.find(
      (market) =>
        market.type === "1X2_PARTICIPANT_RESULT" && !market.marketPeriod,
    ) ?? markets.find((market) => market.type === "1X2_PARTICIPANT_RESULT");

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

          const positionId = readNumber(entry, "positionId");

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
            position:
              positionId !== undefined
                ? POSITION_BY_ID[positionId]
                : undefined,
            starter: entry.starter === true,
          };
        })
        .sort(
          (left, right) =>
            Number(right.starter) - Number(left.starter) ||
            (left.position ? POSITION_ORDER[left.position] : 4) -
              (right.position ? POSITION_ORDER[right.position] : 4) ||
            left.name.localeCompare(right.name),
        );

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

    // A side's goal count dropping means the advance was disallowed (VAR /
    // scout discard - observed live: Norway's 57' goal in NOR-ENG went 2-1
    // then back to 1-1). Remove the phantom goal event.
    if (update.homeGoals < previousHome) {
      const index = goals.map((goal) => goal.scoringSide).lastIndexOf("home");

      if (index !== -1) {
        goals.splice(index, 1);
      }
    }

    if (update.awayGoals < previousAway) {
      const index = goals.map((goal) => goal.scoringSide).lastIndexOf("away");

      if (index !== -1) {
        goals.splice(index, 1);
      }
    }

    previousHome = update.homeGoals;
    previousAway = update.awayGoals;
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

export function extractGoalCalls(
  updates: Array<{
    action?: string;
    awayGoals: number;
    clockSeconds?: number;
    data?: Record<string, unknown>;
    eventId?: number;
    homeGoals: number;
    participant?: number;
    seq?: number;
  }>,
): GoalCallEvent[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const calls: GoalCallEvent[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const update = sorted[index];

    if (update.action !== "possible" || update.data?.Goal !== true) {
      continue;
    }

    const key = String(update.eventId ?? `seq-${update.seq}`);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const totalAtRaise = update.homeGoals + update.awayGoals;
    let resolved = false;
    let stood = false;

    for (const later of sorted.slice(index + 1)) {
      if (later.homeGoals + later.awayGoals > totalAtRaise) {
        resolved = true;
        stood = true;
        break;
      }

      if (later.action === "possible" && later.data?.Goal === false) {
        resolved = true;
        break;
      }
    }

    calls.push({
      clockSeconds: update.clockSeconds,
      key,
      participant: update.participant,
      resolved,
      seq: update.seq ?? 0,
      stood,
    });
  }

  return calls;
}

export type CornerCall = {
  clockSeconds?: number;
  key: string;
  resolved: boolean;
  seq: number;
  voided: boolean;
  winner?: number;
};

// "Who wins the next corner?" — a call opens at kickoff and after every
// corner; each is resolved by the following corner event (winner = its
// participant) or voided when the match ends without another corner.
export function extractCornerCalls(
  updates: Array<{
    action?: string;
    clockSeconds?: number;
    eventId?: number;
    participant?: number;
    seq?: number;
  }>,
): CornerCall[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const started = sorted.some(
    (update) => update.action === "kickoff" || (update.clockSeconds ?? 0) > 0,
  );

  if (!started) {
    return [];
  }

  const finished = sorted.some((update) => update.action === "game_finalised");
  const seenCorners = new Set<string>();
  const corners: Array<{ clockSeconds?: number; participant?: number; seq: number }> = [];

  for (const update of sorted) {
    if (update.action !== "corner") {
      continue;
    }

    const cornerKey = String(update.eventId ?? `seq-${update.seq}`);

    if (seenCorners.has(cornerKey)) {
      continue;
    }

    seenCorners.add(cornerKey);
    corners.push({
      clockSeconds: update.clockSeconds,
      participant: update.participant,
      seq: update.seq ?? 0,
    });
  }

  const calls: CornerCall[] = corners.map((corner, index) => ({
    clockSeconds: index === 0 ? 0 : corners[index - 1].clockSeconds,
    key: `corner-${index + 1}`,
    resolved: true,
    seq: corner.seq,
    voided: false,
    winner: corner.participant,
  }));

  if (!finished) {
    calls.push({
      clockSeconds: corners[corners.length - 1]?.clockSeconds ?? 0,
      key: `corner-${corners.length + 1}`,
      resolved: false,
      seq: (corners[corners.length - 1]?.seq ?? 0) + 1,
      voided: false,
    });
  }

  return calls;
}

export type AddedTimeCall = {
  half: 1 | 2;
  key: string;
  minutes?: number;
  resolved: boolean;
  seq: number;
  voided: boolean;
};

// Over/under 3.5 minutes of added time, opened near the end of each half and
// settled exactly by the additional_time record.
export function extractAddedTimeCalls(
  updates: Array<{
    action?: string;
    clockSeconds?: number;
    data?: Record<string, unknown>;
    eventId?: number;
    seq?: number;
  }>,
): AddedTimeCall[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const finished = sorted.some((update) => update.action === "game_finalised");
  const maxClock = sorted.reduce(
    (max, update) => Math.max(max, update.clockSeconds ?? 0),
    0,
  );
  const seen = new Set<string>();
  const events: Array<{ minutes: number; seq: number }> = [];

  for (const update of sorted) {
    if (update.action !== "additional_time") {
      continue;
    }

    const key = String(update.eventId ?? `seq-${update.seq}`);
    const minutes = update.data?.Minutes;

    if (seen.has(key) || typeof minutes !== "number") {
      continue;
    }

    seen.add(key);
    events.push({ minutes, seq: update.seq ?? 0 });
  }

  const calls: AddedTimeCall[] = [];
  const thresholds: Array<[1 | 2, number]> = [
    [1, 40 * 60],
    [2, 85 * 60],
  ];

  for (const [half, threshold] of thresholds) {
    const event = events[half - 1];

    if (!event && maxClock < threshold) {
      continue;
    }

    calls.push({
      half,
      key: `addtime-${half}`,
      minutes: event?.minutes,
      resolved: Boolean(event),
      seq: event?.seq ?? 900000 + half,
      voided: !event && finished,
    });
  }

  return calls;
}

type CorrectableUpdate = {
  action?: string;
  clockSeconds?: number;
  data?: Record<string, unknown>;
  eventId?: number;
};

// Scout corrections. `action_discarded` shares its event Id with the event it
// cancels (observed live: a disallowed goal, a corner, a throw-in) — drop all
// of that event's records. `action_amend` carries the corrected action name
// plus Previous/New field sets and links to its target by action + clock
// second (its Id does NOT match the amended event); patch the matching
// sibling's Data so e.g. a shot re-graded OnTarget → OffTarget counts right.
export function applyScoutCorrections<T extends CorrectableUpdate>(
  updates: T[],
): T[] {
  const discarded = new Set<number>();
  const amends: Array<{
    action: string;
    clockSeconds?: number;
    next: Record<string, unknown>;
    previous: Record<string, unknown>;
  }> = [];

  for (const update of updates) {
    if (
      update.action === "action_discarded" &&
      typeof update.eventId === "number"
    ) {
      discarded.add(update.eventId);
    }

    if (update.action === "action_amend") {
      const action = update.data?.Action;
      const previous = readRecord(update.data, "Previous");
      const next = readRecord(update.data, "New");

      if (typeof action === "string" && previous && next) {
        const withoutClock = (record: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(record).filter(([key]) => key !== "Clock"),
          );

        amends.push({
          action,
          clockSeconds: readNumber(readRecord(previous, "Clock"), "Seconds"),
          next: withoutClock(next),
          previous: withoutClock(previous),
        });
      }
    }
  }

  if (!discarded.size && !amends.length) {
    return updates;
  }

  return updates
    .filter(
      (update) =>
        !(
          typeof update.eventId === "number" && discarded.has(update.eventId)
        ),
    )
    .map((update) => {
      let data = update.data;

      for (const amend of amends) {
        if (
          update.action !== amend.action ||
          update.clockSeconds !== amend.clockSeconds ||
          !Object.entries(amend.previous).every(
            ([key, value]) => data?.[key] === value,
          )
        ) {
          continue;
        }

        data = { ...data, ...amend.next };
      }

      return data === update.data ? update : { ...update, data };
    });
}

export type MatchClockState = {
  running: boolean;
  seconds: number;
  statusId?: number;
  // Wall-clock ms of the record that reported this clock; when running, the
  // current match second is seconds + (now - ts) / 1000.
  ts?: number;
};

// Latest scout clock + match phase. Nearly every feed record carries a Clock;
// status records advance the phase (see statusId doc on NormalizedTxlineScore).
export function deriveMatchClock(
  updates: Array<{
    clockRunning?: boolean;
    clockSeconds?: number;
    seq?: number;
    statusId?: number;
    ts?: number;
  }>,
): MatchClockState | null {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  let clock: MatchClockState | null = null;
  let statusId: number | undefined;

  for (const update of sorted) {
    if (typeof update.clockSeconds === "number") {
      clock = {
        running: update.clockRunning === true,
        seconds: update.clockSeconds,
        ts: update.ts,
      };
    }

    if (typeof update.statusId === "number") {
      statusId = update.statusId;
    }
  }

  return clock ? { ...clock, statusId } : null;
}

export function formatMatchPhase(statusId?: number): string | undefined {
  const phases: Record<number, string> = {
    1: "Pre-match",
    2: "First half",
    3: "Half-time",
    4: "Second half",
    5: "Full time",
    100: "Full time",
  };

  return statusId !== undefined ? phases[statusId] : undefined;
}

// "37'" during regulation, "45+2'" / "90+4'" in added time of either half.
export function formatLiveMinute(seconds: number, statusId?: number): string {
  const minute = Math.max(1, Math.floor(seconds / 60) + 1);
  const cap = statusId === 2 ? 45 : statusId === 4 ? 90 : undefined;

  return cap !== undefined && minute > cap
    ? `${cap}+${minute - cap}'`
    : `${minute}'`;
}

export type MatchInfo = {
  awayJersey?: string;
  homeJersey?: string;
  kickoffSide?: "away" | "home";
  pitch?: string;
  venueType?: string;
  weather?: string;
};

// Scene-setting scout records (all pre-match unless re-reported): weather and
// pitch conditions, venue type, jersey colors, and who kicks off.
export function extractMatchInfo(
  updates: Array<{
    action?: string;
    data?: Record<string, unknown>;
    participant?: number;
    participant1IsHome: boolean;
    seq?: number;
  }>,
): MatchInfo | null {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const info: MatchInfo = {};

  const sideOf = (update: {
    participant?: number;
    participant1IsHome: boolean;
  }): "away" | "home" | undefined => {
    if (update.participant !== 1 && update.participant !== 2) {
      return undefined;
    }

    return (
      update.participant1IsHome !== false
        ? update.participant === 1
        : update.participant === 2
    )
      ? "home"
      : "away";
  };
  const conditions = (data?: Record<string, unknown>) =>
    Array.isArray(data?.Conditions)
      ? data.Conditions.map(String).join(", ")
      : undefined;

  for (const update of sorted) {
    if (update.action === "weather") {
      info.weather = conditions(update.data) ?? info.weather;
    } else if (update.action === "pitch") {
      info.pitch = conditions(update.data) ?? info.pitch;
    } else if (update.action === "venue") {
      const type = update.data?.Type;

      info.venueType = typeof type === "string" ? type : info.venueType;
    } else if (update.action === "jersey") {
      const color = update.data?.Color;
      const side = sideOf(update);

      if (typeof color === "string" && side === "home") {
        info.homeJersey = color;
      } else if (typeof color === "string" && side === "away") {
        info.awayJersey = color;
      }
    } else if (update.action === "kickoff_team") {
      info.kickoffSide = sideOf(update) ?? info.kickoffSide;
    }
  }

  return Object.values(info).some((value) => value !== undefined)
    ? info
    : null;
}

export type MomentumBucket = {
  awayPressure: number;
  homePressure: number;
  startMinute: number;
};

// Attack-pressure weights for TxLINE's possession-phase and chance actions.
const MOMENTUM_WEIGHTS: Record<string, number> = {
  attack_possession: 1,
  corner: 2,
  danger_possession: 2,
  high_danger_possession: 3,
  shot: 3,
};

// Rolling attack momentum per side: weighted pressure events bucketed by
// match-clock interval. Only possession phases and chances score; safe/basic
// possession is neutral.
export function extractMomentum(
  updates: Array<{
    action?: string;
    clockSeconds?: number;
    eventId?: number;
    participant?: number;
    possession?: number;
    seq?: number;
  }>,
  bucketMinutes = 5,
): MomentumBucket[] {
  const buckets = new Map<number, { away: number; home: number }>();
  const seenEvents = new Set<string>();
  let participant1IsHome = true;

  for (const update of updates as Array<
    (typeof updates)[number] & { participant1IsHome?: boolean }
  >) {
    if (typeof update.participant1IsHome === "boolean") {
      participant1IsHome = update.participant1IsHome;
    }

    const weight = MOMENTUM_WEIGHTS[update.action ?? ""];
    const team = update.participant ?? update.possession;
    const clock = update.clockSeconds;

    if (
      !weight ||
      (team !== 1 && team !== 2) ||
      typeof clock !== "number" ||
      !Number.isFinite(clock)
    ) {
      continue;
    }

    // Chances emit sibling records per event Id; count each event once.
    if (update.action === "shot" || update.action === "corner") {
      const key = `${update.action}-${update.eventId ?? `seq-${update.seq}`}`;

      if (seenEvents.has(key)) {
        continue;
      }

      seenEvents.add(key);
    }

    const bucketStart =
      Math.floor(clock / (bucketMinutes * 60)) * bucketMinutes;
    const bucket = buckets.get(bucketStart) ?? { away: 0, home: 0 };
    const isHome = participant1IsHome ? team === 1 : team === 2;

    bucket[isHome ? "home" : "away"] += weight;
    buckets.set(bucketStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startMinute, bucket]) => ({
      awayPressure: bucket.away,
      homePressure: bucket.home,
      startMinute,
    }));
}

export type PenaltyEvent = {
  clockSeconds?: number;
  key: string;
  outcome?: "missed" | "scored";
  participant?: number;
  resolved: boolean;
  seq: number;
  varOutcome?: string;
  voided: boolean;
};

// Penalty situations: a `penalty` record raises one (with VAR checks arriving
// as `var`/`var_end`), settled by `penalty_outcome` (Outcome Missed/Scored) or
// by the score advancing while the penalty is pending.
export function extractPenaltyEvents(
  updates: Array<{
    action?: string;
    awayGoals: number;
    clockSeconds?: number;
    data?: Record<string, unknown>;
    eventId?: number;
    homeGoals: number;
    participant?: number;
    seq?: number;
  }>,
): PenaltyEvent[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  const finished = sorted.some((update) => update.action === "game_finalised");
  const events: PenaltyEvent[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const update = sorted[index];

    if (update.action !== "penalty") {
      continue;
    }

    const key = `penalty-${update.eventId ?? `seq-${update.seq}`}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const goalsAtRaise = update.homeGoals + update.awayGoals;
    let outcome: PenaltyEvent["outcome"];
    let varOutcome: string | undefined;

    for (const later of sorted.slice(index + 1)) {
      if (later.action === "penalty" && later.eventId !== update.eventId) {
        break;
      }

      if (later.action === "var_end" && typeof later.data?.Outcome === "string") {
        varOutcome = later.data.Outcome;
      }

      if (
        later.action === "penalty_outcome" &&
        typeof later.data?.Outcome === "string"
      ) {
        outcome = later.data.Outcome === "Missed" ? "missed" : "scored";
        break;
      }

      if (later.homeGoals + later.awayGoals > goalsAtRaise) {
        outcome = "scored";
        break;
      }
    }

    events.push({
      clockSeconds: update.clockSeconds,
      key,
      outcome,
      participant: update.participant,
      resolved: outcome !== undefined,
      seq: update.seq ?? 0,
      varOutcome,
      voided: outcome === undefined && finished,
    });
  }

  return events;
}

export type OddsBoardLine = {
  line: number;
  // Decimal odds (TxLINE prices are decimal odds × 1000).
  prices: number[];
  ts: number;
};

export type OddsBoard = {
  // [home, away] per handicap line (from part1/part2 price names).
  asianHandicap: OddsBoardLine[];
  // [over, under] per goals line.
  overUnder: OddsBoardLine[];
  // Full-match 1X2 as decimal odds.
  result: { away: number; draw: number; home: number; ts: number } | null;
};

// Current full-match odds board across the three TxLINE market families,
// keeping the latest priced record per market + line. Records with an empty
// Prices array are suspended markets and are skipped.
export function buildOddsBoard(raw: unknown): OddsBoard {
  const entries = (Array.isArray(raw) ? raw : []).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
  );
  const latestByLine = new Map<
    string,
    { line: number; prices: number[]; ts: number; type: string }
  >();
  let result: OddsBoard["result"] = null;

  for (const entry of entries) {
    const type = entry.SuperOddsType;
    const ts = readNumber(entry, "Ts") ?? 0;
    const prices = Array.isArray(entry.Prices)
      ? entry.Prices.map(Number).filter((price) => Number.isFinite(price))
      : [];

    if (typeof type !== "string" || entry.MarketPeriod || !prices.length) {
      continue;
    }

    if (type === "1X2_PARTICIPANT_RESULT" && prices.length >= 3) {
      if (!result || ts >= result.ts) {
        result = {
          away: prices[2] / 1000,
          draw: prices[1] / 1000,
          home: prices[0] / 1000,
          ts,
        };
      }

      continue;
    }

    const lineMatch = /(?:^|,)line=(-?[\d.]+)/.exec(
      String(entry.MarketParameters ?? ""),
    );

    if (
      (type !== "OVERUNDER_PARTICIPANT_GOALS" &&
        type !== "ASIANHANDICAP_PARTICIPANT_GOALS") ||
      !lineMatch ||
      prices.length < 2
    ) {
      continue;
    }

    const line = Number(lineMatch[1]);
    const key = `${type}:${line}`;
    const existing = latestByLine.get(key);

    if (!existing || ts >= existing.ts) {
      latestByLine.set(key, {
        line,
        prices: prices.map((price) => price / 1000),
        ts,
        type,
      });
    }
  }

  const linesOf = (type: string) =>
    [...latestByLine.values()]
      .filter((entry) => entry.type === type)
      .sort((left, right) => left.line - right.line)
      .map(({ line, prices, ts }) => ({ line, prices, ts }));

  return {
    asianHandicap: linesOf("ASIANHANDICAP_PARTICIPANT_GOALS"),
    overUnder: linesOf("OVERUNDER_PARTICIPANT_GOALS"),
    result,
  };
}

export type TxlineProvenStat = {
  key: number;
  value: number;
};

export type TxlineValidationV3Summary = {
  fixtureId?: number;
  mainTreeProofCount: number;
  multiproofHashCount: number;
  // The stat values the multiproof commits to - display these as the
  // cryptographically proven numbers.
  provenStats: TxlineProvenStat[];
  subTreeProofCount: number;
  ts?: number;
  updateCount?: number;
};

// stat-validation-v3: one compressed Merkle multiproof covering up to 5 stat
// keys, with the proven values included (statsToProve[].stat.{key,value}).
export function normalizeValidationSummaryV3(
  raw: unknown,
): TxlineValidationV3Summary {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary = readRecord(record, "summary");
  const updateStats = readRecord(summary, "updateStats");
  const multiproof = readRecord(record, "multiproof");
  const provenStats = (Array.isArray(record.statsToProve)
    ? record.statsToProve
    : []
  )
    .map((entry) => {
      const stat = readRecord(
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : undefined,
        "stat",
      );
      const key = readNumber(stat, "key");
      const value = readNumber(stat, "value");

      return typeof key === "number" && typeof value === "number"
        ? { key, value }
        : null;
    })
    .filter((stat): stat is TxlineProvenStat => stat !== null);

  return {
    fixtureId: readNumber(summary, "fixtureId"),
    mainTreeProofCount: Array.isArray(record.mainTreeProof)
      ? record.mainTreeProof.length
      : 0,
    multiproofHashCount: Array.isArray(multiproof?.hashes)
      ? multiproof.hashes.length
      : 0,
    provenStats,
    subTreeProofCount: Array.isArray(record.subTreeProof)
      ? record.subTreeProof.length
      : 0,
    ts: readNumber(record, "ts"),
    updateCount: readNumber(updateStats, "updateCount"),
  };
}

export type TxlineOddsValidationSummary = {
  bookmaker?: string;
  mainTreeProofCount: number;
  marketType?: string;
  messageId?: string;
  // Decimal odds of the proven record.
  prices: number[];
  priceNames: string[];
  subTreeProofCount: number;
  ts?: number;
  updateCount?: number;
};

// odds/validation: Merkle proof that a single odds record (by MessageId + Ts)
// was published by the TxODDS oracle.
export function normalizeOddsValidation(
  raw: unknown,
): TxlineOddsValidationSummary {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const odds = readRecord(record, "odds");
  const summary = readRecord(record, "summary");
  const updateStats = readRecord(summary, "updateStats");

  return {
    bookmaker: readString(odds, "Bookmaker"),
    mainTreeProofCount: Array.isArray(record.mainTreeProof)
      ? record.mainTreeProof.length
      : 0,
    marketType: readString(odds, "SuperOddsType"),
    messageId: readString(odds, "MessageId"),
    prices: (Array.isArray(odds?.Prices) ? odds.Prices : [])
      .map(Number)
      .filter(Number.isFinite)
      .map((price) => price / 1000),
    priceNames: Array.isArray(odds?.PriceNames)
      ? odds.PriceNames.map(String)
      : [],
    subTreeProofCount: Array.isArray(record.subTreeProof)
      ? record.subTreeProof.length
      : 0,
    ts: readNumber(odds, "Ts"),
    updateCount: readNumber(updateStats, "updateCount"),
  };
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
