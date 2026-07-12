// localStorage persistence for prototype predictions. No database by design:
// predictions and settled results live on the fan's device only.

import type { MatchPrediction } from "./prediction-engine";
import type { WorldCupFixture } from "./world-cup-fixtures";

const PREDICTIONS_KEY = "fan-forecast.predictions.v1";
const SETTLEMENTS_KEY = "fan-forecast.settlements.v1";
const GOAL_CALLS_KEY = "fan-forecast.goalcalls.v1";
const FIXTURES_KEY = "fan-forecast.fixtures.v1";
const RESULTS_KEY = "fan-forecast.results.v1";

export const GOAL_CALL_POINTS = 2;

export type GoalCallAnswer = {
  // Option index as a string ("0" | "1"); legacy values "goal"/"no_goal"
  // are still understood by the reader.
  answer: string;
  answeredAt: string;
};

export type StoredSettlement = {
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
}

export function loadSettlements(): Record<string, StoredSettlement> {
  return readJsonRecord<StoredSettlement>(SETTLEMENTS_KEY);
}

export function saveSettlement(settlement: StoredSettlement): void {
  writeJsonRecord(SETTLEMENTS_KEY, {
    ...loadSettlements(),
    [String(settlement.fixtureId)]: settlement,
  });
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
