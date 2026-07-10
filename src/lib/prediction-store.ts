// localStorage persistence for prototype predictions. No database by design:
// predictions and settled results live on the fan's device only.

import type { MatchPrediction } from "./prediction-engine";
import type { WorldCupFixture } from "./world-cup-fixtures";

const PREDICTIONS_KEY = "fan-forecast.predictions.v1";
const SETTLEMENTS_KEY = "fan-forecast.settlements.v1";

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
