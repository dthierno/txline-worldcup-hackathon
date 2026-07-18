"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/../convex/_generated/api";
import { settlePrediction, type MatchOutcome } from "@/lib/prediction-engine";
import {
  botScorelinePoints,
  botStandings,
  gradeBotCalls,
} from "@/lib/prediction-bots";
import {
  GOAL_CALLS_CHANGED_EVENT,
  LEAGUES_CHANGED_EVENT,
  loadCachedFixtures,
  loadGoalCalls,
  loadPrediction,
  loadSelectedBoard,
  loadSettlements,
  saveSelectedBoard,
  settleGoalCallPoints,
  type GoalCallAnswer,
  type StoredSettlement,
} from "@/lib/prediction-store";
import type { SettleableCall } from "@/lib/txline-normalize";

type BoardRow = {
  bot: boolean;
  key: string;
  mine: boolean;
  name: string;
  points: number;
};

// The standings, dropped into the match overview so you can watch the table
// while the game plays. On the global board (you vs the prediction bots) the
// points tick up live: this match's live-call points are graded as calls
// resolve, and the scoreline lands at full time - for you and every bot alike.
// League boards show the synced standings (other members' live points aren't on
// this device). Board choice is the shared preference, in sync with home.
export function MatchLeaderboard({
  awayTeam,
  calls,
  fixtureId,
  homeTeam,
  live = false,
  outcome,
}: {
  awayTeam: string;
  calls: SettleableCall[];
  fixtureId: number;
  homeTeam: string;
  live?: boolean;
  // The same match outcome the slip settles against, so the board credits you
  // exactly what your "Points so far" ticket shows - markets included, not just
  // live calls.
  outcome: MatchOutcome | null;
}) {
  const myLeagues = useQuery(api.leagues.myLeagues) ?? [];
  const [board, setBoard] = useState("global");
  // Bumped whenever settlements might have changed, to re-read the device board.
  const [settleTick, setSettleTick] = useState(0);
  // This match's live-call answers, re-read the moment one is saved.
  const [answers, setAnswers] = useState<Record<string, GoalCallAnswer>>({});

  useEffect(() => {
    const refresh = () => {
      setBoard(loadSelectedBoard());
      setSettleTick((tick) => tick + 1);
    };
    const timer = setTimeout(refresh, 0);

    window.addEventListener(LEAGUES_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(LEAGUES_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const readAnswers = () => setAnswers(loadGoalCalls(fixtureId));
    const timer = setTimeout(readAnswers, 0);

    window.addEventListener(GOAL_CALLS_CHANGED_EVENT, readAnswers);
    window.addEventListener("storage", readAnswers);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(GOAL_CALLS_CHANGED_EVENT, readAnswers);
      window.removeEventListener("storage", readAnswers);
    };
  }, [fixtureId]);

  const selectedLeague = myLeagues.find((league) => league.code === board) ?? null;

  const leagueBoard = useQuery(
    api.leagues.leaderboard,
    selectedLeague ? { leagueId: selectedLeague.id } : "skip",
  );

  // Baseline: every settled match EXCEPT this one - this match is overlaid live
  // below, so it must not be double-counted from a stored settlement.
  const { botBase, youBase } = useMemo(() => {
    const finals = loadSettlements();
    const others: Record<string, StoredSettlement> = {};

    for (const [key, settlement] of Object.entries(finals)) {
      if (settlement.fixtureId !== fixtureId) {
        others[key] = settlement;
      }
    }

    return {
      botBase: botStandings(others, loadCachedFixtures()),
      youBase: Object.values(others).reduce(
        (total, settlement) => total + (settlement.totalPoints ?? 0),
        0,
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleTick, fixtureId]);

  // This match's provisional points, recomputed as calls resolve and answers
  // land: live-call points always, plus the scoreline once it's full time.
  const provisional = useMemo(() => {
    // Call points are graded only over the calls the fan answered, so bots
    // never score on calls the fan skipped. The scoreline (and any market that
    // has settled) counts once the fan has predicted this match - settled off
    // the very same outcome the slip uses, so the board matches the ticket.
    // Otherwise it stays a fair head-to-head: no one is scored on a match the
    // fan sat out.
    const botCall = gradeBotCalls(calls, answers);
    const userCall = settleGoalCallPoints(calls, answers);
    const prediction = loadPrediction(fixtureId);
    let botScore: Record<string, number> = {};
    let userScore = 0;

    if (prediction && outcome) {
      userScore = settlePrediction(prediction, outcome, {
        awayTeam,
        homeTeam,
      }).totalPoints;
      botScore = botScorelinePoints(fixtureId, homeTeam, awayTeam, outcome);
    }

    return { botCall, botScore, userCall, userScore };
  }, [answers, awayTeam, calls, fixtureId, homeTeam, outcome]);

  // On a league board only your own live points can be shown - friends' rows
  // move when their devices settle and sync. Overlay yours only while the match
  // is live; at full time it settles and syncs like any other, so no
  // double-count against your synced Convex total.
  const myLivePoints = live ? provisional.userCall + provisional.userScore : 0;

  const rows: BoardRow[] = selectedLeague
    ? (leagueBoard ?? [])
        .map((member) => ({
          bot: false,
          key: member.userId,
          mine: member.isMe,
          // Your own row reads "You" (like the global board) so you can spot it
          // even when a friend shares your display name.
          name: member.isMe ? "You" : member.name,
          points: member.points + (member.isMe ? myLivePoints : 0),
        }))
        .sort((left, right) => right.points - left.points)
    : [
        {
          bot: false,
          key: "you",
          mine: true,
          name: "You",
          points: youBase + provisional.userCall + provisional.userScore,
        },
        ...botBase.map((entry) => ({
          bot: true,
          key: entry.botId,
          mine: false,
          name: entry.name,
          points:
            entry.points +
            (provisional.botCall[entry.botId] ?? 0) +
            (provisional.botScore[entry.botId] ?? 0),
        })),
      ].sort((left, right) => right.points - left.points);

  return (
    <section aria-labelledby="board-heading" className="card mp2-overview-card">
      <div className="mp2-card-heading">
        <h2 id="board-heading">
          Leaderboard
          {live ? <span className="mp2-board-live">live</span> : null}
        </h2>
        <Link className="mp2-card-link" href="/">
          Full board <span aria-hidden>→</span>
        </Link>
      </div>

      {myLeagues.length > 0 ? (
        <div aria-label="Choose a leaderboard" className="pred-board-tabs">
          <button
            className={`lcx-filter${board === "global" ? " is-active" : ""}`}
            onClick={() => saveSelectedBoard("global")}
            type="button"
          >
            Global
          </button>
          {myLeagues.map((league) => (
            <button
              className={`lcx-filter${board === league.code ? " is-active" : ""}`}
              key={league.code}
              onClick={() => saveSelectedBoard(league.code)}
              type="button"
            >
              {league.name}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="pred-board">
        {rows.map((row, index) => (
          <li className={`pred-row${row.mine ? " pred-you" : ""}`} key={row.key}>
            <span className={`pred-rank${index === 0 ? " pred-rank-first" : ""}`}>
              {index + 1}
            </span>
            <span aria-hidden className="pred-avatar">
              {row.name[0]}
            </span>
            <span className="pred-player">
              {row.name}
              {row.bot ? (
                <em className="pred-sim" title="Prediction bot">
                  bot
                </em>
              ) : null}
            </span>
            <span className="pred-points">{row.points} pts</span>
          </li>
        ))}
      </ol>

      <p className="mp2-board-note">
        {selectedLeague
          ? live
            ? `${selectedLeague.name} · your points tick up live; friends' update as their matches settle.`
            : `${selectedLeague.name} · invite code ${selectedLeague.code}`
          : live
            ? "You against the prediction bots - points tick up as calls settle."
            : "You against the prediction bots. Create a league on the home page to battle friends."}
      </p>
    </section>
  );
}
