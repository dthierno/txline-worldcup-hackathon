"use client";

import { FootballIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { type CSSProperties, useMemo } from "react";

import { api } from "@/../convex/_generated/api";
import { PointsBadge } from "@/components/points-badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNow } from "@/lib/match-shared";
import type { MatchPrediction } from "@/lib/prediction-engine";
import { isPredictionLocked, loadCachedFixtures } from "@/lib/prediction-store";
import { teamFlag, teamGlow } from "@/lib/team-visuals";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";
import { worldCupResults } from "@/lib/world-cup-results";

// One of the player's matches, in the same card design as the homepage
// predictions: World Cup header, team flags/names either side, and the middle
// showing their pick, the final score and the points it scored.
function ProfileMatchCard({
  away,
  awayIso,
  finalScore,
  fixtureId,
  home,
  homeIso,
  locked,
  pickAway,
  pickHome,
  points,
}: {
  away: string;
  awayIso?: string;
  finalScore: string | null;
  fixtureId: number;
  home: string;
  homeIso?: string;
  locked: boolean;
  pickAway: number | null;
  pickHome: number | null;
  points: number | null;
}) {
  const glowHome = (homeIso && teamGlow[homeIso]) || "#3b3b44";
  const glowAway = (awayIso && teamGlow[awayIso]) || "#3b3b44";
  const ft = finalScore ? finalScore.split("-").map(Number) : null;
  const settled = ft !== null && ft.length === 2 && ft.every(Number.isFinite);
  const exactHit = settled && pickHome === ft![0] && pickAway === ft![1];
  const pickWinner =
    pickHome != null && pickAway != null
      ? pickHome > pickAway
        ? "h"
        : pickAway > pickHome
          ? "a"
          : "d"
      : null;
  const ftWinner = settled
    ? ft![0] > ft![1]
      ? "h"
      : ft![1] > ft![0]
        ? "a"
        : "d"
    : null;
  const winnerHit = settled && pickWinner !== null && pickWinner === ftWinner;

  const teamSide = (name: string, iso?: string) => (
    <Link className="pc-team" href={`/match/${fixtureId}`}>
      {iso ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="pc-flag" src={`https://flagcdn.com/w80/${iso}.png`} />
      ) : (
        <span aria-hidden className="pc-flag pc-flag-tbd" />
      )}
      <span className="pc-name">{name}</span>
    </Link>
  );

  return (
    <div
      className="pc-card"
      style={
        { "--glow-away": glowAway, "--glow-home": glowHome } as CSSProperties
      }
    >
      <div className="pc-head">
        <span aria-hidden className="pc-head-ic">
          <HugeiconsIcon className="pc-ball" icon={FootballIcon} strokeWidth={2} />
        </span>
        <span className="pc-comp">World Cup 2026</span>
      </div>
      <div className="pc-panel">
        <div className="pc-teams">
          {teamSide(home, homeIso)}

          {!locked ? (
            <div className="pc-scores">
              <span className="prof-card-hidden">Hidden until kickoff</span>
            </div>
          ) : settled ? (
            <div className="pc-scores pc-scores-ended">
              <span className="pc-livebox pc-box-home pc-final-box">
                {pickHome ?? "-"}
              </span>
              <PointsBadge muted={(points ?? 0) === 0} points={points ?? 0} />
              <span className="pc-livebox pc-box-away pc-final-box">
                {pickAway ?? "-"}
              </span>
              <span className="pc-ftline">
                <span className="pc-ft-tag">FT</span>
                <span className="pc-ft-score">{ft![0]}</span>
                <span className="pc-ft-dash">-</span>
                <span className="pc-ft-score">{ft![1]}</span>
              </span>
              {exactHit || winnerHit || (points ?? 0) > 0 ? (
                <span className="pc-why">
                  {exactHit
                    ? "Exact score!"
                    : winnerHit
                      ? "Right winner"
                      : "Good calls!"}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="pc-scores">
              <span className="pc-score-final">{pickHome ?? "-"}</span>
              <span className="pc-score-final">{pickAway ?? "-"}</span>
            </div>
          )}

          {teamSide(away, awayIso)}
        </div>
      </div>
    </div>
  );
}

// A league-mate's profile in a popup: their standing plus the picks they made,
// each in the homepage card design. Opens when `userId` is set; the server only
// returns picks to viewers who share a league, and each pick stays hidden until
// its match kicks off.
export function UserProfileDialog({
  onOpenChange,
  userId,
}: {
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}) {
  const now = useNow();
  const profile = useQuery(
    api.gameplay.userPredictions,
    userId ? { userId } : "skip",
  );

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

  const settlementBy = new Map(
    (profile?.settlements ?? []).map((settlement) => [
      settlement.fixtureId,
      settlement,
    ]),
  );
  const rows = profile
    ? profile.predictions
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
        })
    : [];

  return (
    <Dialog onOpenChange={onOpenChange} open={userId !== null}>
      <DialogContent className="lc-prompt prof-dialog">
        {profile ? (
          <>
            <header className="prof-head">
              <span aria-hidden className="prof-avatar">
                {profile.name[0]}
              </span>
              <div className="prof-id">
                <DialogTitle className="prof-name">{profile.name}</DialogTitle>
                <span className="prof-meta">
                  {profile.points} pts · {profile.predictions.length} prediction
                  {profile.predictions.length === 1 ? "" : "s"}
                </span>
              </div>
            </header>

            {rows.length ? (
              <div className="prof-cards">
                {rows.map(({ entry, fixture, settlement }) => {
                  const prediction = entry.prediction as MatchPrediction;
                  const home = fixture?.homeTeam ?? "Home";
                  const away = fixture?.awayTeam ?? "Away";

                  return (
                    <ProfileMatchCard
                      away={away}
                      awayIso={teamFlag(away)}
                      finalScore={settlement?.finalScore ?? null}
                      fixtureId={entry.fixtureId}
                      home={home}
                      homeIso={teamFlag(home)}
                      key={entry.fixtureId}
                      locked={
                        fixture !== null && now !== null
                          ? isPredictionLocked(fixture, now)
                          : false
                      }
                      pickAway={prediction.awayGoals}
                      pickHome={prediction.homeGoals}
                      points={settlement?.totalPoints ?? null}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="muted">No predictions yet.</p>
            )}
          </>
        ) : profile === null ? (
          <>
            <DialogTitle className="prof-name">Profile</DialogTitle>
            <p className="prof-locked">
              You can only see a player&apos;s picks if you share a league with
              them.
            </p>
          </>
        ) : (
          <>
            <DialogTitle className="sr-only">Loading profile</DialogTitle>
            <p className="muted">Loading…</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
