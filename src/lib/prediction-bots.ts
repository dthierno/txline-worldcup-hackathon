// Prediction bots for the global board. Each bot is a strategy that commits a
// scoreline to every match - exactly like a fan tapping one in - then gets
// scored by the same engine (settlePrediction) against the real result. Their
// points are earned, not a fraction of yours: a bot can finish above or below
// you. Picks are a deterministic function of a strength/Poisson model, so they
// never flicker between renders and match on the server and the client.

import {
  settlePrediction,
  type MatchOutcome,
  type MatchPrediction,
  type WinnerPick,
} from "@/lib/prediction-engine";
import {
  GOAL_CALL_POINTS,
  type GoalCallAnswer,
  type StoredSettlement,
} from "@/lib/prediction-store";
import type { SettleableCall } from "@/lib/txline-normalize";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";
import { worldCupResults } from "@/lib/world-cup-results";

type Strategy = "punter" | "sharp" | "wildcard";

export type Bot = {
  botId: string;
  name: string;
  strategy: Strategy;
  tagline: string;
};

// Three distinct temperaments so the board has personality: a sharp who trusts
// the model, a punter who piles on favourites, and a wildcard who chases the
// upset. Over a run of matches they separate the way real punters do.
export const BOTS: Bot[] = [
  {
    botId: "vega",
    name: "Vega",
    strategy: "sharp",
    tagline: "Backs the model's most-likely scoreline. Steady.",
  },
  {
    botId: "rocco",
    name: "Rocco",
    strategy: "punter",
    tagline: "Piles on the favourites to win big. Streaky.",
  },
  {
    botId: "chaos",
    name: "Chaos",
    strategy: "wildcard",
    tagline: "Chases upsets and draws. Boom or bust.",
  },
];

// Rough tournament strength, 60 (minnow) to 92 (contender). Only the relative
// order matters: it sets each match's favourite and how one-sided the model
// thinks it is. Anyone unlisted falls back to DEFAULT_STRENGTH.
const DEFAULT_STRENGTH = 70;
const TEAM_STRENGTH: Record<string, number> = {
  Argentina: 92,
  France: 91,
  Spain: 90,
  Brazil: 89,
  England: 88,
  Portugal: 86,
  Netherlands: 85,
  Belgium: 84,
  Germany: 84,
  Croatia: 81,
  Uruguay: 81,
  Morocco: 80,
  Colombia: 79,
  Switzerland: 78,
  Senegal: 78,
  Japan: 77,
  USA: 77,
  Mexico: 77,
  Norway: 76,
  Ecuador: 74,
  Sweden: 74,
  Austria: 74,
  Turkey: 74,
  "Ivory Coast": 73,
  Canada: 73,
  "South Korea": 73,
  Iran: 73,
  "Czech Republic": 73,
  Egypt: 72,
  Algeria: 72,
  Scotland: 72,
  Australia: 72,
  Ghana: 71,
  Paraguay: 71,
  Tunisia: 71,
  "Bosnia & Herzegovina": 70,
  "Congo DR": 70,
  "South Africa": 68,
  Qatar: 67,
  "Saudi Arabia": 67,
  Uzbekistan: 67,
  "Cape Verde": 66,
  Panama: 66,
  Jordan: 65,
  Iraq: 65,
  "New Zealand": 65,
  Haiti: 62,
  Curacao: 62,
};

// The listed home side gets a small nudge; the logit scale is tuned so a
// ten-point strength gap reads as roughly a 3-in-4 favourite.
const HOME_ADVANTAGE = 2;
const LOGIT_SCALE = 9;
const BASE_TOTAL_GOALS = 2.6;
const MAX_MODEL_GOALS = 6;

function strengthOf(team: string): number {
  return TEAM_STRENGTH[team] ?? DEFAULT_STRENGTH;
}

function factorial(n: number): number {
  let result = 1;

  for (let value = 2; value <= n; value += 1) {
    result *= value;
  }

  return result;
}

function poisson(goals: number, lambda: number): number {
  return (Math.exp(-lambda) * lambda ** goals) / factorial(goals);
}

type MatchModel = {
  lambdaAway: number;
  lambdaHome: number;
  odds: { away: number; draw: number; home: number };
};

// A tiny 1X2 + Poisson model off the two strengths: win/draw/away probabilities
// (turned into fair decimal odds, which drive the winner payout) and a goal
// expectation for each side (which drives the exact-score search and payout).
function modelFor(home: string, away: string): MatchModel {
  const gap = strengthOf(home) + HOME_ADVANTAGE - strengthOf(away);
  const homeCore = 1 / (1 + Math.exp(-gap / LOGIT_SCALE));
  const drawProbability = 0.27 * Math.exp(-Math.abs(gap) / 35);
  const homeProbability = (1 - drawProbability) * homeCore;
  const awayProbability = (1 - drawProbability) * (1 - homeCore);

  // Shares sum to one, so the two lambdas sum to BASE_TOTAL_GOALS; the favourite
  // simply takes the larger share of the goals.
  const homeWeight = homeProbability + drawProbability / 2;
  const awayWeight = awayProbability + drawProbability / 2;
  const asOdds = (probability: number) => 1 / Math.max(probability, 0.02);

  return {
    lambdaAway: BASE_TOTAL_GOALS * awayWeight,
    lambdaHome: BASE_TOTAL_GOALS * homeWeight,
    odds: {
      away: asOdds(awayProbability),
      draw: asOdds(drawProbability),
      home: asOdds(homeProbability),
    },
  };
}

// Most-likely scoreline under the model - the sharp's pick.
function mostLikelyScore(model: MatchModel): [number, number] {
  let bestHome = 0;
  let bestAway = 0;
  let bestProbability = -1;

  for (let home = 0; home <= MAX_MODEL_GOALS; home += 1) {
    for (let away = 0; away <= MAX_MODEL_GOALS; away += 1) {
      const probability =
        poisson(home, model.lambdaHome) * poisson(away, model.lambdaAway);

      if (probability > bestProbability) {
        bestProbability = probability;
        bestHome = home;
        bestAway = away;
      }
    }
  }

  return [bestHome, bestAway];
}

// Deterministic [0, 1) from a fixture id, so the wildcard's swings are fixed per
// match rather than random per render.
function seededUnit(seed: number): number {
  let value = Math.trunc(seed) | 0;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;

  return ((value >>> 0) % 100000) / 100000;
}

function pickScore(
  strategy: Strategy,
  fixtureId: number,
  model: MatchModel,
): [number, number] {
  const favouriteIsHome = model.lambdaHome >= model.lambdaAway;

  if (strategy === "sharp") {
    return mostLikelyScore(model);
  }

  if (strategy === "punter") {
    // Favourite to win, decisively - bigger when the model likes them a lot.
    const strong = Math.max(model.lambdaHome, model.lambdaAway) >= 1.9;
    const lead = strong ? 3 : 2;
    const trail = strong ? 1 : 0;

    return favouriteIsHome ? [lead, trail] : [trail, lead];
  }

  // Wildcard: a third of the time a draw, then a spell of backing the underdog,
  // otherwise a narrow favourite call.
  const roll = seededUnit(fixtureId * 2654435761);

  if (roll < 0.34) {
    const goals = roll < 0.17 ? 1 : 2;

    return [goals, goals];
  }

  if (roll < 0.62) {
    return favouriteIsHome ? [1, 2] : [2, 1];
  }

  return favouriteIsHome ? [2, 1] : [1, 2];
}

// Build the bot's saved prediction: its scoreline plus the model odds frozen on
// it, so the winner and exact-score markets pay out exactly as they would for a
// fan who saved those same odds.
function botPrediction(
  fixtureId: number,
  home: string,
  away: string,
  strategy: Strategy,
): MatchPrediction {
  const model = modelFor(home, away);
  const [homeGoals, awayGoals] = pickScore(strategy, fixtureId, model);
  const winner: WinnerPick =
    homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : "draw";
  const cellProbability = Math.max(
    poisson(homeGoals, model.lambdaHome) * poisson(awayGoals, model.lambdaAway),
    1e-4,
  );

  return {
    awayGoals,
    exactScoreOdds: 1 / cellProbability,
    fixtureId,
    homeGoals,
    oddsAtSave: model.odds,
    savedAt: "",
    totalCards: null,
    totalCorners: null,
    totalGoals: null,
    winner,
  };
}

export type BotStanding = { botId: string; name: string; points: number };

// Score every bot over the matches the fan has already settled, using the same
// final scores the fan was scored on. Same match set for everyone, so the board
// is a fair head-to-head that grows as the fan plays more.
export function botStandings(
  finals: Record<string, StoredSettlement>,
  fixtures: WorldCupFixture[],
): BotStanding[] {
  const teamsById = new Map<number, { away: string; home: string }>();

  for (const result of worldCupResults) {
    teamsById.set(result.fixtureId, { away: result.away, home: result.home });
  }

  for (const fixture of fixtures) {
    teamsById.set(fixture.fixtureId, {
      away: fixture.awayTeam,
      home: fixture.homeTeam,
    });
  }

  const totals = BOTS.map((bot) => ({
    botId: bot.botId,
    name: bot.name,
    points: 0,
  }));

  for (const settlement of Object.values(finals)) {
    const teams = teamsById.get(settlement.fixtureId);

    if (!teams) {
      continue;
    }

    const [homeGoals, awayGoals] = settlement.finalScore.split("-").map(Number);

    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) {
      continue;
    }

    const outcome: MatchOutcome = {
      awayGoals,
      finished: true,
      homeGoals,
      totalCards: 0,
      totalCorners: 0,
    };

    BOTS.forEach((bot, index) => {
      const prediction = botPrediction(
        settlement.fixtureId,
        teams.home,
        teams.away,
        bot.strategy,
      );

      // Scoreline points from the shared engine, plus whatever this bot earned
      // on the match's live calls (graded and frozen at settle time).
      totals[index].points +=
        settlePrediction(prediction, outcome, {
          awayTeam: teams.away,
          homeTeam: teams.home,
        }).totalPoints + (settlement.botCallPoints?.[bot.botId] ?? 0);
    });
  }

  return totals;
}

// ---- Live calls -------------------------------------------------------------

type CallKind = "added" | "corner" | "goal" | "next" | "penalty" | "var";

// The call kind is recoverable from the key prefix the extractors mint; a bare
// event id (no known prefix) is an in-play goal call.
function callKind(key: string): CallKind {
  if (key.startsWith("nextgoal-")) return "next";
  if (key.startsWith("corner-")) return "corner";
  if (key.startsWith("addtime-")) return "added";
  if (key.startsWith("penalty-")) return "penalty";
  if (key.startsWith("var-")) return "var";

  return "goal";
}

// Index 0/1 per kind means 0 = goal / home / over / scored / overturned.
// FAVOURED is the higher-base-rate answer a sharp leans to; ACTION is the
// crowd-pleasing side a punter chases.
const FAVOURED_INDEX: Record<CallKind, 0 | 1> = {
  added: 1, // added time usually lands under 3.5
  corner: 0, // the home side wins marginally more corners
  goal: 0, // a flagged goal usually stands
  next: 0, // slight edge to the home side
  penalty: 0, // penalties convert about three times in four
  var: 0, // the only VAR outcome the feed reports is "overturned"
};
const ACTION_INDEX: Record<CallKind, 0 | 1> = {
  added: 0,
  corner: 0,
  goal: 0,
  next: 0,
  penalty: 0,
  var: 0,
};

// How often a bot sticks with its intended answer instead of slipping. Sharp
// mostly right, punter middling, wildcard a coin toss - that spread is what
// separates their live-call hauls over a run of calls.
const CALL_SKILL: Record<Strategy, number> = {
  punter: 0.6,
  sharp: 0.82,
  wildcard: 0.5,
};

function hashString(text: string): number {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

// Deterministic 0/1 answer: the bot's intended pick for the kind, flipped when
// its per-call skill roll slips. Seeded by the call key, so it never changes.
function botCallAnswer(strategy: Strategy, kind: CallKind, key: string): 0 | 1 {
  const intended =
    strategy === "punter" ? ACTION_INDEX[kind] : FAVOURED_INDEX[kind];
  const sticks =
    seededUnit(hashString(`${key}:${strategy}`)) < CALL_SKILL[strategy];

  return (sticks ? intended : 1 - intended) as 0 | 1;
}

// Grade every bot over the live calls the fan answered - the same set the fan
// was scored on - so the board stays a fair head-to-head at the call level too.
// Returns points per botId, to freeze onto the settlement.
export function gradeBotCalls(
  calls: SettleableCall[],
  answers: Record<string, GoalCallAnswer>,
): Record<string, number> {
  const points: Record<string, number> = {};

  for (const bot of BOTS) {
    points[bot.botId] = 0;
  }

  for (const call of calls) {
    if (
      !call.resolved ||
      call.voided ||
      call.correctIndex === undefined ||
      !answers[call.key]
    ) {
      continue;
    }

    const kind = callKind(call.key);

    for (const bot of BOTS) {
      if (botCallAnswer(bot.strategy, kind, call.key) === call.correctIndex) {
        points[bot.botId] += GOAL_CALL_POINTS;
      }
    }
  }

  return points;
}
