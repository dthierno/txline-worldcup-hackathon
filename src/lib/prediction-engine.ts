// Fixture-generic prediction and settlement rules. Everything here is pure and
// deterministic: the same prediction and the same TxLINE-derived outcome always
// settle to the same points, so settlement can be recomputed and audited.

export type WinnerPick = "home" | "draw" | "away";
export type LinePick = "over" | "under";

export type FirstScorerPick =
  | { name: string; playerId: number }
  | "none";

export type MatchPrediction = {
  awayGoals: number;
  // Only present when a verified TxLINE player list existed at prediction time.
  firstScorer?: FirstScorerPick | null;
  fixtureId: number;
  homeGoals: number;
  savedAt: string;
  totalCards: LinePick;
  totalCorners: LinePick;
  totalGoals: LinePick;
  winner: WinnerPick;
};

export type MatchOutcome = {
  awayGoals: number;
  finished: boolean;
  // First goal of the match, when one has happened; scorerName is resolved
  // from the TxLINE lineups when the playerId is known.
  firstGoal?: { playerId?: number; scorerName?: string } | null;
  homeGoals: number;
  totalCards: number;
  totalCorners: number;
};

export type MarketStatus = "won" | "lost" | "open" | "void";

export type SettledMarket = {
  market: string;
  pick: string;
  points: number;
  result: string;
  status: MarketStatus;
};

export type Settlement = {
  final: boolean;
  markets: SettledMarket[];
  totalPoints: number;
};

export const PREDICTION_LINES = {
  cards: 3.5,
  corners: 8.5,
  goals: 2.5,
} as const;

export const PREDICTION_POINTS = {
  exactScore: 5,
  firstScorer: 6,
  line: 2,
  winner: 3,
} as const;

export const MAX_PREDICTED_GOALS = 12;

export function clampGoals(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_PREDICTED_GOALS, Math.trunc(value)));
}

export function defaultPrediction(fixtureId: number): MatchPrediction {
  return {
    awayGoals: 1,
    fixtureId,
    homeGoals: 1,
    savedAt: "",
    totalCards: "under",
    totalCorners: "under",
    totalGoals: "under",
    winner: "draw",
  };
}

export function outcomeWinner(outcome: MatchOutcome): WinnerPick {
  if (outcome.homeGoals > outcome.awayGoals) {
    return "home";
  }

  if (outcome.awayGoals > outcome.homeGoals) {
    return "away";
  }

  return "draw";
}

// Over lines can settle as soon as the actual total passes the line; everything
// else needs the final whistle.
export function settleLinePick(
  pick: LinePick,
  actual: number,
  line: number,
  finished: boolean,
): MarketStatus {
  if (pick === "over") {
    if (actual > line) {
      return "won";
    }

    return finished ? "lost" : "open";
  }

  if (actual > line) {
    return "lost";
  }

  return finished ? "won" : "open";
}

export function settlePrediction(
  prediction: MatchPrediction,
  outcome: MatchOutcome,
  teams: { awayTeam: string; homeTeam: string },
): Settlement {
  const winnerLabels: Record<WinnerPick, string> = {
    away: teams.awayTeam,
    draw: "Draw",
    home: teams.homeTeam,
  };
  const actualScore = `${outcome.homeGoals}-${outcome.awayGoals}`;
  const totalGoals = outcome.homeGoals + outcome.awayGoals;

  const exactScoreStatus: MarketStatus = !outcome.finished
    ? "open"
    : prediction.homeGoals === outcome.homeGoals &&
        prediction.awayGoals === outcome.awayGoals
      ? "won"
      : "lost";
  const winnerStatus: MarketStatus = !outcome.finished
    ? "open"
    : prediction.winner === outcomeWinner(outcome)
      ? "won"
      : "lost";

  const markets: SettledMarket[] = [
    ...(prediction.firstScorer != null
      ? [settleFirstScorer(prediction.firstScorer, outcome)]
      : []),
    settledMarket(
      "Exact score",
      `${prediction.homeGoals}-${prediction.awayGoals}`,
      actualScore,
      exactScoreStatus,
      PREDICTION_POINTS.exactScore,
    ),
    settledMarket(
      "Winner",
      winnerLabels[prediction.winner],
      outcome.finished ? winnerLabels[outcomeWinner(outcome)] : actualScore,
      winnerStatus,
      PREDICTION_POINTS.winner,
    ),
    settledMarket(
      `Goals over/under ${PREDICTION_LINES.goals}`,
      linePickLabel(prediction.totalGoals, PREDICTION_LINES.goals),
      `${totalGoals} goal(s)`,
      settleLinePick(
        prediction.totalGoals,
        totalGoals,
        PREDICTION_LINES.goals,
        outcome.finished,
      ),
      PREDICTION_POINTS.line,
    ),
    settledMarket(
      `Corners over/under ${PREDICTION_LINES.corners}`,
      linePickLabel(prediction.totalCorners, PREDICTION_LINES.corners),
      `${outcome.totalCorners} corner(s)`,
      settleLinePick(
        prediction.totalCorners,
        outcome.totalCorners,
        PREDICTION_LINES.corners,
        outcome.finished,
      ),
      PREDICTION_POINTS.line,
    ),
    settledMarket(
      `Cards over/under ${PREDICTION_LINES.cards}`,
      linePickLabel(prediction.totalCards, PREDICTION_LINES.cards),
      `${outcome.totalCards} card(s)`,
      settleLinePick(
        prediction.totalCards,
        outcome.totalCards,
        PREDICTION_LINES.cards,
        outcome.finished,
      ),
      PREDICTION_POINTS.line,
    ),
  ];

  return {
    final: outcome.finished,
    markets,
    totalPoints: markets.reduce((total, market) => total + market.points, 0),
  };
}

export function linePickLabel(pick: LinePick, line: number): string {
  return `${pick === "over" ? "Over" : "Under"} ${line}`;
}

function settleFirstScorer(
  pick: FirstScorerPick,
  outcome: MatchOutcome,
): SettledMarket {
  const firstGoal = outcome.firstGoal ?? null;
  const pickLabel = pick === "none" ? "No goal scorer" : pick.name;
  const result = firstGoal
    ? firstGoal.scorerName ??
      (typeof firstGoal.playerId === "number"
        ? `Player ${firstGoal.playerId}`
        : "Scorer unrecorded")
    : outcome.finished
      ? "No goal scored"
      : "No goal yet";

  let status: MarketStatus;

  if (pick === "none") {
    status = firstGoal ? "lost" : outcome.finished ? "won" : "open";
  } else if (!firstGoal) {
    status = outcome.finished ? "lost" : "open";
  } else if (typeof firstGoal.playerId !== "number") {
    // A goal happened but TxLINE carried no player on it: void, never guess.
    status = "void";
  } else {
    status = firstGoal.playerId === pick.playerId ? "won" : "lost";
  }

  return settledMarket(
    "First scorer",
    pickLabel,
    result,
    status,
    PREDICTION_POINTS.firstScorer,
  );
}

function settledMarket(
  market: string,
  pick: string,
  result: string,
  status: MarketStatus,
  pointsIfWon: number,
): SettledMarket {
  return {
    market,
    pick,
    points: status === "won" ? pointsIfWon : 0,
    result,
    status,
  };
}
