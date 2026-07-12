"use client";

import Link from "next/link";
import { FootballIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

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
  type TxlineOddsValidationData,
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
  settleGoalCallPoints,
  cacheFixtures,
  loadCachedFixtures,
  loadGoalCalls,
  loadPrediction,
  loadSettlements,
  removeSettlement,
  saveGoalCall,
  savePrediction,
  saveSettlement,
  type GoalCallAnswer,
} from "@/lib/prediction-store";
import {
  applyScoutCorrections,
  computePossessionSplit,
  deriveMatchClock,
  extractAddedTimeCalls,
  extractCornerCalls,
  extractGoalCalls,
  extractGoals,
  extractMatchInfo,
  extractMomentum,
  extractPenaltyEvents,
  extractSettleableCalls,
  extractSubstitutionEvents,
  formatLiveMinute,
  formatMatchPhase,
  normalizeScoreSnapshot,
  withoutRaw,
  type GoalEvent,
  type MomentumBucket,
  type NormalizedLineups,
  type OddsBoard,
  type SettleableCall,
  type SubstitutionEvent,
} from "@/lib/txline-normalize";
import { teamFlag, teamGlow } from "@/lib/team-visuals";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";

export function MatchPageV2({ fixtureId }: { fixtureId: number }) {
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
    oddsValidation: null,
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

      // Include the on-device fixture cache: finished fixtures drop off the
      // TxLINE snapshot within hours, and deep links must keep resolving.
      const merged = mergeFixtures(
        [...loadCachedFixtures(), ...txlineWorldCupFixtures],
        liveFixtures,
        { worldCupOnly: false },
      );

      cacheFixtures(merged);
      setFixtures(merged);
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
          oddsValidation: null,
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
        oddsValidation,
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
        fetchJson<TxlineOddsValidationData>(
          `/api/txline/odds/${fixtureId}/validation`,
        ),
      ]);

      if (!cancelled) {
        setDetails({
          fixtureValidation,
          historicalUpdates,
          lineups,
          odds,
          oddsUpdates,
          oddsValidation,
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
  // A match can outlive the 4h kickoff window (delays, long extra time):
  // the feed's StatusId is authoritative for "still being played".
  const feedInPlay = useMemo(() => {
    const baseUpdates = details.historicalUpdates?.data?.length
      ? details.historicalUpdates.data
      : details.updates?.data ?? [];
    let statusId = 0;

    for (const update of [...baseUpdates, ...streamUpdates].sort(
      (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
    )) {
      if (typeof update.statusId === "number") {
        statusId = update.statusId;
      }
    }

    return statusId >= 2 && statusId <= 9;
  }, [details.historicalUpdates, details.updates, streamUpdates]);
  const liveStreamEligible = Boolean(
    fixture &&
      now !== null &&
      (isPotentiallyLive(fixture, now) || feedInPlay) &&
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
  // Scout corrections first: drop discarded events (disallowed goals, wrongly
  // logged corners) and apply amends (re-graded shot outcomes) so every
  // consumer below - stats, calls, feed - sees the corrected record of play.
  const combinedUpdates = applyScoutCorrections(
    fillUnknownStats([...(replayUpdates?.data ?? []), ...streamUpdates]),
  );
  const displayScore = getDisplayScore(details.score?.data, combinedUpdates);
  const scoreSource = replayUpdates?.data?.length
    ? `${details.score?.source ?? "TxLINE scores snapshot API"} + ${
        replayUpdates.source ?? "TxLINE scores updates API"
      }`
    : details.score?.source ?? details.score?.error ?? "Pending";
  // TxLINE can keep GameState at "scheduled" after kickoff; the scout
  // StatusId / clock in the loaded feed (or on the live stream) is the
  // stronger signal. StatusId >= 5 covers full time before game_finalised
  // arrives (7 observed post-match on devnet).
  const streamIndicatesLive = streamUpdates.some(
    (update) => update.action === "kickoff" || (update.clockSeconds ?? 0) > 0,
  );
  const matchClock = deriveMatchClock(combinedUpdates);
  const feedStatusId = matchClock?.statusId ?? 0;
  const formattedState = formatGameState(displayScore?.gameState);
  const displayState =
    feedFinished ||
    (isPastFixture(fixture) &&
      !liveStreamEligible &&
      displayScore &&
      !feedInPlay)
      ? "Finished"
      : feedStatusId > 10
        ? "Penalties"
        : feedStatusId >= 6 && feedStatusId <= 9
          ? // 6-9 = ET break through ET second half (verified live NOR-ENG).
            "Extra time"
          : feedStatusId === 5 || feedStatusId === 10
            ? "Full time"
            : feedStatusId === 3
          ? "Halftime"
          : feedStatusId >= 2 ||
              (streamIndicatesLive && formattedState === "Not started")
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
  const redCardedPlayerIds = new Set<number>();
  // Live yellow-card counts per player, deduped by TxLINE event id (one real
  // booking can emit several feed records).
  const yellowEventsByPlayer = new Map<number, Set<number | string>>();

  for (const update of combinedUpdates) {
    if (typeof update.data?.PlayerId !== "number") {
      continue;
    }

    if (update.action === "red_card") {
      redCardedPlayerIds.add(update.data.PlayerId);
    }

    if (update.action === "yellow_card") {
      const events =
        yellowEventsByPlayer.get(update.data.PlayerId) ?? new Set();

      events.add(update.eventId ?? `seq-${update.seq}`);
      yellowEventsByPlayer.set(update.data.PlayerId, events);
    }
  }

  const yellowCardCounts = new Map<number, number>(
    [...yellowEventsByPlayer.entries()].map(([playerId, events]) => [
      playerId,
      events.size,
    ]),
  );
  const callTeam = (participant?: number) =>
    participant === 1
      ? fixture.homeTeam
      : participant === 2
        ? fixture.awayTeam
        : undefined;
  const liveCalls: LiveUiCall[] = [
    ...extractGoalCalls(combinedUpdates).map((call) => ({
      correctIndex: call.resolved ? ((call.stood ? 0 : 1) as 0 | 1) : undefined,
      key: call.key,
      minute: formatMinute(call.clockSeconds) || "—",
      options: ["Goal", "No goal"] as [string, string],
      outcome: call.resolved ? (call.stood ? "⚽ Goal" : "No goal") : "Open",
      question: `Close play${
        callTeam(call.participant) ? ` for ${callTeam(call.participant)}` : ""
      } - does it end in a goal?`,
      resolved: call.resolved,
      seq: call.seq,
    })),
    ...extractCornerCalls(combinedUpdates).map((call) => ({
      correctIndex:
        call.winner === 1 ? (0 as const) : call.winner === 2 ? (1 as const) : undefined,
      key: call.key,
      minute: formatMinute(call.clockSeconds) || "0'",
      options: [fixture.homeTeam, fixture.awayTeam] as [string, string],
      outcome: !call.resolved
        ? "Open"
        : call.voided
          ? "No more corners"
          : callTeam(call.winner) ?? "Unknown",
      question: "Who wins the next corner?",
      resolved: call.resolved,
      seq: call.seq,
      voided: call.voided,
    })),
    ...extractAddedTimeCalls(combinedUpdates).map((call) => ({
      correctIndex: call.resolved
        ? (((call.minutes ?? 0) > 3.5 ? 0 : 1) as 0 | 1)
        : undefined,
      key: call.key,
      minute: call.half === 1 ? "45'" : "90'",
      options: ["Over 3.5", "Under 3.5"] as [string, string],
      outcome: !call.resolved
        ? call.voided
          ? "Not announced"
          : "Open"
        : `${call.minutes} minutes added`,
      question: `Added time (half ${call.half}): over or under 3.5 minutes?`,
      resolved: call.resolved,
      seq: call.seq,
      voided: call.voided,
    })),
    ...extractPenaltyEvents(combinedUpdates).map((call) => ({
      correctIndex: call.outcome
        ? ((call.outcome === "scored" ? 0 : 1) as 0 | 1)
        : undefined,
      key: call.key,
      minute: formatMinute(call.clockSeconds) || "—",
      options: ["Scored", "Missed"] as [string, string],
      outcome: call.outcome
        ? call.outcome === "scored"
          ? "⚽ Scored"
          : "Missed"
        : call.voided
          ? "Not taken"
          : "Open",
      question: `Penalty${
        callTeam(call.participant) ? ` for ${callTeam(call.participant)}` : ""
      }! Scored or missed?`,
      resolved: call.resolved,
      seq: call.seq,
      voided: call.voided,
    })),
  ].sort((left, right) => left.seq - right.seq);
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
  const throwIns = countTeamEvents(combinedUpdates, "throw_in");
  const goalKicks = countTeamEvents(combinedUpdates, "goal_kick");
  const penalties = extractPenaltyEvents(combinedUpdates);
  const penaltyCounts = penalties.reduce(
    (counts, penalty) => {
      const isHome = participant1IsHome
        ? penalty.participant === 1
        : penalty.participant === 2;

      counts[isHome ? "home" : "away"] += 1;

      return counts;
    },
    { away: 0, home: 0 },
  );
  const matchInfo = extractMatchInfo(combinedUpdates);
  const momentum = extractMomentum(combinedUpdates);
  // Current match second: the scout clock plus wall time elapsed since the
  // record that reported it (only while the clock runs).
  const liveClockSeconds =
    matchClock && !finished
      ? matchClock.seconds +
        (matchClock.running && matchClock.ts && now
          ? Math.max(0, (now - matchClock.ts) / 1000)
          : 0)
      : null;
  // Break/ended phases show the phase alone; playing phases show the minute.
  const clockLabel =
    liveClockSeconds !== null && matchClock
      ? [3, 5, 6, 8, 10].includes(matchClock.statusId ?? 0)
        ? matchClock.statusId === 3
          ? "Halftime"
          : formatMatchPhase(matchClock.statusId) ?? null
        : (matchClock.statusId ?? 0) >= 2
          ? `${formatLiveMinute(liveClockSeconds, matchClock.statusId)}${
              formatMatchPhase(matchClock.statusId)
                ? ` · ${formatMatchPhase(matchClock.statusId)}`
                : ""
            }`
          : null
      : null;
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
    ...(penaltyCounts.home + penaltyCounts.away > 0
      ? [
          {
            away: penaltyCounts.away,
            home: penaltyCounts.home,
            label: "Penalties awarded",
          },
        ]
      : []),
    ...(throwIns.home + throwIns.away > 0
      ? [
          { away: throwIns.away, home: throwIns.home, label: "Throw-ins" },
        ]
      : []),
    ...(goalKicks.home + goalKicks.away > 0
      ? [
          { away: goalKicks.away, home: goalKicks.home, label: "Goal kicks" },
        ]
      : []),
  ];

  const homeIso = teamFlag(fixture.homeTeam);
  const awayIso = teamFlag(fixture.awayTeam);
  const hadExtraTime = combinedUpdates.some(
    (update) =>
      update.statusId === 7 || update.statusId === 8 || update.statusId === 9,
  );
  const heroTeam = (side: "away" | "home") => {
    const iso = side === "home" ? homeIso : awayIso;
    const name = side === "home" ? fixture.homeTeam : fixture.awayTeam;
    const reds =
      (side === "home"
        ? displayScore?.homeRedCards
        : displayScore?.awayRedCards) ?? 0;

    return (
      <div className={`mp2-hero-team ${side}`}>
        {iso ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="mp2-hero-flag"
            src={`https://flagcdn.com/w160/${iso}.png`}
          />
        ) : (
          <span className="mp2-hero-flag mp2-hero-flag-tbd" />
        )}
        <span className="mp2-hero-name">
          {name}
          {reds > 0 ? (
            <span className="h1-reds" role="img" aria-label="red card">
              {" "}
              {"🟥".repeat(reds)}
            </span>
          ) : null}
        </span>
      </div>
    );
  };
  // Scorers grouped FotMob-style: one line per player, minutes joined
  // ("Bellingham 45+2', 93'"), stoppage-time minutes capped per period.
  const heroGoalLines = (side: "away" | "home") => {
    const lines = new Map<string, string[]>();

    for (const goal of goals) {
      if (goal.scoringSide !== side) continue;

      const name =
        (goal.playerId !== undefined
          ? playerDirectory.get(goal.playerId)?.name
          : undefined) ??
        (side === "home" ? fixture.homeTeam : fixture.awayTeam);
      const minute =
        goal.clockSeconds !== undefined
          ? formatLiveMinute(goal.clockSeconds, goal.statusId)
          : "—";

      lines.set(name, [...(lines.get(name) ?? []), minute]);
    }

    return [...lines.entries()].map(([name, minutes]) => (
      <li key={name}>
        {name} {minutes.join(", ")}
      </li>
    ));
  };
  const clockRunning = matchClock?.running === true && !finished;
  // Before kickoff the snapshot is a meaningless 0-0; the hero shows the
  // kickoff time instead and the stats section waits for the match.
  const notStarted =
    displayState === "Not started" || displayState === "Scheduled";
  const kickoff = new Date(fixture.kickoffUtc);
  const heroInfo = [
    `${new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
      weekday: "short",
    }).format(kickoff)} · ${formatUtcTime(kickoff.getTime())} UTC`,
    ...(matchInfo?.venueType === "neutral" ? ["Neutral ground"] : []),
    ...(matchInfo?.weather ? [matchInfo.weather] : []),
  ];

  return (
    <main className="mp2">
      <header className="mp2-hero">
        <h1 className="sr-only">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h1>
        {/* Decorative banner artwork: brand-coloured gradient washes and arc
            swooshes over near-black, FotMob-style. */}
        <svg
          aria-hidden
          className="mp2-hero-bg"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1040 260"
        >
          <rect fill="#17171c" height="260" width="1040" />
          <rect fill="url(#mp2bg-blue)" height="260" width="1040" />
          <rect fill="url(#mp2bg-green)" height="260" width="1040" />
          <path
            d="M64 128 L196 128 C270 128 330 62 330 -20 L198 -20 C124 -20 64 46 64 128 Z"
            fill="url(#mp2bg-red)"
          />
          <path
            d="M46 128 L178 128 C252 128 312 62 312 -20 L180 -20 C106 -20 46 46 46 128 Z"
            fill="url(#mp2bg-red2)"
          />
          <defs>
            <radialGradient
              cx="0"
              cy="0"
              gradientTransform="translate(620 -110) rotate(99) scale(300 820)"
              gradientUnits="userSpaceOnUse"
              id="mp2bg-blue"
              r="1"
            >
              <stop stopColor="#0044ff" stopOpacity="0.6" />
              <stop offset="1" stopColor="#17171c" stopOpacity="0" />
            </radialGradient>
            <radialGradient
              cx="0"
              cy="0"
              gradientTransform="translate(120 260) rotate(-45) scale(340 340)"
              gradientUnits="userSpaceOnUse"
              id="mp2bg-green"
              r="1"
            >
              <stop stopColor="#4ade80" stopOpacity="0.35" />
              <stop offset="1" stopColor="#17171c" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="mp2bg-red"
              x1="330"
              x2="210"
              y1="-60"
              y2="110"
            >
              <stop stopColor="#fa3d3d" />
              <stop offset="1" stopColor="#17171c" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="mp2bg-red2"
              x1="290"
              x2="140"
              y1="-90"
              y2="120"
            >
              <stop stopColor="#fa3d3d" />
              <stop offset="1" stopColor="#17171c" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="mp2-hero-content">
          <div className="mp2-hero-top">
            <Link className="mp2-hero-back" href="/">
              <span aria-hidden className="mp2-hero-back-circle">
                <svg fill="none" viewBox="0 0 18 18">
                  <path
                    d="M11 3.5 5.5 9l5.5 5.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              Matches
            </Link>
            <span className="mp2-hero-comp">
              <HugeiconsIcon
                className="mp2-hero-comp-ic"
                icon={FootballIcon}
                strokeWidth={2}
              />
              {formatCompetition(fixture).replace(" > ", " · ")}
            </span>
            <span aria-hidden />
          </div>
          <ul className="mp2-hero-info">
            {heroInfo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mp2-hero-grid">
            {heroTeam("home")}
            <div className="mp2-hero-center">
              {displayScore && !notStarted ? (
                <div className="mp2-hero-score" aria-label="Score">
                  <span>{displayScore.homeGoals}</span>
                  <span aria-hidden className="mp2-hero-score-dash">
                    -
                  </span>
                  <span>{displayScore.awayGoals}</span>
                </div>
              ) : (
                <div className="mp2-hero-when">
                  <span className="mp2-hero-time">
                    {formatUtcTime(kickoff.getTime())}
                  </span>
                  <span className="mp2-hero-date">
                    {new Intl.DateTimeFormat("en", {
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    }).format(kickoff)}{" "}
                    · UTC
                  </span>
                </div>
              )}
              {finished ? (
                <span className="mp2-hero-reason">
                  {hadExtraTime ? "After extra time" : "Full time"}
                </span>
              ) : notStarted ? null : (
                <div className="mp2-hero-status">
                  {clockRunning ? (
                    <span aria-hidden className="pc-live-dot" />
                  ) : null}
                  <span
                    className={`mp2-status-pill${liveStreamEligible ? " live" : ""}`}
                  >
                    {displayState}
                  </span>
                  {clockLabel &&
                  liveStreamEligible &&
                  clockLabel !== displayState ? (
                    <span className="mp2-clock">{clockLabel}</span>
                  ) : null}
                </div>
              )}
            </div>
            {heroTeam("away")}
          </div>
          {goals.length ? (
            <div className="mp2-hero-goals">
              <ul className="mp2-goal-list home">{heroGoalLines("home")}</ul>
              <span aria-hidden className="mp2-hero-ball">
                ⚽
              </span>
              <ul className="mp2-goal-list away">{heroGoalLines("away")}</ul>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mp2-layout">
        <div className="mp2-main">
      <section className="card" aria-labelledby="stats-heading">
        <h2 id="stats-heading">Stats</h2>
        {notStarted ? (
          <p className="muted">Stats appear once the match kicks off.</p>
        ) : (
        <>
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
        </>
        )}
      </section>

      <MomentumSection
        awayColor={(awayIso && teamGlow[awayIso]) || "#8b8b96"}
        extraTime={hadExtraTime}
        fixture={fixture}
        goals={goals}
        homeColor={(homeIso && teamGlow[homeIso]) || "#8b8b96"}
        momentum={momentum}
      />

      <LineupsSection
        goals={goals}
        lineups={details.lineups}
        playerStats={details.score?.data?.playerStats}
        redCards={redCardedPlayerIds}
        substitutions={substitutions}
        yellowCards={yellowCardCounts}
      />
        </div>

        <aside className="mp2-side">
      <PredictionSection
        key={fixture.fixtureId}
        calls={extractSettleableCalls(combinedUpdates)}
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
        calls={liveCalls}
        fixtureId={fixture.fixtureId}
        live={liveStreamEligible}
      />

      <MatchInfoSection fixture={fixture} info={matchInfo} />
        </aside>

        <div className="mp2-main mp2-main-wide">
      <section className="card" aria-labelledby="odds-heading">
        <h2 id="odds-heading">Odds</h2>
        {!(details.oddsUpdates?.data?.board ??
        details.oddsUpdates?.data?.closingBoard) ? (
          <p className="muted">
            {details.odds?.data?.marketNote ?? "No odds snapshot available."}
          </p>
        ) : null}
        {liveOddsNote ? (
          <p className="muted">Live from odds stream: {liveOddsNote}</p>
        ) : null}
        <OddsBoardView
          board={
            finished
              ? details.oddsUpdates?.data?.closingBoard ??
                details.oddsUpdates?.data?.board
              : details.oddsUpdates?.data?.board
          }
          finished={finished}
          fixture={fixture}
        />
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
      <section className="card" aria-labelledby="data-heading">
        <h2 id="data-heading">Data &amp; sources</h2>
        <p className="muted">
          Kickoff {formatDate(fixture.kickoffUtc)} UTC - Fixture #
          {fixture.fixtureId}
        </p>
        {detailsLoading ? (
          <p className="muted">Loading TxLINE details...</p>
        ) : null}
        {liveStreamEligible ? (
          <p className="muted">
            Live stream:{" "}
            {streamStatus === "connected"
              ? `connected - ${streamUpdates.length} live record(s) for this fixture so far`
              : streamStatus === "unavailable"
                ? "stream unavailable, showing snapshot and replay data"
                : "connecting to TxLINE score stream..."}
          </p>
        ) : null}
        <p className="muted">Score source: {scoreSource}</p>
        <p className="muted">
          Odds source:{" "}
          {details.odds?.source ?? details.odds?.error ?? "Pending"}
          {isOddsUpdatesData(details.oddsUpdates?.data)
            ? ` · ${details.oddsUpdates.data.count} live update records${
                details.oddsUpdates.data.marketTypes.length
                  ? ` across ${details.oddsUpdates.data.marketTypes.length} market type(s)`
                  : ""
              }`
            : ""}
        </p>
        {replayUpdates?.data?.length ? (
          <p className="muted">
            Displayed score uses the latest TxLINE update when it is newer than
            the snapshot.
          </p>
        ) : null}
      </section>

      <VerificationSection
        displayScore={displayScore}
        finished={finished}
        fixture={fixture}
        fixtureValidation={details.fixtureValidation}
        historicalUpdates={details.historicalUpdates}
        oddsUpdates={details.oddsUpdates}
        oddsValidation={details.oddsValidation}
        updates={details.updates}
        validation={details.validation}
      />
        </div>
      </div>
    </main>
  );
}

// Our answer window: TxLINE gives no duration for a live-call moment (it
// ends whenever the resolving record arrives), so we impose a fixed window -
// which also prevents answering after the outcome is known.
const CALL_WINDOW_MS = 8000;

export type LiveUiCall = {
  correctIndex?: 0 | 1;
  key: string;
  minute: string;
  options: [string, string];
  outcome: string;
  question: string;
  resolved: boolean;
  seq: number;
  voided?: boolean;
};

function answerIndex(answer: string): number {
  if (answer === "goal") return 0;
  if (answer === "no_goal") return 1;

  return Number(answer);
}

// Short synthesized two-tone chime announcing a new live call (no audio
// asset; Web Audio only). Browsers block audio before the first user gesture
// on the page - fail silently then, the popup itself is the signal.
let chimeContext: AudioContext | null = null;
let lastChimeKey: string | null = null;

function playCallChime(key: string) {
  // One ring per call, even if the dialog remounts (StrictMode, re-renders).
  if (lastChimeKey === key) {
    return;
  }

  lastChimeKey = key;

  try {
    chimeContext ??= new AudioContext();

    if (chimeContext.state === "suspended") {
      void chimeContext.resume();
    }

    const now = chimeContext.currentTime;
    const tones: Array<[frequency: number, startOffset: number]> = [
      [880, 0],
      [1318.5, 0.12],
    ];

    for (const [frequency, startOffset] of tones) {
      const oscillator = chimeContext.createOscillator();
      const gain = chimeContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + startOffset);
      gain.gain.linearRampToValueAtTime(0.1, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + 0.4);
      oscillator.connect(gain).connect(chimeContext.destination);
      oscillator.start(now + startOffset);
      oscillator.stop(now + startOffset + 0.45);
    }
  } catch {
    // Audio unavailable or blocked - stay silent.
  }
}

function CallPromptDialog({
  call,
  onAnswer,
  onDismiss,
}: {
  call: LiveUiCall;
  onAnswer: (index: 0 | 1) => void;
  onDismiss: (key: string) => void;
}) {
  const [remaining, setRemaining] = useState(CALL_WINDOW_MS);
  const callKey = call.key;

  // Ring once per call prompt.
  useEffect(() => {
    playCallChime(callKey);
  }, [callKey]);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, CALL_WINDOW_MS - (Date.now() - start));

      setRemaining(left);

      if (left <= 0) {
        onDismiss(callKey);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [callKey, onDismiss]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onDismiss(callKey);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Live call</DialogTitle>
          <DialogDescription>{call.question}</DialogDescription>
        </DialogHeader>
        <Progress value={(remaining / CALL_WINDOW_MS) * 100} />
        <p className="muted">
          {Math.ceil(remaining / 1000)}s to answer - resolves early if the
          play settles first.
        </p>
        <DialogFooter className="gap-3 sm:justify-center">
          <Button
            className="h-12 flex-1 text-base font-semibold"
            onClick={() => onAnswer(0)}
          >
            {call.options[0]}
          </Button>
          <Button
            className="h-12 flex-1 text-base font-semibold"
            onClick={() => onAnswer(1)}
            variant="outline"
          >
            {call.options[1]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoalCallsSection({
  calls,
  fixtureId,
  live,
}: {
  calls: LiveUiCall[];
  fixtureId: number;
  live: boolean;
}) {
  const mounted = useIsMounted();
  const [answers, setAnswers] = useState<Record<string, GoalCallAnswer>>(() =>
    loadGoalCalls(fixtureId),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const handleDismiss = useCallback((key: string) => {
    setDismissed((previous) => {
      const next = new Set(previous);

      next.add(key);

      return next;
    });
  }, []);

  if (calls.length === 0) {
    return null;
  }

  const openCall = live
    ? [...calls]
        .reverse()
        .find(
          (call) =>
            !call.resolved &&
            !call.voided &&
            !answers[call.key] &&
            !dismissed.has(call.key),
        )
    : undefined;
  const points = calls.reduce((total, call) => {
    const answer = answers[call.key];

    if (!call.resolved || call.voided || !answer || call.correctIndex === undefined) {
      return total;
    }

    return (
      total + (answerIndex(answer.answer) === call.correctIndex ? GOAL_CALL_POINTS : 0)
    );
  }, 0);

  function answer(callKey: string, index: 0 | 1) {
    const record: GoalCallAnswer = {
      answer: String(index),
      answeredAt: new Date().toISOString(),
    };

    saveGoalCall(fixtureId, callKey, record);
    setAnswers((previous) => ({ ...previous, [callKey]: record }));
  }

  return (
    <section className="card" aria-labelledby="goal-calls-heading">
      <h2 id="goal-calls-heading">Live calls</h2>
      {openCall && mounted ? (
        <CallPromptDialog
          key={openCall.key}
          call={openCall}
          onAnswer={(index) => answer(openCall.key, index)}
          onDismiss={handleDismiss}
        />
      ) : null}
      <ul className="call-list">
        {[...calls].reverse().map((call) => {
          const callAnswer = mounted ? answers[call.key] : undefined;
          const correct =
            call.resolved && !call.voided && callAnswer && call.correctIndex !== undefined
              ? answerIndex(callAnswer.answer) === call.correctIndex
              : null;

          return (
            <li key={call.key}>
              <span>
                {call.minute} {call.question}
              </span>
              <span className="call-outcome">
                {call.outcome}
                {callAnswer
                  ? correct === null
                    ? ` · you said ${call.options[answerIndex(callAnswer.answer)] ?? callAnswer.answer}`
                    : correct
                      ? ` · ✓ +${GOAL_CALL_POINTS}`
                      : " · ✗ 0"
                  : call.resolved && !call.voided
                    ? " · — 0"
                    : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        Live micro-calls on TxLINE moments (close plays, next corner, added
        time), settled by the verified feed.{" "}
        {mounted && points > 0 ? `You earned ${points} point(s) here.` : ""}
      </p>
    </section>
  );
}

// Tooltip for the momentum chart: the hovered 5-minute window with each
// side's raw pressure score.
function MomentumTooltip({
  active,
  awayTeam,
  homeTeam,
  payload,
}: {
  active?: boolean;
  awayTeam: string;
  homeTeam: string;
  payload?: Array<{
    payload?: { away: number; home: number; label?: string };
  }>;
}) {
  const bucket = payload?.[0]?.payload;

  if (!active || !bucket?.label) {
    return null;
  }

  return (
    <div className="mmt-tip">
      <div className="mmt-tip-label">{bucket.label}</div>
      <div>
        {homeTeam} {bucket.home} · {awayTeam} {bucket.away}
      </div>
    </div>
  );
}

// Attack momentum as a split area chart (shadcn chart / recharts): one
// signed series - home pressure minus away pressure - so the curve swings
// above the zero baseline in the home colour and "upside down" below it in
// the away colour. The flip is just negative values plus a two-stop
// gradient split exactly at the zero crossing of the area's bounding box.
function MomentumSection({
  awayColor,
  extraTime,
  fixture,
  goals,
  homeColor,
  momentum,
}: {
  awayColor: string;
  extraTime: boolean;
  fixture: WorldCupFixture;
  goals: GoalEvent[];
  homeColor: string;
  momentum: MomentumBucket[];
}) {
  if (momentum.length < 2) {
    return null;
  }

  // Two near-identical team colours (Spain red vs Belgium red) would make
  // the two halves of the chart indistinguishable - fall back to a neutral
  // for the away side, FotMob-style.
  const channel = (hex: string, i: number) =>
    Number.parseInt(hex.slice(i, i + 2), 16);
  const colorDistance = Math.hypot(
    channel(homeColor, 1) - channel(awayColor, 1),
    channel(homeColor, 3) - channel(awayColor, 3),
    channel(homeColor, 5) - channel(awayColor, 5),
  );
  const chartAwayColor = colorDistance < 100 ? "#e5e7eb" : awayColor;

  // The scout clock overruns each period's nominal end during stoppage time
  // (H1 runs past 45', ET2 past 120'), which would stretch the timeline and
  // drift markers past their separators. Football convention instead: clamp
  // into the period window, so a 45+2' goal sits ON the halftime line and a
  // 120+1' goal at the AET edge.
  const PERIOD_WINDOW: Record<number, [number, number]> = {
    2: [0, 45],
    3: [45, 45],
    4: [45, 90],
    5: [90, 90],
    6: [90, 90],
    7: [90, 105],
    8: [105, 105],
    9: [105, 120],
    10: [120, 120],
  };
  const clampToPeriod = (rawMinute: number, statusId?: number) => {
    const window =
      statusId !== undefined
        ? PERIOD_WINDOW[statusId > 10 ? 10 : statusId]
        : undefined;

    return window
      ? Math.min(Math.max(rawMinute, window[0]), window[1])
      : rawMinute;
  };
  const maxMinute = extraTime ? 120 : 90;
  // Buckets past the timeline end (stoppage) fold into the final position.
  const bucketPoints = new Map<
    number,
    { away: number; home: number; label: string }
  >();

  for (const bucket of momentum) {
    const minute = Math.min(bucket.startMinute + 2.5, maxMinute - 0.5);
    const existing = bucketPoints.get(minute);

    bucketPoints.set(minute, {
      away: (existing?.away ?? 0) + bucket.awayPressure,
      home: (existing?.home ?? 0) + bucket.homePressure,
      label: existing
        ? `${existing.label.split("-")[0]}-${bucket.startMinute + 5}'`
        : `${bucket.startMinute}-${bucket.startMinute + 5}'`,
    });
  }

  const data = [
    { away: 0, home: 0, minute: 0, net: 0 },
    ...[...bucketPoints.entries()]
      .sort(([left], [right]) => left - right)
      .map(([minute, bucket]) => ({
        away: bucket.away,
        home: bucket.home,
        label: bucket.label,
        minute,
        net: bucket.home - bucket.away,
      })),
    { away: 0, home: 0, minute: maxMinute, net: 0 },
  ];
  const peak = Math.max(1, ...data.map((entry) => Math.abs(entry.net)));
  // Symmetric Y domain keeps the zero baseline dead centre; padding leaves
  // room for the goal badges pinned near the edges.
  const lim = peak * 1.3;
  // The colour split anchors in user space exactly on the zero baseline:
  // with a symmetric Y domain that is the vertical centre of the plot area.
  // (Deriving it from the area's bounding box is unreliable - "natural"
  // smoothing overshoots the data extremes.) Geometry is fixed: the
  // container is 200px tall (see .mmt-chart), margins below.
  const CHART_HEIGHT = 200;
  const MARGIN_TOP = 6;
  const XAXIS_HEIGHT = 24;
  const PLOT_TOP = MARGIN_TOP;
  const PLOT_BOTTOM = CHART_HEIGHT - XAXIS_HEIGHT;
  const gradientId = `mmt-split-${fixture.fixtureId}`;
  const separators = [45, ...(extraTime ? [90] : [])];
  const tickLabel = (minute: number) =>
    minute === 0
      ? "0'"
      : minute === 45
        ? "HT"
        : minute === 90
          ? "FT"
          : minute === 120
            ? "AET"
            : `${minute}'`;
  const goalDot = (props: { cx?: number; cy?: number }) => (
    <g>
      <circle
        cx={props.cx}
        cy={props.cy}
        fill="#101014"
        r="10"
        stroke="rgba(255, 255, 255, 0.18)"
      />
      <text
        dominantBaseline="central"
        fontSize="11"
        textAnchor="middle"
        x={props.cx}
        y={(props.cy ?? 0) + 0.5}
      >
        ⚽
      </text>
    </g>
  );
  const chartConfig = {
    away: { color: chartAwayColor, label: fixture.awayTeam },
    home: { color: homeColor, label: fixture.homeTeam },
  } satisfies ChartConfig;

  return (
    <section className="card" aria-labelledby="momentum-heading">
      <h2 id="momentum-heading">Momentum</h2>
      <ChartContainer className="mmt-chart" config={chartConfig}>
        <AreaChart
          data={data}
          margin={{ bottom: 0, left: 10, right: 10, top: 6 }}
        >
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id={gradientId}
              x1="0"
              x2="0"
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
            >
              <stop offset={0.5} stopColor={homeColor} />
              <stop offset={0.5} stopColor={chartAwayColor} />
            </linearGradient>
          </defs>
          <XAxis
            axisLine={false}
            dataKey="minute"
            domain={[0, maxMinute]}
            height={XAXIS_HEIGHT}
            interval={0}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 700 }}
            tickFormatter={tickLabel}
            tickLine={false}
            tickMargin={8}
            ticks={[0, ...separators, maxMinute]}
            type="number"
          />
          <YAxis domain={[-lim, lim]} hide type="number" />
          <ReferenceLine stroke="rgba(255, 255, 255, 0.08)" y={0} />
          {separators.map((minute) => (
            <ReferenceLine
              key={minute}
              stroke="rgba(255, 255, 255, 0.16)"
              strokeDasharray="0.1 8"
              strokeLinecap="round"
              strokeWidth={2.5}
              x={minute}
            />
          ))}
          <ChartTooltip
            content={
              <MomentumTooltip
                awayTeam={fixture.awayTeam}
                homeTeam={fixture.homeTeam}
              />
            }
            cursor={{ stroke: "rgba(255, 255, 255, 0.18)" }}
          />
          <Area
            dataKey="net"
            fill={`url(#${gradientId})`}
            fillOpacity={0.85}
            isAnimationActive={false}
            stroke={`url(#${gradientId})`}
            type="natural"
          />
          {goals.map((goal) => (
            <ReferenceDot
              key={goal.seq}
              r={10}
              shape={goalDot}
              x={Math.min(
                clampToPeriod((goal.clockSeconds ?? 0) / 60, goal.statusId),
                maxMinute,
              )}
              y={goal.scoringSide === "home" ? lim * 0.82 : -lim * 0.82}
            />
          ))}
        </AreaChart>
      </ChartContainer>
      <p className="momentum-legend muted">
        <span
          className="momentum-dot"
          style={{ backgroundColor: homeColor }}
        />{" "}
        {fixture.homeTeam}
        <span
          className="momentum-dot"
          style={{ backgroundColor: chartAwayColor }}
        />{" "}
        {fixture.awayTeam} — net attack pressure from TxLINE possession
        phases, shots and corners, per 5 minutes. Balls mark goals.
      </p>
    </section>
  );
}

// Named CSS colors cover the jersey values TxLINE scouts report ("red",
// "aqua"); anything unparseable still reads fine as text.
function MatchInfoSection({
  fixture,
  info,
}: {
  fixture: WorldCupFixture;
  info: ReturnType<typeof extractMatchInfo>;
}) {
  if (!info) {
    return null;
  }

  const rows: Array<{ label: string; swatch?: string; value: string }> = [];

  if (info.venueType) {
    rows.push({
      label: "Venue",
      value:
        info.venueType === "neutral"
          ? "Neutral ground"
          : info.venueType.charAt(0).toUpperCase() + info.venueType.slice(1),
    });
  }

  if (info.weather) {
    rows.push({ label: "Conditions", value: info.weather });
  }

  if (info.pitch) {
    rows.push({ label: "Pitch", value: info.pitch });
  }

  if (info.homeJersey) {
    rows.push({
      label: `${fixture.homeTeam} kit`,
      swatch: info.homeJersey,
      value: info.homeJersey,
    });
  }

  if (info.awayJersey) {
    rows.push({
      label: `${fixture.awayTeam} kit`,
      swatch: info.awayJersey,
      value: info.awayJersey,
    });
  }

  if (info.kickoffSide) {
    rows.push({
      label: "Kickoff",
      value: info.kickoffSide === "home" ? fixture.homeTeam : fixture.awayTeam,
    });
  }

  if (!rows.length) {
    return null;
  }

  return (
    <section className="card" aria-labelledby="match-info-heading">
      <h2 id="match-info-heading">Match info</h2>
      <dl className="match-info-grid">
        {rows.map((row) => (
          <div className="match-info-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.swatch ? (
                <span
                  aria-hidden="true"
                  className="kit-swatch"
                  style={{ background: row.swatch }}
                />
              ) : null}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="muted">Scene reports from the TxLINE scout feed.</p>
    </section>
  );
}

// Current prices across TxLINE's three market families (decimal odds). For
// finished matches the caller passes the pre-match closing board, since final
// in-play prices are just the settled result.
function OddsBoardView({
  board,
  finished,
  fixture,
}: {
  board?: OddsBoard;
  finished: boolean;
  fixture: WorldCupFixture;
}) {
  if (!board || (!board.result && !board.overUnder.length && !board.asianHandicap.length)) {
    return null;
  }

  const decimal = (value: number) => value.toFixed(2);
  // TxLINE quotes every quarter-line; show only the classic .5 lines (no
  // push/void outcomes), capped to keep the board readable.
  const mainLines = (lines: OddsBoard["overUnder"]) =>
    lines
      .filter((entry) => (entry.line * 2) % 1 === 0 && entry.line % 1 !== 0)
      .slice(0, 6);

  const overUnder = mainLines(board.overUnder);
  const handicap = mainLines(board.asianHandicap);

  return (
    <div className="odds-board">
      <p className="muted">
        {finished
          ? "Closing prices (last pre-match quotes)."
          : "Latest quoted prices."}
      </p>
      {board.result ? (
        <div className="odds-market">
          <p className="stat-title">Match result</p>
          <div className="odds-line">
            <span className="odds-cell">
              <em>{fixture.homeTeam}</em> {decimal(board.result.home)}
            </span>
            <span className="odds-cell">
              <em>Draw</em> {decimal(board.result.draw)}
            </span>
            <span className="odds-cell">
              <em>{fixture.awayTeam}</em> {decimal(board.result.away)}
            </span>
          </div>
        </div>
      ) : null}
      {overUnder.length ? (
        <div className="odds-market">
          <p className="stat-title">Total goals over/under</p>
          {overUnder.map((entry) => (
            <div className="odds-line" key={entry.line}>
              <span className="odds-cell muted">{entry.line}</span>
              <span className="odds-cell">
                <em>Over</em> {decimal(entry.prices[0])}
              </span>
              <span className="odds-cell">
                <em>Under</em> {decimal(entry.prices[1])}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {handicap.length ? (
        <div className="odds-market">
          <p className="stat-title">Asian handicap ({fixture.homeTeam})</p>
          {handicap.map((entry) => (
            <div className="odds-line" key={entry.line}>
              <span className="odds-cell muted">
                {entry.line > 0 ? `+${entry.line}` : entry.line}
              </span>
              <span className="odds-cell">
                <em>{fixture.homeTeam}</em> {decimal(entry.prices[0])}
              </span>
              <span className="odds-cell">
                <em>{fixture.awayTeam}</em> {decimal(entry.prices[1])}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LineupsSection({
  goals,
  lineups,
  playerStats,
  redCards,
  substitutions,
  yellowCards,
}: {
  goals: GoalEvent[];
  lineups: ApiResult<NormalizedLineups> | null;
  playerStats?: TxlineScoreData["playerStats"];
  redCards: Set<number>;
  substitutions: SubstitutionEvent[];
  yellowCards: Map<number, number>;
}) {
  const teams = lineups?.data?.teams;
  const goalCounts = new Map<number, number>();

  for (const goal of goals) {
    if (goal.playerId !== undefined) {
      goalCounts.set(goal.playerId, (goalCounts.get(goal.playerId) ?? 0) + 1);
    }
  }

  // TxLINE's post-match PlayerStats summary is authoritative; the live feed
  // heuristics (goal windows, card records) cover the match while it runs.
  const statLine = (playerId?: number) =>
    playerId !== undefined ? playerStats?.[String(playerId)] : undefined;
  const goalMarks = (playerId?: number) => {
    const count =
      statLine(playerId)?.goals ??
      (playerId !== undefined ? goalCounts.get(playerId) : undefined) ??
      0;

    return count > 0 ? ` ${"⚽".repeat(count)}` : "";
  };
  const yellowMarks = (playerId?: number) => {
    const count =
      statLine(playerId)?.yellowCards ??
      (playerId !== undefined ? yellowCards.get(playerId) : undefined) ??
      0;

    return count > 0 ? ` ${"🟨".repeat(count)}` : "";
  };
  const hasRed = (playerId?: number) =>
    (statLine(playerId)?.redCards ?? 0) > 0 ||
    (playerId !== undefined && redCards.has(playerId));

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
      {player.position ? (
        <span className="pos-badge">{player.position}</span>
      ) : null}
      {player.number ? `#${player.number} ` : ""}
      {player.name}
      {goalMarks(player.playerId)}
      {yellowMarks(player.playerId)}
      {hasRed(player.playerId) ? " 🟥" : ""}
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
  calls,
  fixture,
  lineups,
  now,
  odds1x2,
  outcome,
}: {
  calls: SettleableCall[];
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
  const settledCallPoints = mounted
    ? settleGoalCallPoints(calls, loadGoalCalls(fixture.fixtureId))
    : 0;

  // Persist the settled result so the home screen leaderboard can show points
  // without refetching every fixture's replay. The stored total is markets
  // PLUS live-call points - what the fan earned during the match must not
  // vanish at the final whistle.
  useEffect(() => {
    if (!settlement?.final || !outcome) {
      // A stored settlement for a match that is not actually finished is
      // bogus (e.g. saved mid-match by an older build) - heal it.
      if (outcome && settlement && !settlement.final) {
        removeSettlement(fixture.fixtureId);
      }

      return;
    }

    const callPoints = settleGoalCallPoints(
      calls,
      loadGoalCalls(fixture.fixtureId),
    );
    const totalPoints = settlement.totalPoints + callPoints;
    const finalScore = `${outcome.homeGoals}-${outcome.awayGoals}`;
    const existing = loadSettlements()[String(fixture.fixtureId)];

    if (
      existing &&
      existing.finalScore === finalScore &&
      existing.totalPoints === totalPoints
    ) {
      return;
    }

    saveSettlement({
      finalScore,
      fixtureId: fixture.fixtureId,
      settledAt: new Date().toISOString(),
      totalPoints,
    });
  }, [calls, fixture.fixtureId, outcome, settlement]);

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
            Total: {settlement.totalPoints + settledCallPoints} point(s)
            {settlement.final ? "" : " so far"}
            {settledCallPoints > 0
              ? ` - ${settlement.totalPoints} from markets + ${settledCallPoints} from live calls`
              : ""}
            . Settled deterministically from the TxLINE score data shown
            above.
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
      <h2 id="updates-heading">Match feed</h2>
      {displayUpdates.length ? (
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
      ) : (
        <p className="muted">No readable match events yet.</p>
      )}
      <p className="muted">
        Source: {updates?.source ?? updates?.error ?? "Pending"}
        {updates?.data?.length
          ? ` · ${updates.data.length} raw records`
          : ""}
      </p>
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
  oddsValidation,
  updates,
  validation,
}: {
  displayScore: TxlineScoreData | null | undefined;
  finished: boolean;
  fixture: WorldCupFixture;
  fixtureValidation: ApiResult<unknown> | null;
  historicalUpdates: ApiResult<TxlineUpdateData[]> | null;
  oddsUpdates: ApiResult<TxlineOddsUpdatesData> | null;
  oddsValidation: ApiResult<TxlineOddsValidationData> | null;
  updates: ApiResult<TxlineUpdateData[]> | null;
  validation: ApiResult<TxlineValidationData> | null;
}) {
  const proof = isValidationData(validation?.data) ? validation.data : null;
  const oddsProof = oddsValidation?.data?.messageId
    ? oddsValidation.data
    : null;

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
            TxLINE returned Merkle validation material for stat key(s){" "}
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
                  ✓ {market.market}:{" "}
                  {market.proven?.length === 2
                    ? `proven ${market.proven[0].value}-${market.proven[1].value} — `
                    : ""}
                  Merkle {market.proven?.length ? "multiproof" : "proof"}{" "}
                  returned (stat keys {market.statKeys.join(", ")},{" "}
                  {market.proofNodes} node(s))
                </li>
              ))}
              {oddsProof ? (
                <li>
                  ✓ Odds (1X2):{" "}
                  {oddsProof.prices.length >= 3
                    ? `${oddsProof.prices
                        .slice(0, 3)
                        .map((price) => price.toFixed(2))
                        .join(" / ")} — `
                    : ""}
                  latest record Merkle-proved (
                  {oddsProof.subTreeProofCount + oddsProof.mainTreeProofCount}{" "}
                  node(s))
                </li>
              ) : null}
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
