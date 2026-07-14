"use client";

import { useMemo } from "react";

import {
  KnockoutBracket,
  type Match as BracketMatch,
  type Round as BracketRound,
} from "@/components/motion/knockout-bracket";
import {
  buildLiveRounds,
  currentRoundIndex,
  ROUNDS as SEED_ROUNDS,
  type BracketScore,
  type Match as LiveMatch,
} from "@/components/skiper107";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";

// The live bracket data (docs seed + TxLINE results + in-play scores) keeps
// scores as display strings ("1 (3)" for shootouts); the beui bracket wants
// numbers with separate penalty counts.
function parseScore(raw: string | null): {
  penalties: number | null;
  score: number | null;
} {
  if (raw === null) {
    return { penalties: null, score: null };
  }

  const parsed = raw.match(/^(\d+)(?:\s*\((\d+)\))?$/);

  if (!parsed) {
    return { penalties: null, score: null };
  }

  return {
    penalties: parsed[2] ? Number(parsed[2]) : null,
    score: Number(parsed[1]),
  };
}

// The live fold overwrites the seeded "1 (3)" score strings with plain
// final scores (TxLINE results carry no shootout numbers), so shootout
// counts are recovered from the docs seed by match id.
const seedPenalties = new Map<
  string,
  { away: number | null; home: number | null }
>();

for (const round of SEED_ROUNDS) {
  for (const game of round.matches) {
    const home = parseScore(game.home.score);
    const away = parseScore(game.away.score);

    if (home.penalties !== null || away.penalties !== null) {
      seedPenalties.set(game.id, {
        away: away.penalties,
        home: home.penalties,
      });
    }
  }
}

function toBracketMatch(game: LiveMatch): BracketMatch {
  const home = parseScore(game.home.score);
  const away = parseScore(game.away.score);
  const seeded = seedPenalties.get(game.id);
  const live = game.status === "live";

  return {
    away: {
      penalties: away.penalties ?? seeded?.away ?? null,
      score: away.score,
      team: game.away.team,
    },
    // The card header shows the date line; a live match announces itself
    // there since the beui card only knows finished/upcoming.
    date: live
      ? `Live${game.liveMinute ? ` · ${game.liveMinute}'` : ""}`
      : game.date,
    home: {
      penalties: home.penalties ?? seeded?.home ?? null,
      score: home.score,
      team: game.home.team,
    },
    id: game.id,
    status: game.status === "finished" ? "finished" : "upcoming",
    winner: game.winner,
  };
}

export function KnockoutBracketLive({
  fixtures,
  now,
  scores,
}: {
  fixtures: WorldCupFixture[];
  now: number | null;
  scores: Record<number, BracketScore>;
}) {
  const liveRounds = useMemo(
    () => buildLiveRounds(fixtures, scores, now ?? 0),
    [fixtures, now, scores],
  );
  const rounds: BracketRound[] = useMemo(
    () =>
      liveRounds.map((round) => ({
        matches: round.matches.map(toBracketMatch),
        name: round.name,
      })),
    [liveRounds],
  );

  return (
    <KnockoutBracket
      initialRound={currentRoundIndex(liveRounds) + 1}
      rounds={rounds}
    />
  );
}
