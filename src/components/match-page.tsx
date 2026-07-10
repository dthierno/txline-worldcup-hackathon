"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  buildOutcome,
  countShotsOnTarget,
  countTeamEvents,
  fetchJson,
  fillUnknownStats,
  formatCompetition,
  formatDate,
  formatGameState,
  formatMinute,
  formatScore,
  formatUtcTime,
  getDisplayScore,
  getDisplayUpdates,
  isOddsUpdatesData,
  isPastFixture,
  isPotentiallyLive,
  isValidationData,
  mergeFixtures,
  safeParseJson,
  useIsMounted,
  useNow,
  type ApiResult,
  type GameDetails,
  type PlayerDirectory,
  type StreamStatus,
  type TxlineOddsData,
  type TxlineOddsUpdatesData,
  type TxlineScoreData,
  type TxlineUpdateData,
  type TxlineValidationData,
} from "@/lib/match-shared";
import {
  clampGoals,
  defaultPrediction,
  linePickLabel,
  PREDICTION_LINES,
  settlePrediction,
  type FirstScorerPick,
  type LinePick,
  type MatchOutcome,
  type MatchPrediction,
  type WinnerPick,
} from "@/lib/prediction-engine";
import {
  GOAL_CALL_POINTS,
  isPredictionLocked,
  loadGoalCalls,
  loadPrediction,
  loadSettlements,
  saveGoalCall,
  savePrediction,
  saveSettlement,
  type GoalCallAnswer,
} from "@/lib/prediction-store";
import {
  computePossessionSplit,
  extractGoalCalls,
  extractGoals,
  extractSubstitutionEvents,
  normalizeScoreSnapshot,
  withoutRaw,
  type GoalCallEvent,
  type GoalEvent,
  type NormalizedLineups,
  type SubstitutionEvent,
} from "@/lib/txline-normalize";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";

export function MatchPage({ fixtureId }: { fixtureId: number }) {
  const [fixtures, setFixtures] = useState<WorldCupFixture[]>(
    txlineWorldCupFixtures,
  );
  const [fixturesLoaded, setFixturesLoaded] = useState(false);
  const [details, setDetails] = useState<GameDetails>({
    fixtureValidation: null,
    historicalUpdates: null,
    lineups: null,
    odds: null,
    oddsUpdates: null,
    score: null,
    updates: null,
    validation: null,
  });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedFixtureRef = useRef<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [streamUpdates, setStreamUpdates] = useState<TxlineUpdateData[]>([]);
  const [liveOddsNote, setLiveOddsNote] = useState<string | null>(null);
  const now = useNow();

  // Resolve the fixture from the docs seed plus the live snapshot, so deep
  // links work for any TxLINE fixture id.
  useEffect(() => {
    let cancelled = false;

    async function loadFixtures() {
      const fixturesResult = await fetchJson<WorldCupFixture[]>(
        "/api/txline/fixtures",
      );

      if (cancelled) {
        return;
      }

      const liveFixtures = Array.isArray(fixturesResult.data)
        ? fixturesResult.data
        : [];

      setFixtures(
        mergeFixtures(txlineWorldCupFixtures, liveFixtures, {
          worldCupOnly: false,
        }),
      );
      setFixturesLoaded(true);
    }

    void loadFixtures();

    return () => {
      cancelled = true;
    };
  }, []);

  const fixture =
    fixtures.find((candidate) => candidate.fixtureId === fixtureId) ?? null;

  useEffect(() => {
    if (!Number.isFinite(fixtureId)) {
      return;
    }

    let cancelled = false;
    // Re-fetches for the same fixture (live polling) keep the current data on
    // screen instead of flashing back to the loading state.
    const isRefresh = loadedFixtureRef.current === fixtureId;

    async function loadDetails() {
      if (!isRefresh) {
        setDetailsLoading(true);
        setDetails({
          fixtureValidation: null,
          historicalUpdates: null,
          lineups: null,
          odds: null,
          oddsUpdates: null,
          score: null,
          updates: null,
          validation: null,
        });
      }

      const [
        score,
        updates,
        historicalUpdates,
        odds,
        oddsUpdates,
        validation,
        lineups,
        fixtureValidation,
      ] = await Promise.all([
        fetchJson<TxlineScoreData>(`/api/txline/scores/${fixtureId}`),
        fetchJson<TxlineUpdateData[]>(
          `/api/txline/scores/${fixtureId}/updates`,
        ),
        fetchJson<TxlineUpdateData[]>(
          `/api/txline/scores/${fixtureId}/historical`,
        ),
        fetchJson<TxlineOddsData>(`/api/txline/odds/${fixtureId}`),
        fetchJson<TxlineOddsUpdatesData>(
          `/api/txline/odds/${fixtureId}/updates`,
        ),
        fetchJson<TxlineValidationData>(
          `/api/txline/scores/${fixtureId}/validation`,
        ),
        fetchJson<NormalizedLineups>(
          `/api/txline/scores/${fixtureId}/lineups`,
        ),
        fetchJson<unknown>("/api/txline/fixtures/validation"),
      ]);

      if (!cancelled) {
        setDetails({
          fixtureValidation,
          historicalUpdates,
          lineups,
          odds,
          oddsUpdates,
          score,
          updates,
          validation,
        });
        setDetailsLoading(false);
        loadedFixtureRef.current = fixtureId;
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [fixtureId, refreshTick]);

  // TxLINE devnet never flips GameState to finished; the authoritative end of
  // a match is the game_finalised record on the score feed.
  const feedFinished = useMemo(() => {
    const baseUpdates = details.historicalUpdates?.data?.length
      ? details.historicalUpdates.data
      : details.updates?.data ?? [];

    return [...baseUpdates, ...streamUpdates].some(
      (update) => update.action === "game_finalised",
    );
  }, [details.historicalUpdates, details.updates, streamUpdates]);
  const liveStreamEligible = Boolean(
    fixture &&
      now !== null &&
      isPotentiallyLive(fixture, now) &&
      !feedFinished,
  );

  // Polling fallback while live: refresh the snapshot data every 60s so the
  // page converges even if the stream misses records (and picks up the
  // game_finalised state without a manual reload).
  useEffect(() => {
    if (!liveStreamEligible) {
      return;
    }

    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), 60_000);

    return () => clearInterval(timer);
  }, [liveStreamEligible, fixtureId]);

  // Live TxLINE streams: only opened while the fixture is inside its live
  // window. Snapshot/replay loading above stays as the fallback.
  useEffect(() => {
    if (!liveStreamEligible || typeof EventSource === "undefined") {
      return;
    }

    const scoreStream = new EventSource("/api/txline/scores/stream");
    const oddsStream = new EventSource("/api/txline/odds/stream");

    scoreStream.onopen = () => setStreamStatus("connected");
    scoreStream.onerror = () => setStreamStatus("unavailable");
    scoreStream.onmessage = (event) => {
      const record = safeParseJson(event.data);

      if (!record || record.FixtureId !== fixtureId) {
        return;
      }

      const normalized = withoutRaw(normalizeScoreSnapshot(record));
      const stats = record.Stats;
      const statsKnown = Boolean(
        stats && typeof stats === "object" && Object.keys(stats).length > 0,
      );

      setStreamUpdates((previous) => {
        if (
          typeof normalized.seq === "number" &&
          previous.some((update) => update.seq === normalized.seq)
        ) {
          return previous;
        }

        return [
          ...previous,
          {
            ...normalized,
            id: `stream-${normalized.seq ?? previous.length}`,
            statsKnown,
          },
        ];
      });
    };

    oddsStream.onmessage = (event) => {
      const record = safeParseJson(event.data);

      if (
        !record ||
        record.FixtureId !== fixtureId ||
        record.SuperOddsType !== "1X2_PARTICIPANT_RESULT" ||
        record.MarketParameters ||
        record.MarketPeriod
      ) {
        return;
      }

      const pct = Array.isArray(record.Pct) ? record.Pct.map(Number) : [];

      if (pct.length >= 3 && pct.every(Number.isFinite)) {
        setLiveOddsNote(
          `TxLINE 1X2: ${pct[0].toFixed(1)}% / ${pct[1].toFixed(1)}% / ${pct[2].toFixed(1)}%`,
        );
      }
    };

    return () => {
      scoreStream.close();
      oddsStream.close();
      setStreamUpdates([]);
      setLiveOddsNote(null);
      setStreamStatus("idle");
    };
  }, [fixtureId, liveStreamEligible]);

  if (!fixture) {
    return (
      <main>
        <Link className="back-link" href="/">
          Back to games
        </Link>
        <h1>Match</h1>
        <p>
          {fixturesLoaded
            ? `No TxLINE fixture found for id ${fixtureId}.`
            : "Loading fixture..."}
        </p>
      </main>
    );
  }

  const replayUpdates = details.historicalUpdates?.data?.length
    ? details.historicalUpdates
    : details.updates;
  const combinedUpdates = fillUnknownStats([
    ...(replayUpdates?.data ?? []),
    ...streamUpdates,
  ]);
  const displayScore = getDisplayScore(details.score?.data, combinedUpdates);
  const scoreSource = replayUpdates?.data?.length
    ? `${details.score?.source ?? "TxLINE scores snapshot API"} + ${
        replayUpdates.source ?? "TxLINE scores updates API"
      }`
    : details.score?.source ?? details.score?.error ?? "Pending";
  // TxLINE can keep GameState at "scheduled" after kickoff; a running clock
  // or confirmed kickoff on the live stream is the stronger signal.
  const streamIndicatesLive = streamUpdates.some(
    (update) => update.action === "kickoff" || (update.clockSeconds ?? 0) > 0,
  );
  const formattedState = formatGameState(displayScore?.gameState);
  const displayState =
    feedFinished ||
    (isPastFixture(fixture) && !liveStreamEligible && displayScore)
      ? "Finished"
      : streamIndicatesLive && formattedState === "Not started"
        ? "Live"
        : formattedState;
  const finished = displayState === "Finished";
  const goals = extractGoals(combinedUpdates);
  const firstGoal = goals[0] ?? null;
  const lineupPlayers =
    details.lineups?.data?.teams.flatMap((team) => team.players) ?? [];
  const playerDirectory: PlayerDirectory = new Map(
    (details.lineups?.data?.teams ?? []).flatMap((team) =>
      team.players
        .filter((player) => typeof player.playerId === "number")
        .map((player) => [
          player.playerId as number,
          { name: player.name, teamName: team.teamName },
        ]),
    ),
  );
  const substitutions = extractSubstitutionEvents(combinedUpdates);
  const goalCalls = extractGoalCalls(combinedUpdates);
  const outcome = buildOutcome(
    displayScore,
    finished,
    firstGoal
      ? {
          playerId: firstGoal.playerId,
          scorerName: lineupPlayers.find(
            (player) => player.playerId === firstGoal.playerId,
          )?.name,
        }
      : null,
  );
  const possessionSplit = computePossessionSplit(combinedUpdates);
  const participant1IsHome = displayScore?.participant1IsHome !== false;
  const possessionHomePct = possessionSplit
    ? participant1IsHome
      ? possessionSplit.team1Pct
      : possessionSplit.team2Pct
    : null;
  const freeKicks = countTeamEvents(combinedUpdates, "free_kick");
  const shots = countTeamEvents(combinedUpdates, "shot");
  const shotsOnTarget = countShotsOnTarget(combinedUpdates);
  const statRows: Array<{ away: number; home: number; label: string }> = [
    ...(shots.home + shots.away > 0
      ? [
          { away: shots.away, home: shots.home, label: "Total shots" },
          {
            away: shotsOnTarget.away,
            home: shotsOnTarget.home,
            label: "Shots on target",
          },
        ]
      : []),
    ...(displayScore
      ? [
          {
            away: displayScore.awayCorners,
            home: displayScore.homeCorners,
            label: "Corners",
          },
          {
            away: displayScore.awayYellowCards,
            home: displayScore.homeYellowCards,
            label: "Yellow cards",
          },
          {
            away: displayScore.awayRedCards,
            home: displayScore.homeRedCards,
            label: "Red cards",
          },
        ]
      : []),
    ...(freeKicks.home + freeKicks.away > 0
      ? [
          {
            away: freeKicks.home,
            home: freeKicks.away,
            label: "Fouls conceded",
          },
        ]
      : []),
  ];

  return (
    <main>
      <Button nativeButton={false} render={<Link href="/" />} variant="outline">
        Back to games
      </Button>

      <header className="match-header card">
        <p className="match-meta">{formatCompetition(fixture)}</p>
        <h1>
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h1>
        {displayScore ? (
          <p className="match-score">{formatScore(displayScore)}</p>
        ) : (
          <p className="match-meta">{formatScore(displayScore)}</p>
        )}
        {goals.length ? (
          <div>
            {goals.map((goal) => (
              <p className="match-meta" key={goal.seq}>
                ⚽ {formatMinute(goal.clockSeconds) || "—"}{" "}
                {(goal.playerId !== undefined
                  ? playerDirectory.get(goal.playerId)?.name
                  : undefined) ??
                  (goal.scoringSide === "home"
                    ? fixture.homeTeam
                    : fixture.awayTeam)}{" "}
                ({goal.homeGoals}-{goal.awayGoals})
              </p>
            ))}
          </div>
        ) : null}
        <p>
          <span className={`badge${liveStreamEligible ? " live" : ""}`}>
            {displayState}
          </span>
        </p>
        <p className="match-meta">
          Kickoff {formatDate(fixture.kickoffUtc)} UTC - Fixture #
          {fixture.fixtureId}
        </p>
        {detailsLoading ? (
          <p className="match-meta">Loading TxLINE details...</p>
        ) : null}
        {liveStreamEligible ? (
          <p className="match-meta">
            Live stream:{" "}
            {streamStatus === "connected"
              ? `connected - ${streamUpdates.length} live record(s) for this fixture so far`
              : streamStatus === "unavailable"
                ? "stream unavailable, showing snapshot and replay data"
                : "connecting to TxLINE score stream..."}
          </p>
        ) : null}
        <p className="match-meta">Score source: {scoreSource}</p>
        {replayUpdates?.data?.length ? (
          <p className="match-meta">
            Displayed score uses the latest TxLINE update when it is newer than
            the snapshot.
          </p>
        ) : null}
      </header>

      <section className="card" aria-labelledby="stats-heading">
        <h2 id="stats-heading">Stats</h2>
        <div className="stat-teams" aria-hidden="true">
          <span>{fixture.homeTeam}</span>
          <span>{fixture.awayTeam}</span>
        </div>
        {possessionHomePct !== null ? (
          <>
            <p className="stat-title">Possession (ball in play)</p>
            <div
              className="possession-duo"
              role="img"
              aria-label={`Possession: ${fixture.homeTeam} ${possessionHomePct}%, ${fixture.awayTeam} ${100 - possessionHomePct}%`}
            >
              <div
                className="possession-duo-home"
                style={{ width: `${Math.min(Math.max(possessionHomePct, 10), 90)}%` }}
              >
                <span>{possessionHomePct}%</span>
              </div>
              <div className="possession-duo-away">
                <span>{100 - possessionHomePct}%</span>
              </div>
            </div>
          </>
        ) : null}
        {statRows.length ? (
          <div className="stat-rows">
            {statRows.map((row) => (
              <div className="stat-row" key={row.label}>
                <span
                  className={`stat-pill${row.home >= row.away ? "" : " trailing"}`}
                >
                  {row.home}
                </span>
                <span className="stat-label">{row.label}</span>
                <span
                  className={`stat-pill away${row.away >= row.home ? "" : " trailing"}`}
                >
                  {row.away}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>No stats available.</p>
        )}
        {possessionHomePct !== null || freeKicks.home + freeKicks.away > 0 ? (
          <p className="muted">
            Possession is ball-in-play time from TxLINE possession-phase
            events; fouls are free kicks conceded to the opponent.
          </p>
        ) : null}
      </section>

      <LineupsSection
        goals={goals}
        lineups={details.lineups}
        substitutions={substitutions}
      />

      <PredictionSection
        key={fixture.fixtureId}
        fixture={fixture}
        lineups={details.lineups?.data ?? null}
        now={now}
        odds1x2={
          details.odds?.data?.homeWinProbability &&
          details.odds.data.drawProbability &&
          details.odds.data.awayWinProbability
            ? {
                away: 100 / details.odds.data.awayWinProbability,
                draw: 100 / details.odds.data.drawProbability,
                home: 100 / details.odds.data.homeWinProbability,
              }
            : null
        }
        outcome={outcome}
      />

      <GoalCallsSection
        key={`calls-${fixture.fixtureId}`}
        calls={goalCalls}
        fixture={fixture}
        live={liveStreamEligible}
      />

      <section className="card" aria-labelledby="odds-heading">
        <h2 id="odds-heading">Odds</h2>
        <p>{details.odds?.data?.marketNote ?? "No odds snapshot available."}</p>
        <p className="muted">
          Source: {details.odds?.source ?? details.odds?.error ?? "Pending"}
        </p>
        {liveOddsNote ? <p>Live from odds stream: {liveOddsNote}</p> : null}
        {isOddsUpdatesData(details.oddsUpdates?.data) ? (
          <p>
            Live odds updates: {details.oddsUpdates.data.count} update records
            {details.oddsUpdates.data.marketTypes.length
              ? ` across ${details.oddsUpdates.data.marketTypes.length} market type(s)`
              : ""}
            .
          </p>
        ) : null}
        <OddsMovement oddsUpdates={details.oddsUpdates} />
      </section>

      <UpdatesSection
        fixture={fixture}
        players={playerDirectory}
        updates={
          replayUpdates
            ? { ...replayUpdates, data: combinedUpdates }
            : streamUpdates.length
              ? { data: combinedUpdates, source: "TxLINE live score stream" }
              : replayUpdates
        }
      />
      <VerificationSection
        displayScore={displayScore}
        finished={finished}
        fixture={fixture}
        fixtureValidation={details.fixtureValidation}
        historicalUpdates={details.historicalUpdates}
        oddsUpdates={details.oddsUpdates}
        updates={details.updates}
        validation={details.validation}
      />
    </main>
  );
}

function GoalCallsSection({
  calls,
  fixture,
  live,
}: {
  calls: GoalCallEvent[];
  fixture: WorldCupFixture;
  live: boolean;
}) {
  const mounted = useIsMounted();
  const [answers, setAnswers] = useState<Record<string, GoalCallAnswer>>(() =>
    loadGoalCalls(fixture.fixtureId),
  );

  if (calls.length === 0) {
    return null;
  }

  const teamName = (participant?: number) =>
    participant === 1
      ? fixture.homeTeam
      : participant === 2
        ? fixture.awayTeam
        : undefined;
  const openCall = live
    ? [...calls].reverse().find((call) => !call.resolved)
    : undefined;
  const points = calls.reduce((total, call) => {
    const answer = answers[call.key];

    if (!call.resolved || !answer) {
      return total;
    }

    const correct =
      (answer.answer === "goal") === call.stood;

    return total + (correct ? GOAL_CALL_POINTS : 0);
  }, 0);

  function answer(callKey: string, pick: "goal" | "no_goal") {
    const record: GoalCallAnswer = {
      answer: pick,
      answeredAt: new Date().toISOString(),
    };

    saveGoalCall(fixture.fixtureId, callKey, record);
    setAnswers((previous) => ({ ...previous, [callKey]: record }));
  }

  return (
    <section className="card" aria-labelledby="goal-calls-heading">
      <h2 id="goal-calls-heading">Goal calls</h2>
      {openCall && mounted && !answers[openCall.key] ? (
        <div className="call-prompt">
          <p>
            Close play{teamName(openCall.participant) ? ` for ${teamName(openCall.participant)}` : ""}
            {" "}- does it end in a goal?
          </p>
          <div className="call-actions">
            <Button onClick={() => answer(openCall.key, "goal")}>Goal</Button>
            <Button
              onClick={() => answer(openCall.key, "no_goal")}
              variant="outline"
            >
              No goal
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="call-list">
        {[...calls].reverse().map((call) => {
          const callAnswer = mounted ? answers[call.key] : undefined;
          const correct =
            call.resolved && callAnswer
              ? (callAnswer.answer === "goal") === call.stood
              : null;

          return (
            <li key={call.key}>
              <span>
                {formatMinute(call.clockSeconds) || "—"} Possible goal
                {teamName(call.participant) ? ` (${teamName(call.participant)})` : ""}
              </span>
              <span className="call-outcome">
                {!call.resolved
                  ? "Open"
                  : call.stood
                    ? "⚽ Goal"
                    : "No goal"}
                {callAnswer
                  ? correct === null
                    ? ` · you said ${callAnswer.answer === "goal" ? "goal" : "no goal"}`
                    : correct
                      ? ` · ✓ +${GOAL_CALL_POINTS}`
                      : " · ✗ 0"
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        Live micro-calls on TxLINE &quot;possible goal&quot; moments, settled
        seconds later by the verified feed. {mounted && points > 0 ? `You earned ${points} point(s) here.` : ""}
      </p>
    </section>
  );
}

function LineupsSection({
  goals,
  lineups,
  substitutions,
}: {
  goals: GoalEvent[];
  lineups: ApiResult<NormalizedLineups> | null;
  substitutions: SubstitutionEvent[];
}) {
  const teams = lineups?.data?.teams;
  const goalCounts = new Map<number, number>();

  for (const goal of goals) {
    if (goal.playerId !== undefined) {
      goalCounts.set(goal.playerId, (goalCounts.get(goal.playerId) ?? 0) + 1);
    }
  }

  const subOnMinutes = new Map<number, string>();
  const subOffMinutes = new Map<number, string>();

  for (const substitution of substitutions) {
    const minute = formatMinute(substitution.clockSeconds);

    if (substitution.playerInId !== undefined) {
      subOnMinutes.set(substitution.playerInId, minute);
    }

    if (substitution.playerOutId !== undefined) {
      subOffMinutes.set(substitution.playerOutId, minute);
    }
  }

  const renderPlayer = (player: NormalizedLineups["teams"][number]["players"][number]) => (
    <li key={`${player.playerId}-${player.name}`}>
      {player.number ? `#${player.number} ` : ""}
      {player.name}
      {typeof player.playerId === "number" && goalCounts.has(player.playerId)
        ? ` ${"⚽".repeat(goalCounts.get(player.playerId) ?? 1)}`
        : ""}
      {typeof player.playerId === "number" &&
      subOffMinutes.has(player.playerId) ? (
        <span className="sub-off">
          {" "}
          ▼ {subOffMinutes.get(player.playerId) || "sub"}
        </span>
      ) : null}
      {typeof player.playerId === "number" &&
      subOnMinutes.has(player.playerId) ? (
        <span className="sub-on">
          {" "}
          ▲ {subOnMinutes.get(player.playerId) || "sub"}
        </span>
      ) : null}
    </li>
  );

  return (
    <section className="card" aria-labelledby="lineups-heading">
      <h2 id="lineups-heading">Lineups</h2>
      {teams?.length ? (
        <>
          <div className="lineups-grid">
            {teams.map((team) => {
              const teamPlayerIds = new Set(
                team.players
                  .map((player) => player.playerId)
                  .filter((id): id is number => typeof id === "number"),
              );
              const teamSubs = substitutions
                .filter(
                  (substitution) =>
                    (substitution.playerInId !== undefined &&
                      teamPlayerIds.has(substitution.playerInId)) ||
                    (substitution.playerOutId !== undefined &&
                      teamPlayerIds.has(substitution.playerOutId)),
                )
                .sort(
                  (left, right) =>
                    (left.clockSeconds ?? 0) - (right.clockSeconds ?? 0),
                );
              const playerName = (id?: number) =>
                team.players.find((player) => player.playerId === id)?.name ??
                (id !== undefined ? `player ${id}` : "unknown");

              return (
                <div key={team.teamName}>
                  <h3>{team.teamName}</h3>
                  <ul className="lineup-list">
                    {team.players.filter((player) => player.starter).map(renderPlayer)}
                  </ul>
                  {teamSubs.length ? (
                    <>
                      <h4 className="sub-heading">Substitutions</h4>
                      <ul className="lineup-list sub-list">
                        {teamSubs.map((substitution, index) => (
                          <li
                            key={`${substitution.playerInId}-${substitution.playerOutId}-${index}`}
                          >
                            {formatMinute(substitution.clockSeconds) || "—"}{" "}
                            <span className="sub-on">
                              ▲ {playerName(substitution.playerInId)}
                            </span>{" "}
                            <span className="sub-off">
                              ▼ {playerName(substitution.playerOutId)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {team.players.some((player) => !player.starter) ? (
                    <details>
                      <summary>Bench</summary>
                      <ul className="lineup-list">
                        {team.players
                          .filter((player) => !player.starter)
                          .map(renderPlayer)}
                      </ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="muted">
            Source: {lineups?.source ?? "TxLINE score feed lineups records"}. ⚽
            marks goalscorers (one per goal). Substitutions are merged from
            TxLINE substitution events; TxLINE does not always attach players to
            every substitution, and provides no assist data.
          </p>
        </>
      ) : (
        <p className="muted">
          No lineups from TxLINE yet:{" "}
          {lineups?.error ?? lineups?.source ?? "pending"}.
        </p>
      )}
    </section>
  );
}

function PredictionSection({
  fixture,
  lineups,
  now,
  odds1x2,
  outcome,
}: {
  fixture: WorldCupFixture;
  lineups: NormalizedLineups | null;
  now: number | null;
  odds1x2: { away: number; draw: number; home: number } | null;
  outcome: MatchOutcome | null;
}) {
  // The section is keyed by fixtureId, so lazy initializers re-read
  // localStorage whenever the selected fixture changes.
  const mounted = useIsMounted();
  const [saved, setSaved] = useState<MatchPrediction | null>(() =>
    loadPrediction(fixture.fixtureId),
  );
  const [draft, setDraft] = useState<MatchPrediction>(
    () => loadPrediction(fixture.fixtureId) ?? defaultPrediction(fixture.fixtureId),
  );
  const [confirmation, setConfirmation] = useState("");

  const settlement =
    saved && outcome
      ? settlePrediction(saved, outcome, fixture)
      : null;

  // Persist the settled result so the home screen leaderboard can show points
  // without refetching every fixture's replay.
  useEffect(() => {
    if (!settlement?.final || !outcome) {
      return;
    }

    const finalScore = `${outcome.homeGoals}-${outcome.awayGoals}`;
    const existing = loadSettlements()[String(fixture.fixtureId)];

    if (
      existing &&
      existing.finalScore === finalScore &&
      existing.totalPoints === settlement.totalPoints
    ) {
      return;
    }

    saveSettlement({
      finalScore,
      fixtureId: fixture.fixtureId,
      settledAt: new Date().toISOString(),
      totalPoints: settlement.totalPoints,
    });
  }, [fixture.fixtureId, outcome, settlement]);

  if (!mounted || now === null) {
    return (
      <section className="card" aria-labelledby="prediction-heading">
        <h2 id="prediction-heading">Your prediction</h2>
        <p>Loading prediction...</p>
      </section>
    );
  }

  const locked = isPredictionLocked(fixture, now);

  if (!locked) {
    return (
      <section className="card" aria-labelledby="prediction-heading">
        <h2 id="prediction-heading">Your prediction</h2>
        <p>
          Locks at kickoff: {formatDate(fixture.kickoffUtc)} UTC. Stored in this
          browser only.
        </p>
        <form
          className="prediction-form"
          onSubmit={(event) => {
            event.preventDefault();

            const prediction: MatchPrediction = {
              ...draft,
              fixtureId: fixture.fixtureId,
              // Lock the current TxLINE 1X2 odds into the prediction; the
              // winner market settles scaled by these.
              oddsAtSave: odds1x2
                ? {
                    away: Number(odds1x2.away.toFixed(2)),
                    draw: Number(odds1x2.draw.toFixed(2)),
                    home: Number(odds1x2.home.toFixed(2)),
                  }
                : null,
              savedAt: new Date().toISOString(),
            };

            savePrediction(prediction);
            setSaved(prediction);
            setConfirmation(
              "Prediction saved on this device. You can edit it until kickoff.",
            );
          }}
        >
          <div className="form-row">
            <label>
              {fixture.homeTeam} goals{" "}
              <input
                type="number"
                min={0}
                max={12}
                value={draft.homeGoals}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    homeGoals: clampGoals(event.target.valueAsNumber),
                  })
                }
              />
            </label>
            <label>
              {fixture.awayTeam} goals{" "}
              <input
                type="number"
                min={0}
                max={12}
                value={draft.awayGoals}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    awayGoals: clampGoals(event.target.valueAsNumber),
                  })
                }
              />
            </label>
          </div>
          <label>
            Winner{" "}
            <select
              value={draft.winner}
              onChange={(event) =>
                setDraft({ ...draft, winner: event.target.value as WinnerPick })
              }
            >
              <option value="home">{fixture.homeTeam}</option>
              <option value="draw">Draw</option>
              <option value="away">{fixture.awayTeam}</option>
            </select>
          </label>
          <LinePickSelect
            label={`Total goals (line ${PREDICTION_LINES.goals})`}
            line={PREDICTION_LINES.goals}
            value={draft.totalGoals}
            onChange={(pick) => setDraft({ ...draft, totalGoals: pick })}
          />
          <LinePickSelect
            label={`Total corners (line ${PREDICTION_LINES.corners})`}
            line={PREDICTION_LINES.corners}
            value={draft.totalCorners}
            onChange={(pick) => setDraft({ ...draft, totalCorners: pick })}
          />
          <LinePickSelect
            label={`Total cards (line ${PREDICTION_LINES.cards})`}
            line={PREDICTION_LINES.cards}
            value={draft.totalCards}
            onChange={(pick) => setDraft({ ...draft, totalCards: pick })}
          />
          {lineups?.teams.length ? (
            <label>
              First scorer{" "}
              <select
                value={
                  draft.firstScorer === "none"
                    ? "none"
                    : draft.firstScorer?.playerId ?? ""
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    firstScorer: parseFirstScorerPick(
                      event.target.value,
                      lineups,
                    ),
                  })
                }
              >
                <option value="">No pick</option>
                <option value="none">No goal scorer</option>
                {lineups.teams.map((team) => (
                  <optgroup key={team.teamName} label={team.teamName}>
                    {team.players
                      .filter((player) => typeof player.playerId === "number")
                      .map((player) => (
                        <option key={player.playerId} value={player.playerId}>
                          {player.name}
                          {player.starter ? "" : " (bench)"}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted">
              First scorer picks unavailable: TxLINE has not published a player
              list for this fixture yet.
            </p>
          )}
          <Button type="submit">Save prediction</Button>
        </form>
        {confirmation ? <p>{confirmation}</p> : null}
      </section>
    );
  }

  if (!saved) {
    return (
      <section className="card" aria-labelledby="prediction-heading">
        <h2 id="prediction-heading">Your prediction</h2>
        <p>
          Predictions locked at kickoff ({formatDate(fixture.kickoffUtc)} UTC).
          No prediction was saved for this match.
        </p>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="prediction-heading">
      <h2 id="prediction-heading">Your prediction</h2>
      <p>
        Locked at kickoff ({formatDate(fixture.kickoffUtc)} UTC). Saved{" "}
        {saved.savedAt ? formatDate(saved.savedAt) : "before kickoff"} UTC.
      </p>
      {settlement ? (
        <>
          <h3>
            {settlement.final
              ? "Final settlement"
              : "Provisional settlement (match not finished)"}
          </h3>
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Your pick</th>
                <th>Result</th>
                <th>Status</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {settlement.markets.map((market) => (
                <tr key={market.market}>
                  <td>{market.market}</td>
                  <td>{market.pick}</td>
                  <td>{market.result}</td>
                  <td className={`status-${market.status}`}>{market.status}</td>
                  <td>{market.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Total: {settlement.totalPoints} point(s)
            {settlement.final ? "" : " so far"}. Settled deterministically from
            the TxLINE score data shown above.
          </p>
        </>
      ) : (
        <p>
          Waiting for TxLINE score data to settle this prediction.
        </p>
      )}
    </section>
  );
}

function parseFirstScorerPick(
  value: string,
  lineups: NormalizedLineups,
): FirstScorerPick | null {
  if (value === "") {
    return null;
  }

  if (value === "none") {
    return "none";
  }

  const playerId = Number(value);
  const player = lineups.teams
    .flatMap((team) => team.players)
    .find((candidate) => candidate.playerId === playerId);

  return player && typeof player.playerId === "number"
    ? { name: player.name, playerId: player.playerId }
    : null;
}

function LinePickSelect({
  label,
  line,
  onChange,
  value,
}: {
  label: string;
  line: number;
  onChange: (pick: LinePick) => void;
  value: LinePick;
}) {
  return (
    <label>
      {label}{" "}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LinePick)}
      >
        <option value="over">{linePickLabel("over", line)}</option>
        <option value="under">{linePickLabel("under", line)}</option>
      </select>
    </label>
  );
}

function OddsMovement({
  oddsUpdates,
}: {
  oddsUpdates: ApiResult<TxlineOddsUpdatesData> | null;
}) {
  const series = oddsUpdates?.data?.series;

  if (!series?.length) {
    return null;
  }

  const recent = series.slice(-12);

  return (
    <details>
      <summary>
        Odds movement (1X2): {series.length} meaningful change(s)
      </summary>
      <ol>
        {recent.map((point) => (
          <li key={point.ts}>
            {formatUtcTime(point.ts)} UTC - home {point.home.toFixed(1)}% / draw{" "}
            {point.draw.toFixed(1)}% / away {point.away.toFixed(1)}%
          </li>
        ))}
      </ol>
      <p>
        Compacted server-side from{" "}
        {oddsUpdates?.data?.count ?? "many"} raw TxLINE odds update records:
        full-match 1X2 points where any probability moved at least 0.5
        percentage points, capped to the last 30.
      </p>
    </details>
  );
}

function UpdatesSection({
  fixture,
  players,
  updates,
}: {
  fixture: WorldCupFixture;
  players?: PlayerDirectory;
  updates: ApiResult<TxlineUpdateData[]> | null;
}) {
  const displayUpdates = getDisplayUpdates(updates?.data, fixture, players);

  return (
    <section className="card" aria-labelledby="updates-heading">
      <h2 id="updates-heading">Updates</h2>
      {displayUpdates.length ? (
        <>
          <p className="muted">
            {displayUpdates.length} match event(s), newest first.
          </p>
          <div className="feed-scroll">
            <ol className="feed-list" reversed>
              <AnimatePresence initial={false}>
                {[...displayUpdates].reverse().map((update) => (
                  <motion.li
                    key={update.id}
                    animate={{ opacity: 1, y: 0 }}
                    initial={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.35 }}
                  >
                    {update.text}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </div>
        </>
      ) : (
        <p>
          No readable match events yet. TxLINE may still have raw feed records
          below.
        </p>
      )}
      <p className="muted">
        Source: {updates?.source ?? updates?.error ?? "Pending"}
      </p>
      {updates?.data?.length ? (
        <details>
          <summary>Raw TxLINE update count</summary>
          <p>{updates.data.length} raw update events received.</p>
        </details>
      ) : null}
    </section>
  );
}

function VerificationSection({
  displayScore,
  finished,
  fixture,
  fixtureValidation,
  historicalUpdates,
  oddsUpdates,
  updates,
  validation,
}: {
  displayScore: TxlineScoreData | null | undefined;
  finished: boolean;
  fixture: WorldCupFixture;
  fixtureValidation: ApiResult<unknown> | null;
  historicalUpdates: ApiResult<TxlineUpdateData[]> | null;
  oddsUpdates: ApiResult<TxlineOddsUpdatesData> | null;
  updates: ApiResult<TxlineUpdateData[]> | null;
  validation: ApiResult<TxlineValidationData> | null;
}) {
  const proof = isValidationData(validation?.data) ? validation.data : null;

  return (
    <section className="card" aria-labelledby="verification-heading">
      <h2 id="verification-heading">Verification</h2>
      {proof && displayScore ? (
        <>
          <p>
            <strong>
              <span className="verified-check">✓</span>{" "}
              {finished ? "Verified score" : "Verified score so far"}:{" "}
              {fixture.homeTeam} {displayScore.homeGoals} - {fixture.awayTeam}{" "}
              {displayScore.awayGoals}.
            </strong>
          </p>
          <p>
            TxLINE returned Merkle validation material for the goal stat key(s){" "}
            {proof.statKeys.join(", ")}
            {typeof proof.updateCount === "number"
              ? `, covering ${proof.updateCount} score update(s)`
              : ""}
            . This app displays that proof material as returned by TxLINE; it
            does not submit an on-chain transaction.
          </p>
          {proof.markets?.length ? (
            <ul className="muted">
              {proof.markets.map((market) => (
                <li key={market.market}>
                  ✓ {market.market}: Merkle proof returned (stat keys{" "}
                  {market.statKeys.join(", ")}, {market.proofNodes} node(s))
                </li>
              ))}
            </ul>
          ) : null}
          <details>
            <summary>Proof metadata</summary>
            <dl>
              <dt>Fixture</dt>
              <dd>{proof.fixtureId ?? fixture.fixtureId}</dd>
              <dt>Timestamp</dt>
              <dd>{proof.ts ?? "Unknown"}</dd>
              <dt>Subtree proof nodes</dt>
              <dd>{proof.subTreeProofCount}</dd>
              <dt>Main tree proof nodes</dt>
              <dd>{proof.mainTreeProofCount}</dd>
              <dt>Stat proof nodes</dt>
              <dd>{proof.statProofCount}</dd>
            </dl>
          </details>
        </>
      ) : (
        <p>
          Score verification material:{" "}
          {validation?.error ?? validation?.source ?? "Pending"}.
        </p>
      )}
      <details>
        <summary>TxLINE coverage</summary>
        <ul>
          <li>Fixtures snapshot: used on the home screen.</li>
          <li>
            Fixture batch validation:{" "}
            {fixtureValidation?.source ?? fixtureValidation?.error ?? "Pending"}.
          </li>
          <li>Score snapshot: used for the initial score and stats.</li>
          <li>
            Current score updates: {updates?.data?.length ?? 0} records. Source:{" "}
            {updates?.source ?? updates?.error ?? "Pending"}.
          </li>
          <li>
            Historical score replay: {historicalUpdates?.data?.length ?? 0}{" "}
            records. Source:{" "}
            {historicalUpdates?.source ?? historicalUpdates?.error ?? "Pending"}.
          </li>
          <li>Odds snapshot: used in the odds section above.</li>
          <li>
            Live odds updates:{" "}
            {isOddsUpdatesData(oddsUpdates?.data) ? oddsUpdates.data.count : 0}{" "}
            records. Source:{" "}
            {oddsUpdates?.source ?? oddsUpdates?.error ?? "Pending"}.
          </li>
          <li>
            Score stream proxy: <code>/api/txline/scores/stream</code>.
          </li>
          <li>
            Odds stream proxy: <code>/api/txline/odds/stream</code>.
          </li>
        </ul>
      </details>
    </section>
  );
}
