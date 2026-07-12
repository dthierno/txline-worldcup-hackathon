// Shared types, formatters, and hooks used by both the home page and the
// match detail page.

import { useSyncExternalStore } from "react";

import type { MatchOutcome } from "./prediction-engine";
import type { NormalizedLineups, OddsBoard } from "./txline-normalize";
import type { WorldCupFixture } from "./world-cup-fixtures";

export type TxlineStatus = {
  apiOrigin?: string;
  configured: boolean;
  mode: "txline" | "demo" | "fallback";
  network: "mainnet" | "devnet";
};

export type TxlineScoreData = {
  action?: string;
  awayCorners: number;
  awayGoals: number;
  awayRedCards: number;
  awayYellowCards: number;
  clockRunning?: boolean;
  clockSeconds?: number;
  kickoffTeam?: number;
  statusId?: number;
  data?: Record<string, unknown>;
  eventId?: number;
  gameState?: string;
  homeCorners: number;
  homeGoals: number;
  homeRedCards: number;
  homeYellowCards: number;
  participant?: number;
  participant1IsHome: boolean;
  // Authoritative per-player stats keyed by PlayerId (goals, cards,
  // penalties), attached by TxLINE to the game_finalised record only.
  playerStats?: Record<
    string,
    {
      goals?: number;
      ownGoals?: number;
      penaltyAttempts?: number;
      penaltyGoals?: number;
      redCards?: number;
      shots?: number;
      yellowCards?: number;
    }
  >;
  possession?: number;
  seq?: number;
};

export type TxlineUpdateData = TxlineScoreData & {
  id: string;
  // false when the raw record carried an empty Stats object (live stream
  // filler events like throw-ins); such records must inherit earlier stats.
  statsKnown?: boolean;
};

export type TxlineOddsData = {
  awayWinProbability: number | null;
  drawProbability: number | null;
  homeWinProbability: number | null;
  marketNote: string;
  markets: Array<{
    marketParameters: string | null;
    priceNames: string[];
    probabilities: number[];
    type: string;
  }>;
};

export type TxlineOddsSeriesPoint = {
  away: number;
  draw: number;
  home: number;
  ts: number;
};

export type TxlineOddsUpdatesData = {
  board?: OddsBoard;
  closingBoard?: OddsBoard;
  count: number;
  latestTs: number | null;
  marketTypes: string[];
  series?: TxlineOddsSeriesPoint[];
};

export type TxlineValidationData = {
  fixtureId?: number;
  mainTreeProofCount: number;
  markets?: Array<{
    market: string;
    proofNodes: number;
    // Proven stat values (v3 multiproof mode only).
    proven?: Array<{ key: number; value: number }>;
    statKeys: number[];
  }>;
  proofMode?: string;
  statKeys: number[];
  statProofCount: number;
  subTreeProofCount: number;
  ts?: number;
  updateCount?: number;
};

export type TxlineOddsValidationData = {
  bookmaker?: string;
  mainTreeProofCount: number;
  marketType?: string;
  messageId?: string;
  prices: number[];
  priceNames: string[];
  subTreeProofCount: number;
  ts?: number;
  updateCount?: number;
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
  mode?: string;
  source?: string;
};

export type GameDetails = {
  fixtureValidation: ApiResult<unknown> | null;
  historicalUpdates: ApiResult<TxlineUpdateData[]> | null;
  lineups: ApiResult<NormalizedLineups> | null;
  odds: ApiResult<TxlineOddsData> | null;
  oddsUpdates: ApiResult<TxlineOddsUpdatesData> | null;
  oddsValidation: ApiResult<TxlineOddsValidationData> | null;
  score: ApiResult<TxlineScoreData> | null;
  updates: ApiResult<TxlineUpdateData[]> | null;
  validation: ApiResult<TxlineValidationData> | null;
};

export type StreamStatus = "idle" | "connected" | "unavailable";

export type PlayerDirectory = Map<number, { name: string; teamName: string }>;

export const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

const emptySubscribe = () => () => {};

// True only after hydration. The server snapshot is false, so prerendered HTML
// never depends on browser-only state (current time, localStorage).
export function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

// Wall-clock time as an external store: null on the server, refreshed every
// 30s in the browser so kickoff locks and live windows flip on time.
let cachedNow: number | null = null;

function subscribeToClock(onChange: () => void) {
  cachedNow = Date.now();

  const timer = setInterval(() => {
    cachedNow = Date.now();
    onChange();
  }, 30_000);

  return () => clearInterval(timer);
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => cachedNow,
    () => null,
  );
}

export async function fetchJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return { error: `Request failed: ${response.status}` };
    }

    return response.json();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Fetch failed" };
  }
}

export function mergeFixtures(
  seedFixtures: WorldCupFixture[],
  liveFixtures: WorldCupFixture[],
  { worldCupOnly = true }: { worldCupOnly?: boolean } = {},
) {
  const fixturesById = new Map<number, WorldCupFixture>();

  for (const fixture of seedFixtures) {
    fixturesById.set(fixture.fixtureId, fixture);
  }

  for (const fixture of liveFixtures) {
    const seed = fixturesById.get(fixture.fixtureId);

    // TxLINE fixture groups can end in a numeric group ID ("World Cup >
    // 10115675"); prefer the seed's human-readable stage labels when we have
    // them.
    fixturesById.set(
      fixture.fixtureId,
      seed && /^\d+$/.test(fixture.stage)
        ? { ...fixture, fixtureGroup: seed.fixtureGroup, stage: seed.stage }
        : fixture,
    );
  }

  return Array.from(fixturesById.values())
    .filter((fixture) => !worldCupOnly || isWorldCupFixture(fixture))
    .sort(
      (left, right) =>
        new Date(left.kickoffUtc).getTime() -
        new Date(right.kickoffUtc).getTime(),
    );
}

export function isWorldCupFixture(fixture: WorldCupFixture) {
  return `${fixture.fixtureGroup} ${fixture.stage}`
    .toLowerCase()
    .includes("world cup");
}

export function isPastFixture(fixture: WorldCupFixture) {
  return new Date(fixture.kickoffUtc).getTime() < Date.now();
}

export function isPotentiallyLive(fixture: WorldCupFixture, now: number) {
  const kickoff = new Date(fixture.kickoffUtc).getTime();

  return now >= kickoff && now - kickoff <= LIVE_WINDOW_MS;
}

// Competition line without raw TxLINE group IDs ("World Cup > 10115675").
export function formatCompetition(fixture: WorldCupFixture) {
  const label = fixture.fixtureGroup.replace(/\s*>\s*\d+\s*$/, "");
  const stage = /^\d+$/.test(fixture.stage) ? "" : fixture.stage;

  return stage && !label.includes(stage) ? `${label} - ${stage}` : label;
}

export function formatDate(kickoffUtc: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(kickoffUtc));
}

export function formatUtcTime(ts: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

export function formatGameState(gameState?: string) {
  const labels: Record<string, string> = {
    ended: "Finished",
    finished: "Finished",
    first_half: "First half",
    halftime: "Halftime",
    scheduled: "Not started",
    second_half: "Second half",
  };

  return labels[gameState ?? ""] ?? gameState ?? "Unknown";
}

export function getLatestUpdate(updates?: TxlineUpdateData[]) {
  if (!updates?.length) {
    return undefined;
  }

  return [...updates].sort((left, right) => {
    return (right.seq ?? 0) - (left.seq ?? 0);
  })[0];
}

export function getDisplayScore(
  score?: TxlineScoreData | null,
  updates?: TxlineUpdateData[],
) {
  return getLatestUpdate(updates) ?? score;
}

export function formatScore(score?: TxlineScoreData | null) {
  if (!score) {
    return "No score snapshot available";
  }

  return `${score.homeGoals}-${score.awayGoals}`;
}

export function formatFeedLabel(value?: string) {
  if (!value) {
    return "";
  }

  return value
    .split("_")
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMinute(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "";
  }

  return `${Math.floor(seconds / 60) + 1}'`;
}

export function formatScoreline(update: TxlineScoreData) {
  return `${update.homeGoals}-${update.awayGoals}`;
}

export function getTeamName(
  update: TxlineUpdateData,
  fixture: WorldCupFixture,
) {
  if (update.participant !== 1 && update.participant !== 2) {
    return undefined;
  }

  const participantIsHome =
    update.participant1IsHome === true
      ? update.participant === 1
      : update.participant === 2;

  return participantIsHome ? fixture.homeTeam : fixture.awayTeam;
}

export function formatPlayerId(value: unknown) {
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : undefined;
}

export function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildOutcome(
  score: TxlineScoreData | null | undefined,
  finished: boolean,
  firstGoal: MatchOutcome["firstGoal"],
): MatchOutcome | null {
  if (!score) {
    return null;
  }

  return {
    awayGoals: score.awayGoals,
    finished,
    firstGoal,
    homeGoals: score.homeGoals,
    totalCards:
      score.homeYellowCards +
      score.awayYellowCards +
      score.homeRedCards +
      score.awayRedCards,
    totalCorners: score.homeCorners + score.awayCorners,
  };
}

// Counts distinct events of one action type per side, deduped by the TxLINE
// event Id (one real event can emit unconfirmed + confirmed records).
export function countTeamEvents(updates: TxlineUpdateData[], action: string) {
  const counts = { away: 0, home: 0 };
  const seen = new Set<string>();

  for (const update of updates) {
    if (update.action !== action) {
      continue;
    }

    if (update.participant !== 1 && update.participant !== 2) {
      continue;
    }

    const key = String(update.eventId ?? `seq-${update.seq}`);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const isHome =
      update.participant1IsHome !== false
        ? update.participant === 1
        : update.participant === 2;

    counts[isHome ? "home" : "away"] += 1;
  }

  return counts;
}

// Shots on target per side. The Outcome can sit on any sibling record of the
// same shot event, so merge records per event Id before counting.
export function countShotsOnTarget(updates: TxlineUpdateData[]) {
  const events = new Map<string, { isHome: boolean; onTarget: boolean }>();

  for (const update of updates) {
    if (update.action !== "shot") {
      continue;
    }

    if (update.participant !== 1 && update.participant !== 2) {
      continue;
    }

    const key = String(update.eventId ?? `seq-${update.seq}`);
    const isHome =
      update.participant1IsHome !== false
        ? update.participant === 1
        : update.participant === 2;
    const onTarget =
      String(update.data?.Outcome ?? "") === "OnTarget" ||
      events.get(key)?.onTarget === true;

    events.set(key, { isHome, onTarget });
  }

  const counts = { away: 0, home: 0 };

  for (const event of events.values()) {
    if (event.onTarget) {
      counts[event.isHome ? "home" : "away"] += 1;
    }
  }

  return counts;
}

// Live stream filler records (throw-ins, clock adjustments) arrive with an
// empty Stats object and would otherwise read as 0-0; inherit the most recent
// known stats so the score never regresses mid-match.
export function fillUnknownStats(
  updates: TxlineUpdateData[],
): TxlineUpdateData[] {
  const sorted = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  let lastKnown: TxlineUpdateData | undefined;

  return sorted.map((update) => {
    if (update.statsKnown === false && lastKnown) {
      return {
        ...update,
        awayCorners: lastKnown.awayCorners,
        awayGoals: lastKnown.awayGoals,
        awayRedCards: lastKnown.awayRedCards,
        awayYellowCards: lastKnown.awayYellowCards,
        homeCorners: lastKnown.homeCorners,
        homeGoals: lastKnown.homeGoals,
        homeRedCards: lastKnown.homeRedCards,
        homeYellowCards: lastKnown.homeYellowCards,
      };
    }

    if (update.statsKnown !== false) {
      lastKnown = update;
    }

    return update;
  });
}

export function getDisplayUpdates(
  updates: TxlineUpdateData[] | undefined,
  fixture: WorldCupFixture,
  players?: PlayerDirectory,
) {
  if (!updates?.length) {
    return [];
  }

  const displayUpdates: Array<{ id: string; text: string }> = [];
  const sortedUpdates = [...updates].sort(
    (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
  );
  let previous: TxlineUpdateData | undefined;
  const seen = new Set<string>();

  // The PlayerId may sit on a sibling record of the same event, so index it by
  // event Id first, then resolve names through the lineups directory.
  const eventPlayerIds = new Map<string, number>();
  // Injury outcomes also land on a later sibling of the same event.
  const injuryOutcomes = new Map<number, string>();

  for (const update of updates) {
    if (
      update.action === "injury" &&
      update.eventId !== undefined &&
      typeof update.data?.Outcome === "string"
    ) {
      injuryOutcomes.set(update.eventId, update.data.Outcome);
    }
  }

  for (const update of sortedUpdates) {
    if (
      (update.action === "goal" ||
        update.action === "yellow_card" ||
        update.action === "injury") &&
      update.eventId !== undefined &&
      typeof update.data?.PlayerId === "number"
    ) {
      const key = `${update.action}-${update.eventId}`;

      if (!eventPlayerIds.has(key)) {
        eventPlayerIds.set(key, update.data.PlayerId);
      }
    }
  }

  const resolvePlayerName = (update: TxlineUpdateData) => {
    const playerId =
      (update.eventId !== undefined
        ? eventPlayerIds.get(`${update.action}-${update.eventId}`)
        : undefined) ??
      (typeof update.data?.PlayerId === "number"
        ? update.data.PlayerId
        : undefined);

    return playerId !== undefined ? players?.get(playerId)?.name : undefined;
  };

  const readableActions = new Set([
    "additional_time",
    "corner",
    "game_finalised",
    "goal",
    "halftime_finalised",
    "injury",
    "jersey",
    "kickoff",
    "kickoff_team",
    "penalty",
    "penalty_outcome",
    "pitch",
    "possible",
    "red_card",
    "shot",
    "substitution",
    "var",
    "var_end",
    "venue",
    "weather",
    "yellow_card",
  ]);
  // Scene-setting records arrive pre-match with a zeroed clock; a minute
  // prefix would be misleading noise.
  const noMinuteActions = new Set([
    "jersey",
    "kickoff_team",
    "pitch",
    "venue",
    "weather",
  ]);

  for (const update of sortedUpdates) {
    const action = update.action ?? "";

    if (!readableActions.has(action)) {
      previous = update;
      continue;
    }

    const minute = noMinuteActions.has(action)
      ? ""
      : formatMinute(update.clockSeconds);
    const prefix = minute ? `${minute} ` : "";
    const teamName = getTeamName(update, fixture);
    const scoreline = formatScoreline(update);
    let text = "";

    if (
      action === "goal" &&
      previous &&
      (update.homeGoals > previous.homeGoals ||
        update.awayGoals > previous.awayGoals)
    ) {
      const scoringTeam =
        update.homeGoals > previous.homeGoals
          ? fixture.homeTeam
          : fixture.awayTeam;
      const goalType = formatFeedLabel(String(update.data?.GoalType ?? ""));
      const scorer = resolvePlayerName(update);

      text = `${prefix}Goal for ${scoringTeam}${
        goalType ? ` (${goalType})` : ""
      }${scorer ? ` - ${scorer}` : ""}. Score ${scoreline}.`;
    }

    if (
      action === "yellow_card" &&
      previous &&
      (update.homeYellowCards > previous.homeYellowCards ||
        update.awayYellowCards > previous.awayYellowCards)
    ) {
      const cardTeam =
        update.homeYellowCards > previous.homeYellowCards
          ? fixture.homeTeam
          : fixture.awayTeam;
      const bookedPlayer = resolvePlayerName(update);

      text = `${prefix}Yellow card for ${cardTeam}${
        bookedPlayer ? ` (${bookedPlayer})` : ""
      }. Cards ${update.homeYellowCards}-${update.awayYellowCards}.`;
    }

    if (
      action === "red_card" &&
      previous &&
      (update.homeRedCards > previous.homeRedCards ||
        update.awayRedCards > previous.awayRedCards)
    ) {
      const cardTeam =
        update.homeRedCards > previous.homeRedCards
          ? fixture.homeTeam
          : fixture.awayTeam;

      text = `${prefix}Red card for ${cardTeam}. Red cards ${update.homeRedCards}-${update.awayRedCards}.`;
    }

    if (action === "kickoff") {
      text = `${prefix}Kickoff.`;
    }

    // Only records with an explicit VAR flag are real reviews. TxLINE also
    // emits scout-side "possible goal/penalty" uncertainty flags (raised and
    // cleared seconds later, ~26 pairs per match) — those are data
    // bookkeeping, not broadcast VAR checks, and must not be shown.
    if (action === "possible" && update.data?.VAR === true) {
      const underReview = ["Goal", "Penalty", "RedCard", "YellowCard"]
        .filter((key) => update.data?.[key] === true)
        .map((key) => formatFeedLabel(key).toLowerCase());

      text = `${prefix}VAR check in progress${
        underReview.length ? `: possible ${underReview.join(", ")}` : ""
      }${teamName ? ` (${teamName})` : ""}.`;
    }

    if (action === "additional_time") {
      const minutes = update.data?.Minutes;

      if (typeof minutes === "number" && minutes > 0) {
        text = `${prefix}${minutes} minute(s) of additional time.`;
      }
    }

    if (
      action === "corner" &&
      previous &&
      (update.homeCorners > previous.homeCorners ||
        update.awayCorners > previous.awayCorners)
    ) {
      const cornerTeam =
        update.homeCorners > previous.homeCorners
          ? fixture.homeTeam
          : fixture.awayTeam;

      text = `${prefix}Corner for ${cornerTeam}. Corners ${update.homeCorners}-${update.awayCorners}.`;
    }

    if (action === "penalty" && teamName) {
      text = `${prefix}Penalty for ${teamName}!`;
    }

    if (action === "penalty_outcome") {
      const outcome = String(update.data?.Outcome ?? "");

      if (outcome) {
        text = `${prefix}Penalty ${outcome.toLowerCase()}${
          teamName ? ` (${teamName})` : ""
        }. Score ${scoreline}.`;
      }
    }

    if (action === "var" && update.data?.Type) {
      text = `${prefix}VAR review: possible ${formatFeedLabel(
        String(update.data.Type),
      ).toLowerCase()}.`;
    }

    if (action === "var_end" && update.data?.Outcome) {
      text = `${prefix}VAR decision: ${formatFeedLabel(
        String(update.data.Outcome),
      ).toLowerCase()}.`;
    }

    if (action === "injury") {
      const injuredPlayer = resolvePlayerName(update);
      const outcome = String(
        (update.eventId !== undefined
          ? injuryOutcomes.get(update.eventId)
          : undefined) ??
          update.data?.Outcome ??
          "",
      );
      const status =
        outcome === "NotReturning"
          ? " - cannot continue"
          : outcome === "OnPitch"
            ? " - continues after treatment"
            : "";
      // One line per injury event: siblings share the event Id and would
      // otherwise emit a bare line plus an outcome line.
      const injuryKey = `injury-${update.eventId ?? update.seq}`;

      if (!seen.has(injuryKey)) {
        seen.add(injuryKey);
        text = `${prefix}Injury${
          injuredPlayer
            ? `: ${injuredPlayer}`
            : teamName
              ? ` stoppage for ${teamName}`
              : " stoppage"
        }${status}.`;
      }
    }

    if (action === "halftime_finalised") {
      text = `Halftime: ${scoreline}.`;
    }

    if (action === "game_finalised") {
      text = `Full time: ${scoreline}.`;
    }

    if (action === "weather" || action === "pitch") {
      const conditions = Array.isArray(update.data?.Conditions)
        ? update.data.Conditions.map(String).join(", ")
        : "";

      if (conditions) {
        text =
          action === "weather"
            ? `Conditions: ${conditions}.`
            : `Pitch: ${conditions}.`;
      }
    }

    if (action === "venue" && update.data?.Type) {
      const type = String(update.data.Type);

      text =
        type === "neutral"
          ? "Played at a neutral venue."
          : `Venue: ${formatFeedLabel(type)}.`;
    }

    if (action === "jersey" && teamName && update.data?.Color) {
      text = `${teamName} in ${String(update.data.Color)}.`;
    }

    if (action === "kickoff_team" && teamName) {
      text = `${teamName} to kick off.`;
    }

    if (action === "shot" && teamName && update.data?.Outcome) {
      text = `${prefix}Shot ${formatFeedLabel(
        String(update.data.Outcome),
      ).toLowerCase()} by ${teamName}.`;
    }

    if (action === "substitution") {
      const playerInId = formatPlayerId(update.data?.PlayerInId);
      const playerOutId = formatPlayerId(update.data?.PlayerOutId);
      const playerIn = playerInId
        ? players?.get(Number(playerInId))
        : undefined;
      const playerOut = playerOutId
        ? players?.get(Number(playerOutId))
        : undefined;
      // Substitution records carry no Participant; resolve the team from the
      // lineups directory when possible.
      const subTeam = teamName ?? playerIn?.teamName ?? playerOut?.teamName;

      if ((playerInId || playerOutId) && subTeam) {
        const inLabel = playerIn?.name ?? `player ${playerInId}`;
        const outLabel = playerOut?.name ?? `player ${playerOutId}`;

        text = `${prefix}Substitution for ${subTeam}${
          playerInId ? `: ${inLabel} on` : ""
        }${playerInId && playerOutId ? ", " : ""}${
          playerOutId ? `${outLabel} off` : ""
        }.`;
      }
    }

    if (text) {
      const key = `${action}-${text}`;

      if (!seen.has(key)) {
        seen.add(key);
        displayUpdates.push({ id: update.id, text });
      }
    }

    previous = update;
  }

  return displayUpdates;
}

export function isOddsUpdatesData(
  data: TxlineOddsUpdatesData | undefined,
): data is TxlineOddsUpdatesData {
  return (
    Boolean(data) &&
    typeof data?.count === "number" &&
    Array.isArray(data.marketTypes)
  );
}

export function isValidationData(
  data: TxlineValidationData | undefined,
): data is TxlineValidationData {
  return Boolean(data) && Array.isArray(data?.statKeys);
}
