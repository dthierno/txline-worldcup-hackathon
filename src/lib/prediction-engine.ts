// Fixture-generic prediction and settlement rules. Everything here is pure and
// deterministic: the same prediction and the same TxLINE-derived outcome always
// settle to the same points, so settlement can be recomputed and audited.

export type WinnerPick = "home" | "draw" | "away";
export type LinePick = "over" | "under";

export type FirstScorerPick =
  | { name: string; playerId: number }
  | "none";

export type DoubleChancePick = "draw_away" | "home_away" | "home_draw";

// Optional extra markets picked straight off the TxLINE odds board. Each pick
// freezes the decimal odds it was taken at; payout scales with those odds.
export type SidePick =
  | { kind: "double_chance"; odds: number; pick: DoubleChancePick }
  | { kind: "goals_line"; line: number; odds: number; pick: LinePick }
  | { kind: "handicap"; line: number; odds: number; pick: "away" | "home" };

// Every market is optional: null means the player skipped it, and skipped
// markets neither settle nor score.
export type MatchPrediction = {
  // Scorer markets share the first-scorer pick shape and need a verified
  // TxLINE player list at prediction time.
  anytimeScorer?: FirstScorerPick | null;
  awayGoals: number | null;
  firstScorer?: FirstScorerPick | null;
  lastScorer?: FirstScorerPick | null;
  fixtureId: number;
  // TxLINE 1X2 decimal odds captured when the prediction was saved; the
  // winner market pays out scaled by the picked outcome's odds.
  oddsAtSave?: { away: number; draw: number; home: number } | null;
  // Fair decimal odds of the picked exact score (Poisson model over the
  // TxLINE prices), frozen at save; unlikely scorelines pay more.
  exactScoreOdds?: number | null;
  homeGoals: number | null;
  savedAt: string;
  sidePicks?: SidePick[] | null;
  totalCards: LinePick | null;
  totalCorners: LinePick | null;
  totalGoals: LinePick | null;
  winner: WinnerPick | null;
};

export type MatchOutcome = {
  awayGoals: number;
  finished: boolean;
  // First goal of the match, when one has happened; scorerName is resolved
  // from the TxLINE lineups when the playerId is known.
  firstGoal?: { playerId?: number; scorerName?: string } | null;
  // Every goal in order, for the anytime and last-scorer markets. Absent on
  // outcomes built before these markets existed.
  goals?: Array<{ playerId?: number; scorerName?: string }> | null;
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
  anytimeScorer: 4,
  exactScore: 5,
  firstScorer: 6,
  lastScorer: 6,
  line: 2,
  winner: 3,
} as const;

// Side picks pay double their decimal odds, clamped so one lucky long shot
// cannot dwarf the rest of the league.
export const SIDE_PICK_POINTS = { base: 2, cap: 20 } as const;
export const MAX_SIDE_PICKS = 5;

export function sidePickPoints(odds: number): number {
  if (!Number.isFinite(odds) || odds <= 1) {
    return SIDE_PICK_POINTS.base;
  }

  return Math.min(
    SIDE_PICK_POINTS.cap,
    Math.max(SIDE_PICK_POINTS.base, Math.round(SIDE_PICK_POINTS.base * odds)),
  );
}

// Exact-score payout: the fair odds of the scoreline frozen at save time,
// floored at the flat base and capped like the winner market.
export function exactScorePoints(odds?: number | null): number {
  if (!odds || !Number.isFinite(odds)) {
    return PREDICTION_POINTS.exactScore;
  }

  return Math.min(
    30,
    Math.max(PREDICTION_POINTS.exactScore, Math.round(odds)),
  );
}

// Odds-aware winner payout: base points scaled by the decimal odds locked at
// save time (bold picks pay more), capped to keep totals sane.
export function winnerPoints(odds?: number | null): number {
  if (!odds || !Number.isFinite(odds)) {
    return PREDICTION_POINTS.winner;
  }

  return Math.min(
    30,
    Math.max(
      PREDICTION_POINTS.winner,
      Math.round(PREDICTION_POINTS.winner * odds),
    ),
  );
}

export const MAX_PREDICTED_GOALS = 12;

export function clampGoals(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_PREDICTED_GOALS, Math.trunc(value)));
}

// A fresh card carries no picks: every market starts skipped and the player
// opts into the ones they want.
export function defaultPrediction(fixtureId: number): MatchPrediction {
  return {
    awayGoals: null,
    fixtureId,
    homeGoals: null,
    savedAt: "",
    totalCards: null,
    totalCorners: null,
    totalGoals: null,
    winner: null,
  };
}

// Number of markets the prediction actually plays.
export function pickCount(prediction: MatchPrediction): number {
  return (
    (prediction.winner != null ? 1 : 0) +
    (prediction.homeGoals != null && prediction.awayGoals != null ? 1 : 0) +
    (prediction.totalGoals != null ? 1 : 0) +
    (prediction.totalCorners != null ? 1 : 0) +
    (prediction.totalCards != null ? 1 : 0) +
    (prediction.firstScorer != null ? 1 : 0) +
    (prediction.anytimeScorer != null ? 1 : 0) +
    (prediction.lastScorer != null ? 1 : 0) +
    (prediction.sidePicks?.length ?? 0)
  );
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

  const hasScorePick =
    prediction.homeGoals != null && prediction.awayGoals != null;
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

  // Skipped markets (null picks) stay off the settlement sheet entirely.
  const markets: SettledMarket[] = [
    ...(prediction.firstScorer != null
      ? [settleFirstScorer(prediction.firstScorer, outcome)]
      : []),
    ...(prediction.anytimeScorer != null
      ? [settleAnytimeScorer(prediction.anytimeScorer, outcome)]
      : []),
    ...(prediction.lastScorer != null
      ? [settleLastScorer(prediction.lastScorer, outcome)]
      : []),
    ...(hasScorePick
      ? [
          settledMarket(
            "Exact score",
            `${prediction.homeGoals}-${prediction.awayGoals}`,
            actualScore,
            exactScoreStatus,
            exactScorePoints(prediction.exactScoreOdds),
          ),
        ]
      : []),
    ...(prediction.winner != null
      ? [
          settledMarket(
            "Winner",
            winnerLabels[prediction.winner],
            outcome.finished
              ? winnerLabels[outcomeWinner(outcome)]
              : actualScore,
            winnerStatus,
            winnerPoints(prediction.oddsAtSave?.[prediction.winner]),
          ),
        ]
      : []),
    ...(prediction.totalGoals != null
      ? [
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
        ]
      : []),
    ...(prediction.totalCorners != null
      ? [
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
        ]
      : []),
    ...(prediction.totalCards != null
      ? [
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
        ]
      : []),
    ...(prediction.sidePicks ?? [])
      .slice(0, MAX_SIDE_PICKS)
      .map((sidePick) => settleSidePick(sidePick, outcome, teams)),
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

const DOUBLE_CHANCE_COVERS: Record<DoubleChancePick, [WinnerPick, WinnerPick]> =
  {
    draw_away: ["draw", "away"],
    home_away: ["home", "away"],
    home_draw: ["home", "draw"],
  };

export function doubleChanceLabel(
  pick: DoubleChancePick,
  teams: { awayTeam: string; homeTeam: string },
): string {
  const names: Record<WinnerPick, string> = {
    away: teams.awayTeam,
    draw: "Draw",
    home: teams.homeTeam,
  };
  const [first, second] = DOUBLE_CHANCE_COVERS[pick];

  return `${names[first]} or ${names[second]}`;
}

export function handicapLineLabel(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

function settleSidePick(
  pick: SidePick,
  outcome: MatchOutcome,
  teams: { awayTeam: string; homeTeam: string },
): SettledMarket {
  const actualScore = `${outcome.homeGoals}-${outcome.awayGoals}`;
  const points = sidePickPoints(pick.odds);

  if (pick.kind === "double_chance") {
    const status: MarketStatus = !outcome.finished
      ? "open"
      : DOUBLE_CHANCE_COVERS[pick.pick].includes(outcomeWinner(outcome))
        ? "won"
        : "lost";

    return settledMarket(
      "Double chance",
      doubleChanceLabel(pick.pick, teams),
      outcome.finished ? actualScore : "Not finished",
      status,
      points,
    );
  }

  if (pick.kind === "goals_line") {
    const totalGoals = outcome.homeGoals + outcome.awayGoals;

    return settledMarket(
      `Goals over/under ${pick.line}`,
      linePickLabel(pick.pick, pick.line),
      `${totalGoals} goal(s)`,
      settleLinePick(pick.pick, totalGoals, pick.line, outcome.finished),
      points,
    );
  }

  // Handicap: the line is applied to the home side. Integer lines can land
  // exactly on the line - that is a push, so the market voids.
  const margin = outcome.homeGoals - outcome.awayGoals + pick.line;
  const status: MarketStatus = !outcome.finished
    ? "open"
    : margin === 0
      ? "void"
      : (margin > 0) === (pick.pick === "home")
        ? "won"
        : "lost";

  return settledMarket(
    `Handicap ${teams.homeTeam} ${handicapLineLabel(pick.line)}`,
    pick.pick === "home" ? teams.homeTeam : teams.awayTeam,
    outcome.finished ? actualScore : "Not finished",
    status,
    points,
  );
}

function scorerGoalLabel(
  goal: { playerId?: number; scorerName?: string } | null,
  finished: boolean,
): string {
  return goal
    ? goal.scorerName ??
        (typeof goal.playerId === "number"
          ? `Player ${goal.playerId}`
          : "Scorer unrecorded")
    : finished
      ? "No goal scored"
      : "No goal yet";
}

function settleFirstScorer(
  pick: FirstScorerPick,
  outcome: MatchOutcome,
): SettledMarket {
  const firstGoal = outcome.firstGoal ?? null;
  const pickLabel = pick === "none" ? "No goal scorer" : pick.name;
  const result = scorerGoalLabel(firstGoal, outcome.finished);

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

// Goals known to this outcome, oldest first. Falls back to the first goal
// for outcomes recorded before the goals list existed.
function outcomeGoals(
  outcome: MatchOutcome,
): Array<{ playerId?: number; scorerName?: string }> {
  return outcome.goals ?? (outcome.firstGoal ? [outcome.firstGoal] : []);
}

function settleAnytimeScorer(
  pick: FirstScorerPick,
  outcome: MatchOutcome,
): SettledMarket {
  const goals = outcomeGoals(outcome);
  const pickLabel = pick === "none" ? "No goal scorer" : pick.name;
  const named = goals
    .map((goal) => goal.scorerName)
    .filter((name): name is string => Boolean(name));
  const result = goals.length
    ? named.length
      ? named.join(", ")
      : "Scorer unrecorded"
    : outcome.finished
      ? "No goal scored"
      : "No goal yet";

  let status: MarketStatus;

  if (pick === "none") {
    status = goals.length ? "lost" : outcome.finished ? "won" : "open";
  } else if (
    goals.some((goal) => goal.playerId === pick.playerId)
  ) {
    // The pick can land mid-match; a scored goal cannot be unscored.
    status = "won";
  } else if (!outcome.finished) {
    status = "open";
  } else if (goals.some((goal) => typeof goal.playerId !== "number")) {
    // Unattributed goals at full time: the pick cannot be ruled out.
    status = "void";
  } else {
    status = "lost";
  }

  return settledMarket(
    "Anytime scorer",
    pickLabel,
    result,
    status,
    PREDICTION_POINTS.anytimeScorer,
  );
}

function settleLastScorer(
  pick: FirstScorerPick,
  outcome: MatchOutcome,
): SettledMarket {
  const goals = outcomeGoals(outcome);
  const lastGoal = goals.at(-1) ?? null;
  const pickLabel = pick === "none" ? "No goal scorer" : pick.name;
  const result = scorerGoalLabel(lastGoal, outcome.finished);

  let status: MarketStatus;

  if (!outcome.finished) {
    // Any later goal changes the answer; the market only closes at the
    // final whistle.
    status = "open";
  } else if (pick === "none") {
    status = lastGoal ? "lost" : "won";
  } else if (!lastGoal) {
    status = "lost";
  } else if (typeof lastGoal.playerId !== "number") {
    status = "void";
  } else {
    status = lastGoal.playerId === pick.playerId ? "won" : "lost";
  }

  return settledMarket(
    "Last scorer",
    pickLabel,
    result,
    status,
    PREDICTION_POINTS.lastScorer,
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
