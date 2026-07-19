// localStorage persistence for prototype predictions. No database by design:
// predictions and settled results live on the fan's device only.

import type { MatchPrediction } from "./prediction-engine";
import type { WorldCupFixture } from "./world-cup-fixtures";

const PREDICTIONS_KEY = "fan-forecast.predictions.v1";
const SETTLEMENTS_KEY = "fan-forecast.settlements.v1";
const GOAL_CALLS_KEY = "fan-forecast.goalcalls.v1";
const FIXTURES_KEY = "fan-forecast.fixtures.v1";
const RESULTS_KEY = "fan-forecast.results.v1";
const LEAGUES_KEY = "fan-forecast.leagues.v1";
const LEAGUE_BOARD_KEY = "fan-forecast.league-board.v1";
const SAVED_MATCHES_KEY = "fan-forecast.saved-matches.v1";

// Fired on window whenever the stored leagues (or the selected board)
// change, so the homepage leaderboard can refresh without a reload.
export const LEAGUES_CHANGED_EVENT = "pg:leagues-changed";

// Fired whenever a live-call answer is saved, so a leaderboard watching the
// match can re-grade and tick points up without waiting for a reload.
export const GOAL_CALLS_CHANGED_EVENT = "pg:goalcalls-changed";

// Fired (with the fixtureId as detail) when a prediction or settlement is
// written, so the Convex sync layer can mirror just that item to the server.
export const PREDICTIONS_CHANGED_EVENT = "pg:predictions-changed";
export const SETTLEMENTS_CHANGED_EVENT = "pg:settlements-changed";

// Fired once after the server's gameplay has been merged into this device on
// sign-in, so views holding gameplay in React state re-read the fresh data
// without a reload. Carries no push side-effect (unlike the *_CHANGED events).
export const GAMESTATE_HYDRATED_EVENT = "pg:gamestate-hydrated";

function announceChange(event: string, fixtureId: number): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(event, { detail: fixtureId }));
  }
}

export const GOAL_CALL_POINTS = 2;

export type GoalCallAnswer = {
  // Option index as a string ("0" | "1"); legacy values "goal"/"no_goal"
  // are still understood by the reader.
  answer: string;
  answeredAt: string;
};

// Grade a fan's stored live-call answers against the resolved calls. Used by
// BOTH the live match page and settlement (match page + home auto-settle),
// so points earned during the match survive into the stored total.
export function settleGoalCallPoints(
  calls: Array<{
    correctIndex?: 0 | 1;
    key: string;
    resolved: boolean;
    voided?: boolean;
  }>,
  answers: Record<string, GoalCallAnswer>,
): number {
  const answerIndex = (answer: string): number => {
    if (answer === "goal") return 0;
    if (answer === "no_goal") return 1;

    return Number(answer);
  };

  return calls.reduce((total, call) => {
    const answer = answers[call.key];

    if (
      !call.resolved ||
      call.voided ||
      !answer ||
      call.correctIndex === undefined
    ) {
      return total;
    }

    return (
      total +
      (answerIndex(answer.answer) === call.correctIndex
        ? GOAL_CALL_POINTS
        : 0)
    );
  }, 0);
}

export type StoredSettlement = {
  // Points each global-board bot earned on this match's live calls, graded on
  // the same resolved calls the fan answered (so it stays a fair head-to-head).
  // Keyed by botId; absent on matches settled before bots played live calls.
  botCallPoints?: Record<string, number>;
  finalScore: string;
  fixtureId: number;
  settledAt: string;
  totalPoints: number;
};

export function loadPredictions(): Record<string, MatchPrediction> {
  return readJsonRecord<MatchPrediction>(PREDICTIONS_KEY);
}

export function loadPrediction(fixtureId: number): MatchPrediction | null {
  return loadPredictions()[String(fixtureId)] ?? null;
}

export function savePrediction(prediction: MatchPrediction): void {
  writeJsonRecord(PREDICTIONS_KEY, {
    ...loadPredictions(),
    [String(prediction.fixtureId)]: prediction,
  });
  announceChange(PREDICTIONS_CHANGED_EVENT, prediction.fixtureId);
}

export function loadSettlements(): Record<string, StoredSettlement> {
  return readJsonRecord<StoredSettlement>(SETTLEMENTS_KEY);
}

export function saveSettlement(settlement: StoredSettlement): void {
  writeJsonRecord(SETTLEMENTS_KEY, {
    ...loadSettlements(),
    [String(settlement.fixtureId)]: settlement,
  });
  announceChange(SETTLEMENTS_CHANGED_EVENT, settlement.fixtureId);
}

// Heal bogus settlements (e.g. one saved mid-match by an older build).
export function removeSettlement(fixtureId: number): void {
  const all = loadSettlements();

  if (all[String(fixtureId)]) {
    delete all[String(fixtureId)];
    writeJsonRecord(SETTLEMENTS_KEY, all);
  }
}

// Live goal-call answers, keyed by fixture then by the raise event key.
export function loadGoalCalls(
  fixtureId: number,
): Record<string, GoalCallAnswer> {
  return (
    readJsonRecord<Record<string, GoalCallAnswer>>(GOAL_CALLS_KEY)[
      String(fixtureId)
    ] ?? {}
  );
}

export function saveGoalCall(
  fixtureId: number,
  callKey: string,
  answer: GoalCallAnswer,
): void {
  const all = readJsonRecord<Record<string, GoalCallAnswer>>(GOAL_CALLS_KEY);

  writeJsonRecord(GOAL_CALLS_KEY, {
    ...all,
    [String(fixtureId)]: { ...(all[String(fixtureId)] ?? {}), [callKey]: answer },
  });

  announceChange(GOAL_CALLS_CHANGED_EVENT, fixtureId);
}

// The signed-in fan's gameplay as the server holds it, for hydrating a device.
export type ServerGameState = {
  goalCalls: Array<{
    answers: Record<string, GoalCallAnswer>;
    fixtureId: number;
  }>;
  predictions: Array<{ fixtureId: number; prediction: MatchPrediction }>;
  settlements: StoredSettlement[];
};

// Reconcile the server's copy with this device on sign-in: pull down anything
// the device is missing (written WITHOUT firing change events, so the sync
// layer doesn't echo it straight back), and hand back whatever is local-only so
// the caller can push it up. Keeps both sides whole without clobbering edits.
export function mergeServerGameState(server: ServerGameState): {
  uploadGoalCalls: Array<{
    answers: Record<string, GoalCallAnswer>;
    fixtureId: number;
  }>;
  uploadPredictions: MatchPrediction[];
  uploadSettlements: StoredSettlement[];
} {
  const localPredictions = loadPredictions();
  const serverPredictionIds = new Set(server.predictions.map((p) => p.fixtureId));
  const mergedPredictions = { ...localPredictions };

  for (const entry of server.predictions) {
    if (!mergedPredictions[String(entry.fixtureId)]) {
      mergedPredictions[String(entry.fixtureId)] = entry.prediction;
    }
  }

  writeJsonRecord(PREDICTIONS_KEY, mergedPredictions);

  const localSettlements = loadSettlements();
  const serverSettlementIds = new Set(server.settlements.map((s) => s.fixtureId));
  const mergedSettlements = { ...localSettlements };

  for (const settlement of server.settlements) {
    if (!mergedSettlements[String(settlement.fixtureId)]) {
      mergedSettlements[String(settlement.fixtureId)] = settlement;
    }
  }

  writeJsonRecord(SETTLEMENTS_KEY, mergedSettlements);

  const localGoalCalls =
    readJsonRecord<Record<string, GoalCallAnswer>>(GOAL_CALLS_KEY);
  const serverGoalCallIds = new Set(server.goalCalls.map((g) => g.fixtureId));
  const mergedGoalCalls = { ...localGoalCalls };

  for (const entry of server.goalCalls) {
    if (!mergedGoalCalls[String(entry.fixtureId)]) {
      mergedGoalCalls[String(entry.fixtureId)] = entry.answers;
    }
  }

  writeJsonRecord(GOAL_CALLS_KEY, mergedGoalCalls);

  return {
    uploadGoalCalls: Object.entries(localGoalCalls)
      .filter(([id]) => !serverGoalCallIds.has(Number(id)))
      .map(([id, answers]) => ({ answers, fixtureId: Number(id) })),
    uploadPredictions: Object.values(localPredictions).filter(
      (prediction) => !serverPredictionIds.has(prediction.fixtureId),
    ),
    uploadSettlements: Object.values(localSettlements).filter(
      (settlement) => !serverSettlementIds.has(settlement.fixtureId),
    ),
  };
}

// Private leagues, device-local like everything else: the code is the id
// (and the thing friends share), the board selection remembers which
// leaderboard the fan last looked at.
export type StoredLeague = {
  code: string;
  joinedAt: string;
  // Rival names on this league's board. Absent until the owner first edits
  // the roster - boards derive the default cast from the code.
  members?: string[];
  name: string;
  role: "member" | "owner";
};

function announceLeaguesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LEAGUES_CHANGED_EVENT));
  }
}

export function loadLeagues(): StoredLeague[] {
  return Object.values(readJsonRecord<StoredLeague>(LEAGUES_KEY)).sort(
    (left, right) => left.joinedAt.localeCompare(right.joinedAt),
  );
}

export function saveLeague(league: StoredLeague): void {
  const all = readJsonRecord<StoredLeague>(LEAGUES_KEY);

  writeJsonRecord(LEAGUES_KEY, { ...all, [league.code]: league });
  announceLeaguesChanged();
}

// "global" or a stored league's code.
export function loadSelectedBoard(): string {
  if (typeof window === "undefined") {
    return "global";
  }

  try {
    return window.localStorage.getItem(LEAGUE_BOARD_KEY) ?? "global";
  } catch {
    return "global";
  }
}

export function saveSelectedBoard(board: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LEAGUE_BOARD_KEY, board);
  } catch {
    // best effort
  }

  announceLeaguesChanged();
}

// Matches the fan has bookmarked from the match page. Device-local, like the
// rest of this store. Fired on write so a useSyncExternalStore-backed button
// re-reads without an effect.
export const SAVED_MATCHES_CHANGED_EVENT = "pg:saved-matches-changed";

export function loadSavedMatches(): number[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SAVED_MATCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

export function isMatchSaved(fixtureId: number): boolean {
  return loadSavedMatches().includes(fixtureId);
}

export function setMatchSaved(fixtureId: number, saved: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  const others = loadSavedMatches().filter((id) => id !== fixtureId);
  const next = saved ? [...others, fixtureId] : others;

  try {
    window.localStorage.setItem(SAVED_MATCHES_KEY, JSON.stringify(next));
  } catch {
    // best effort
  }

  window.dispatchEvent(new Event(SAVED_MATCHES_CHANGED_EVENT));
}

// Subscribe seam for useSyncExternalStore: fires on our own writes and on
// cross-tab storage changes.
export function subscribeSavedMatches(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_MATCHES_KEY) onChange();
  };

  window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export type StoredResult = {
  awayGoals: number;
  homeGoals: number;
  statusId?: number;
};

// Final scores this device saw a match end with, so reloads know a fixture is
// over before the first feed poll returns (no LIVE flash on ended matches).
export function loadStoredResults(): Record<string, StoredResult> {
  return readJsonRecord<StoredResult>(RESULTS_KEY);
}

export function saveStoredResult(fixtureId: number, result: StoredResult): void {
  writeJsonRecord(RESULTS_KEY, {
    ...loadStoredResults(),
    [String(fixtureId)]: result,
  });
}

// TxLINE drops finished fixtures from its snapshot within hours; cache every
// fixture this device has seen so past matches never vanish from the app.
export function loadCachedFixtures(): WorldCupFixture[] {
  return Object.values(readJsonRecord<WorldCupFixture>(FIXTURES_KEY));
}

export function cacheFixtures(fixtures: WorldCupFixture[]): void {
  if (!fixtures.length) {
    return;
  }

  const all = readJsonRecord<WorldCupFixture>(FIXTURES_KEY);

  for (const fixture of fixtures) {
    all[String(fixture.fixtureId)] = fixture;
  }

  writeJsonRecord(FIXTURES_KEY, all);
}

export function isPredictionLocked(
  fixture: WorldCupFixture,
  now: number,
): boolean {
  return now >= new Date(fixture.kickoffUtc).getTime();
}

function readJsonRecord<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

function writeJsonRecord<T>(key: string, value: Record<string, T>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); predictions just stay in memory.
  }
}
