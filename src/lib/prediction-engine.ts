import type {
  DemoEvent,
  MatchSnapshot,
  Player,
  Prediction,
  ScoreBreakdown,
  TeamSide,
  WinnerPick,
} from "./types";
import { featuredFixture } from "./world-cup-fixtures";

export const defaultPrediction: Prediction = {
  homeScore: 1,
  awayScore: 2,
  winner: "away",
  totalGoals: "over",
  totalCards: "over",
  totalCorners: "over",
  nextGoal: "home",
  locked: true,
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(12, Math.trunc(value)));
}

export function getWinner(snapshot: MatchSnapshot): WinnerPick {
  if (snapshot.homeScore > snapshot.awayScore) {
    return "home";
  }

  if (snapshot.awayScore > snapshot.homeScore) {
    return "away";
  }

  return "draw";
}

export function getTotalGoals(snapshot: MatchSnapshot): number {
  return snapshot.homeScore + snapshot.awayScore;
}

export function calculateScoreBreakdown(
  prediction: Prediction,
  snapshot: MatchSnapshot,
  events: DemoEvent[],
): ScoreBreakdown {
  if (snapshot.status === "pre") {
    return {
      exactScore: 0,
      winner: 0,
      totalGoals: 0,
      totalCards: 0,
      totalCorners: 0,
      nextGoal: 0,
      total: 0,
    };
  }

  const exactScore =
    prediction.homeScore === snapshot.homeScore &&
    prediction.awayScore === snapshot.awayScore
      ? 8
      : 0;
  const winner = prediction.winner === getWinner(snapshot) ? 3 : 0;
  const totalGoals = didSettleLine(
    prediction.totalGoals,
    getTotalGoals(snapshot),
    2.5,
    snapshot.status,
  )
    ? 2
    : 0;
  const totalCorners = didSettleLine(
    prediction.totalCorners,
    snapshot.totalCorners ?? 0,
    8.5,
    snapshot.status,
  )
    ? 2
    : 0;
  const totalCards = didSettleLine(
    prediction.totalCards,
    snapshot.totalCards ?? 0,
    3.5,
    snapshot.status,
  )
    ? 2
    : 0;
  const nextGoal = didPickFirstGoal(prediction.nextGoal, events, snapshot.status)
    ? 4
    : 0;

  return {
    exactScore,
    winner,
    totalGoals,
    totalCards,
    totalCorners,
    nextGoal,
    total:
      exactScore + winner + totalGoals + totalCorners + totalCards + nextGoal,
  };
}

export function didSettleLine(
  pick: Prediction["totalCorners"] | Prediction["totalCards"],
  actual: number,
  line: number,
  status: MatchSnapshot["status"],
): boolean {
  if (pick === "over") {
    return actual > line;
  }

  return status === "finished" && actual < line;
}

export function didPickFirstGoal(
  pick: Prediction["nextGoal"],
  events: DemoEvent[],
  status: MatchSnapshot["status"] = "live",
): boolean {
  const firstGoal = events.find((event) => event.type === "goal");

  if (!firstGoal?.nextGoalScorer) {
    return status === "finished" && pick === "none";
  }

  return pick === firstGoal.nextGoalScorer;
}

export function formatWinnerPick(pick: WinnerPick): string {
  const labels: Record<WinnerPick, string> = {
    home: featuredFixture.homeTeam,
    draw: "Draw",
    away: featuredFixture.awayTeam,
  };

  return labels[pick];
}

export function formatLiveRoundPick(pick: Prediction["nextGoal"]): string {
  const labels: Record<Prediction["nextGoal"], string> = {
    home: featuredFixture.homeTeam,
    away: featuredFixture.awayTeam,
    none: "No goal",
  };

  return labels[pick];
}

export function formatTotalGoalsPick(pick: Prediction["totalGoals"]): string {
  return pick === "over" ? "Over 2.5" : "Under 2.5";
}

export function formatTotalCornersPick(
  pick: Prediction["totalCorners"],
): string {
  return pick === "over" ? "Over 8.5" : "Under 8.5";
}

export function formatTotalCardsPick(pick: Prediction["totalCards"]): string {
  return pick === "over" ? "Over 3.5" : "Under 3.5";
}

export function buildLeaderboard(
  players: Player[],
  thiernoBreakdown: ScoreBreakdown,
) {
  return players
    .map((player) => {
      const isUser = player.name === "Thierno";
      const livePoints = isUser
        ? thiernoBreakdown.total
        : getRivalLivePoints(player.name);

      return {
        ...player,
        livePoints,
        score: player.baseScore + livePoints,
        trend: isUser ? formatTrend(thiernoBreakdown.total) : player.trend,
      };
    })
    .sort((left, right) => right.score - left.score);
}

export function applyPredictionUpdate(
  prediction: Prediction,
  key: "homeScore" | "awayScore",
  value: number,
): Prediction {
  if (prediction.locked) {
    return prediction;
  }

  return {
    ...prediction,
    [key]: clampScore(value),
  };
}

export function sideLabel(side: TeamSide): string {
  return side === "home" ? featuredFixture.homeTeam : featuredFixture.awayTeam;
}

function getRivalLivePoints(name: string): number {
  const points: Record<string, number> = {
    Amina: 3,
    Sam: 1,
    Noah: 0,
  };

  return points[name] ?? 0;
}

function formatTrend(points: number): string {
  if (points === 0) {
    return "Waiting on events";
  }

  return `+${points} live`;
}
