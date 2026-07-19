"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";

import { api } from "@/../convex/_generated/api";
import { useNow } from "@/lib/match-shared";
import type { MatchPrediction } from "@/lib/prediction-engine";
import { isPredictionLocked, loadCachedFixtures } from "@/lib/prediction-store";
import { teamFlag } from "@/lib/team-visuals";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";
import { worldCupResults } from "@/lib/world-cup-results";

function Flag({ team }: { team: string }) {
  const iso = teamFlag(team);

  return iso ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="prof-flag" src={`https://flagcdn.com/w40/${iso}.png`} />
  ) : (
    <span className="prof-flag prof-flag-tbd" />
  );
}

// A league-mate's profile: their standing plus the picks they made. Only shown
// to viewers the server authorised (same league); each pick stays hidden until
// its match kicks off, so nobody copies before the deadline.
export function UserProfile({ userId }: { userId: string }) {
  const profile = useQuery(api.gameplay.userPredictions, { userId });
  const now = useNow();

  const fixtureById = useMemo(() => {
    const map = new Map<number, WorldCupFixture>();

    for (const result of worldCupResults) {
      map.set(result.fixtureId, {
        awayTeam: result.away,
        fixtureGroup: "",
        fixtureId: result.fixtureId,
        homeTeam: result.home,
        kickoffUtc: result.kickoffUtc,
        stage: "",
      });
    }

    for (const fixture of txlineWorldCupFixtures) {
      map.set(fixture.fixtureId, fixture);
    }

    for (const fixture of loadCachedFixtures()) {
      map.set(fixture.fixtureId, fixture);
    }

    return map;
  }, []);

  if (profile === undefined) {
    return (
      <main className="prof">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="prof">
        <Link className="prof-back" href="/">
          ← Back
        </Link>
        <p className="prof-locked">
          You can only see a player&apos;s picks if you share a league with them.
          Sign in and join their league to view this profile.
        </p>
      </main>
    );
  }

  const settlementBy = new Map(
    profile.settlements.map((settlement) => [settlement.fixtureId, settlement]),
  );

  const rows = profile.predictions
    .map((entry) => ({
      entry,
      fixture: fixtureById.get(entry.fixtureId) ?? null,
      settlement: settlementBy.get(entry.fixtureId) ?? null,
    }))
    .sort((left, right) => {
      const leftKick = left.fixture
        ? new Date(left.fixture.kickoffUtc).getTime()
        : 0;
      const rightKick = right.fixture
        ? new Date(right.fixture.kickoffUtc).getTime()
        : 0;

      return rightKick - leftKick;
    });

  return (
    <main className="prof">
      <Link className="prof-back" href="/">
        ← Back
      </Link>

      <header className="prof-head">
        <span aria-hidden className="prof-avatar">
          {profile.name[0]}
        </span>
        <div className="prof-id">
          <h1 className="prof-name">{profile.name}</h1>
          <span className="prof-meta">
            {profile.points} pts · {profile.predictions.length} prediction
            {profile.predictions.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {rows.length ? (
        <ol className="prof-list">
          {rows.map(({ entry, fixture, settlement }) => {
            const prediction = entry.prediction as MatchPrediction;
            const locked =
              fixture !== null && now !== null
                ? isPredictionLocked(fixture, now)
                : false;
            const home = fixture?.homeTeam ?? "Home";
            const away = fixture?.awayTeam ?? "Away";
            const pick =
              prediction.homeGoals != null && prediction.awayGoals != null
                ? `${prediction.homeGoals}-${prediction.awayGoals}`
                : "—";

            return (
              <li className="prof-row" key={entry.fixtureId}>
                <Link className="prof-match" href={`/match/${entry.fixtureId}`}>
                  <span className="prof-team">
                    <Flag team={home} />
                    {home}
                  </span>
                  <span className="prof-vs">v</span>
                  <span className="prof-team prof-team-away">
                    {away}
                    <Flag team={away} />
                  </span>
                </Link>
                <div className="prof-pick">
                  {locked ? (
                    <>
                      <span className="prof-pick-chip">{pick}</span>
                      {settlement ? (
                        <span
                          className={`prof-pts${
                            settlement.totalPoints > 0 ? " prof-pts-won" : ""
                          }`}
                        >
                          FT {settlement.finalScore} · +{settlement.totalPoints}
                        </span>
                      ) : (
                        <span className="prof-pts">picked</span>
                      )}
                    </>
                  ) : (
                    <span className="prof-hidden">Hidden until kickoff</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">No predictions yet.</p>
      )}
    </main>
  );
}
