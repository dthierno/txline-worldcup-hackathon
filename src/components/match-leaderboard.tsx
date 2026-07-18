"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/../convex/_generated/api";
import { botStandings } from "@/lib/prediction-bots";
import {
  LEAGUES_CHANGED_EVENT,
  loadCachedFixtures,
  loadSelectedBoard,
  loadSettlements,
  saveSelectedBoard,
} from "@/lib/prediction-store";

type BoardRow = {
  bot: boolean;
  key: string;
  mine: boolean;
  name: string;
  points: number;
};

// The same standings the home board shows - the fan against the prediction bots
// on the global board, or the real members of a league - dropped into the match
// overview so you can watch the table while the game plays. Board choice is the
// shared localStorage preference, so it stays in sync with the home page.
export function MatchLeaderboard({ live = false }: { live?: boolean }) {
  const myLeagues = useQuery(api.leagues.myLeagues) ?? [];
  const [board, setBoard] = useState("global");
  // Bumped whenever settlements might have changed, to re-read the device board.
  const [settleTick, setSettleTick] = useState(0);

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

  const selectedLeague = myLeagues.find((league) => league.code === board) ?? null;

  const { botRows, settledPoints } = useMemo(() => {
    const finals = loadSettlements();

    return {
      botRows: botStandings(finals, loadCachedFixtures()),
      settledPoints: Object.values(finals).reduce(
        (total, settlement) => total + (settlement.totalPoints ?? 0),
        0,
      ),
    };
    // settleTick forces a re-read after a match settles or the tab refocuses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleTick]);

  const leagueBoard = useQuery(
    api.leagues.leaderboard,
    selectedLeague ? { leagueId: selectedLeague.id } : "skip",
  );

  const rows: BoardRow[] = selectedLeague
    ? (leagueBoard ?? []).map((member) => ({
        bot: false,
        key: member.userId,
        mine: member.isMe,
        name: member.name,
        points: member.points,
      }))
    : [
        { bot: false, key: "you", mine: true, name: "You", points: settledPoints },
        ...botRows.map((entry) => ({
          bot: true,
          key: entry.botId,
          mine: false,
          name: entry.name,
          points: entry.points,
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
          ? `${selectedLeague.name} · invite code ${selectedLeague.code}`
          : myLeagues.length > 0
            ? "Global board - you against the prediction bots. Pick a league to battle friends."
            : "You against the prediction bots. Create a league on the home page to battle friends."}
      </p>
    </section>
  );
}
