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

function toBracketMatch(game: LiveMatch): BracketMatch {
  const home = parseScore(game.home.score);
  const away = parseScore(game.away.score);
  const live = game.status === "live";

  return {
    away: {
      penalties: away.penalties,
      score: away.score,
      team: game.away.team,
    },
    // The card header shows the date line; a live match announces itself
    // there since the beui card only knows finished/upcoming.
    date: live
      ? `Live${game.liveMinute ? ` · ${game.liveMinute}'` : ""}`
      : game.date,
    home: {
      penalties: home.penalties,
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
