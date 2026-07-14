"use client";

import Link from "next/link";
import {
  FootballIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  animate,
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { KnockoutBracketLive } from "@/components/knockout-bracket-live";
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
  formatKickoffLabel,
  formatKickoffTime,
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
  doubleChanceLabel,
  handicapLineLabel,
  linePickLabel,
  MAX_SIDE_PICKS,
  PREDICTION_LINES,
  PREDICTION_POINTS,
  settlePrediction,
  SIDE_PICK_POINTS,
  sidePickPoints,
  winnerPoints,
  type DoubleChancePick,
  type MatchOutcome,
  type MatchPrediction,
  type SidePick,
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
import { matchClips } from "@/lib/match-media";
import { teamFlag, teamGlow } from "@/lib/team-visuals";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";
import { worldCupResults } from "@/lib/world-cup-results";

type MatchTab =
  | "head-to-head"
  | "knockout"
  | "lineups"
  | "overview"
  | "stats"
  | "timeline";

const MATCH_TABS: Array<{ label: string; value: MatchTab }> = [
  { label: "Overview", value: "overview" },
  { label: "Lineups", value: "lineups" },
  { label: "Stats", value: "stats" },
  { label: "Timeline", value: "timeline" },
  { label: "Knockout", value: "knockout" },
  { label: "Head-to-Head", value: "head-to-head" },
];

function matchTabFromLocation(): MatchTab {
  if (typeof window === "undefined") return "overview";

  const value = new URLSearchParams(window.location.search).get("tab");

  return MATCH_TABS.some((tab) => tab.value === value)
    ? (value as MatchTab)
    : "overview";
}

function formatPlayerDisplayName(name: string) {
  const commaIndex = name.indexOf(",");

  if (commaIndex === -1) {
    return name;
  }

  const lastName = name.slice(0, commaIndex).trim();
  const firstName = name.slice(commaIndex + 1).trim();

  return firstName && lastName ? `${firstName} ${lastName}` : name;
}

// TxLINE names are "Last, First"; compact surfaces (pitch markers, scorer
// chips) show just the family name.
function shortPlayerName(name: string) {
  const commaIndex = name.indexOf(",");

  if (commaIndex > 0) {
    return name.slice(0, commaIndex);
  }

  const parts = name.trim().split(/\s+/);

  return parts[parts.length - 1] || name;
}

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
  const [shareLabel, setShareLabel] = useState("Share");
  const [matchTab, setMatchTab] = useState<MatchTab>("overview");
  const now = useNow();
  const playCard = usePlayCard(fixtureId);

  useEffect(() => {
    const syncTabFromUrl = () => setMatchTab(matchTabFromLocation());

    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);

    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, [fixtureId]);

  const selectMatchTab = useCallback((tab: MatchTab) => {
    setMatchTab(tab);

    const url = new URL(window.location.href);

    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);

    window.history.pushState({}, "", url);
  }, []);

  // Manual-activation tablist keyboard pattern: arrows/Home/End move focus
  // between tabs, Enter/Space (native button click) selects - so arrowing
  // across the list doesn't push a history entry per step.
  const handleTabListKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const currentValue = (event.target as HTMLElement).id?.replace(
        "match-tab-",
        "",
      );
      const currentIndex = MATCH_TABS.findIndex(
        (tab) => tab.value === currentValue,
      );

      if (currentIndex === -1) {
        return;
      }

      const lastIndex = MATCH_TABS.length - 1;
      const nextIndex =
        event.key === "ArrowRight"
          ? (currentIndex + 1) % MATCH_TABS.length
          : event.key === "ArrowLeft"
            ? (currentIndex + lastIndex) % MATCH_TABS.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? lastIndex
                : null;

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      document
        .getElementById(`match-tab-${MATCH_TABS[nextIndex].value}`)
        ?.focus();
    },
    [],
  );

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

  const replayUpdates = details.historicalUpdates?.data?.length
    ? details.historicalUpdates
    : details.updates;
  // Scout corrections first: drop discarded events (disallowed goals, wrongly
  // logged corners) and apply amends (re-graded shot outcomes) so every
  // consumer below - stats, calls, feed - sees the corrected record of play.
  // Memoized (with the other feed folds below): the component re-renders at
  // least every 30s via useNow, and these walk 1000+ records per pass.
  const combinedUpdates = useMemo(
    () =>
      applyScoutCorrections(
        fillUnknownStats([...(replayUpdates?.data ?? []), ...streamUpdates]),
      ),
    [replayUpdates, streamUpdates],
  );
  const goals = useMemo(() => extractGoals(combinedUpdates), [combinedUpdates]);
  const playerDirectory: PlayerDirectory = useMemo(
    () =>
      new Map(
        (details.lineups?.data?.teams ?? []).flatMap((team) =>
          team.players
            .filter((player) => typeof player.playerId === "number")
            .map((player) => [
              player.playerId as number,
              { name: player.name, teamName: team.teamName },
            ]),
        ),
      ),
    [details.lineups],
  );
  const readableUpdates = useMemo(
    () =>
      fixture ? getDisplayUpdates(combinedUpdates, fixture, playerDirectory) : [],
    [combinedUpdates, fixture, playerDirectory],
  );

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
  const firstGoal = goals[0] ?? null;
  const lineupPlayers =
    details.lineups?.data?.teams.flatMap((team) => team.players) ?? [];
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
  type MatchStatRow = {
    away: number;
    awayDisplay?: string;
    home: number;
    homeDisplay?: string;
    label: string;
  };
  const topStatRows: MatchStatRow[] = [
    ...(possessionHomePct !== null
      ? [
          {
            away: 100 - possessionHomePct,
            awayDisplay: `${100 - possessionHomePct}%`,
            home: possessionHomePct,
            homeDisplay: `${possessionHomePct}%`,
            label: "Ball possession",
          },
        ]
      : []),
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
            label: "Corner kicks",
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
  ];
  const attackStatRows: MatchStatRow[] = [
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
  ];
  const defenceStatRows: MatchStatRow[] = [
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
  const goalkeepingStatRows: MatchStatRow[] = [
    ...(goalKicks.home + goalKicks.away > 0
      ? [
          { away: goalKicks.away, home: goalKicks.home, label: "Goal kicks" },
        ]
      : []),
  ];
  const statSections = [
    { label: "Top stats", rows: topStatRows },
    { label: "Attack", rows: attackStatRows },
    { label: "Defence", rows: defenceStatRows },
    { label: "Goalkeeping", rows: goalkeepingStatRows },
  ].filter((section) => section.rows.length > 0);
  const keyUpdatePattern =
    /goal|penalty|red card|yellow card|half ?time|full time|substitution/i;
  const overviewEvents = readableUpdates
    .filter((update) => keyUpdatePattern.test(update.text))
    .slice(-6)
    .reverse();
  const bracketScores = displayScore
    ? {
        [fixture.fixtureId]: {
          awayGoals: displayScore.awayGoals,
          clockSeconds: displayScore.clockSeconds,
          homeGoals: displayScore.homeGoals,
          statusId: displayScore.statusId,
        },
      }
    : {};
  // The play card quotes the live TxLINE board when it exists (closing prices
  // once finished), falling back to odds derived from the win probabilities.
  const playBoard = finished
    ? details.oddsUpdates?.data?.closingBoard ?? details.oddsUpdates?.data?.board
    : details.oddsUpdates?.data?.board;
  const playOdds = playBoard?.result
    ? {
        away: playBoard.result.away,
        draw: playBoard.result.draw,
        home: playBoard.result.home,
      }
    : details.odds?.data?.homeWinProbability &&
        details.odds.data.drawProbability &&
        details.odds.data.awayWinProbability
      ? {
          away: 100 / details.odds.data.awayWinProbability,
          draw: 100 / details.odds.data.drawProbability,
          home: 100 / details.odds.data.homeWinProbability,
        }
      : null;
  const playSection = (
    <PredictionSection
      key={fixture.fixtureId}
      calls={extractSettleableCalls(combinedUpdates)}
      fixture={fixture}
      now={now}
      outcome={outcome}
    />
  );

  const homeIso = teamFlag(fixture.homeTeam);
  const awayIso = teamFlag(fixture.awayTeam);
  const hadExtraTime = combinedUpdates.some(
    (update) =>
      update.statusId === 7 || update.statusId === 8 || update.statusId === 9,
  );
  const heroTeam = (side: "away" | "home") => {
    const iso = side === "home" ? homeIso : awayIso;
    const name = side === "home" ? fixture.homeTeam : fixture.awayTeam;

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
        <span className="mp2-hero-team-copy">
          <span className="mp2-hero-name">{name}</span>
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

      const rawName =
        (goal.playerId !== undefined
          ? playerDirectory.get(goal.playerId)?.name
          : undefined) ??
        (side === "home" ? fixture.homeTeam : fixture.awayTeam);
      const name = formatPlayerDisplayName(rawName);
      const minute =
        goal.clockSeconds !== undefined
          ? formatLiveMinute(goal.clockSeconds, goal.statusId)
          : "—";

      lines.set(name, [...(lines.get(name) ?? []), minute]);
    }

    return [...lines.entries()].map(([name, minutes]) => (
      <li key={name}>
        <span>{name}</span>
        <span className="mp2-event-time">{minutes.join(", ")}</span>
      </li>
    ));
  };
  // One real sending-off can emit several feed records: dedupe by eventId
  // when present, by PlayerId for records without one (single pass - the
  // feed holds 1000+ records by full time).
  const seenRedCardEventIds = new Set<number | string>();
  const seenRedCardPlayerIds = new Set<unknown>();
  const redCardEvents: Array<{
    key: number | string;
    minute: string;
    name: string;
    side: "away" | "home";
  }> = [];

  for (const update of combinedUpdates) {
    if (update.action !== "red_card") {
      continue;
    }

    const duplicate =
      (update.eventId !== undefined &&
        seenRedCardEventIds.has(update.eventId)) ||
      seenRedCardPlayerIds.has(update.data?.PlayerId);

    if (update.eventId !== undefined) {
      seenRedCardEventIds.add(update.eventId);
    } else {
      seenRedCardPlayerIds.add(update.data?.PlayerId);
    }

    if (duplicate) {
      continue;
    }

    const participant1IsHome = update.participant1IsHome !== false;
    const side =
      update.participant === 1
        ? participant1IsHome
          ? "home"
          : "away"
        : participant1IsHome
          ? "away"
          : "home";
    const playerId =
      typeof update.data?.PlayerId === "number"
        ? update.data.PlayerId
        : undefined;

    redCardEvents.push({
      key: update.eventId ?? `red-card-${update.seq}`,
      minute:
        update.clockSeconds !== undefined
          ? formatLiveMinute(update.clockSeconds, update.statusId)
          : "—",
      name: formatPlayerDisplayName(
        (playerId !== undefined
          ? playerDirectory.get(playerId)?.name
          : undefined) ??
          (side === "home" ? fixture.homeTeam : fixture.awayTeam),
      ),
      side,
    });
  }
  const heroRedCardLines = (side: "away" | "home") =>
    redCardEvents
      .filter((event) => event.side === side)
      .map((event) => (
        <li key={event.key}>
          <span>{event.name}</span>
          <span className="mp2-event-time">{event.minute}</span>
        </li>
      ));
  const clockRunning = matchClock?.running === true && !finished;
  // Before kickoff the snapshot is a meaningless 0-0; the hero shows the
  // kickoff time instead and the stats section waits for the match.
  const notStarted =
    displayState === "Not started" ||
    displayState === "Scheduled" ||
    (!displayScore && !isPastFixture(fixture));
  // Editable play experience: market cards in the main column, the live
  // ticket in the rail. Only before kickoff; afterwards PredictionSection
  // renders the locked/settled card.
  const preMatchPlay =
    notStarted && now !== null && !isPredictionLocked(fixture, now);
  const kickoff = new Date(fixture.kickoffUtc);
  const competitionLabel = formatCompetition(fixture)
    .replace(" > ", " ")
    .replace(/^World Cup\b/, "2026 World Cup")
    .replace("Semi-finals", "Semi-final")
    .replace("Quarter-finals", "Quarter-final")
    .replace("8th Finals", "Round of 16");
  const kickoffLabel = formatKickoffLabel(kickoff, now);
  const shareMatch = async () => {
    const url = window.location.href;
    const title = `${fixture.homeTeam} vs ${fixture.awayTeam}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }

      if (!navigator.clipboard?.writeText) {
        setShareLabel("Unavailable");
        return;
      }

      await navigator.clipboard.writeText(url);
      setShareLabel("Copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setShareLabel("Try again");
    }
  };
  return (
    <main className="mp2">
      <header className={`mp2-hero${notStarted ? " upcoming" : ""}`}>
        <h1 className="sr-only">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h1>
        <div className="mp2-hero-stage">
        {/* Decorative banner artwork: brand-coloured gradient washes and arc
            swooshes over near-black, FotMob-style. */}
        <svg
          aria-hidden
          className="mp2-hero-bg"
          fill="none"
          preserveAspectRatio="none"
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
            <Link
              className={buttonVariants({
                className: "mp2-hero-back",
                size: "default",
                variant: "ghost",
              })}
              href="/"
            >
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
              {competitionLabel}
            </span>
            <Button
              className="mp2-hero-action"
              onClick={shareMatch}
              size="default"
              type="button"
              variant="default"
            >
              <HugeiconsIcon aria-hidden icon={Share08Icon} strokeWidth={2} />
              {shareLabel}
            </Button>
          </div>
          <div className="mp2-hero-match">
            <div className="mp2-hero-grid">
              {heroTeam("home")}
              <div className="mp2-hero-center">
                {displayScore && !notStarted ? (
                  <div className="mp2-hero-score-row">
                    <span
                      aria-label={`${displayScore.homeRedCards} red card${displayScore.homeRedCards === 1 ? "" : "s"} for ${fixture.homeTeam}`}
                      className="mp2-hero-red-cards"
                      role="img"
                    >
                      {Array.from({ length: displayScore.homeRedCards }).map(
                        (_, index) => (
                          <span className="mp2-hero-red-card" key={index} />
                        ),
                      )}
                    </span>
                    <span className="mp2-hero-score" aria-label="Score">
                      {displayScore.homeGoals} - {displayScore.awayGoals}
                    </span>
                    <span
                      aria-label={`${displayScore.awayRedCards} red card${displayScore.awayRedCards === 1 ? "" : "s"} for ${fixture.awayTeam}`}
                      className="mp2-hero-red-cards"
                      role="img"
                    >
                      {Array.from({ length: displayScore.awayRedCards }).map(
                        (_, index) => (
                          <span className="mp2-hero-red-card" key={index} />
                        ),
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="mp2-hero-when">
                    <span className="mp2-hero-time">
                      {formatKickoffTime(kickoff.getTime())}
                    </span>
                    <span className="mp2-hero-kickoff-label">
                      {kickoffLabel}
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
            {goals.length || redCardEvents.length ? (
              <div className="mp2-hero-events">
                {goals.length ? (
                  <div className="mp2-hero-event-row">
                    <span aria-hidden className="mp2-hero-event-icon">
                      <svg viewBox="0 0 14 14">
                        <circle cx="7" cy="7" fill="none" r="6" />
                        <path d="M7 0a7 7 0 1 0 0 14A7 7 0 0 0 7 0Zm2.8 10.1-.9 1.2-1.5-.4-.4-1.5 1.2-.9 1.6.6v1Zm1.6-4.6.8 1.3-.8 1.3-1.5-.4V6l1.5-.5ZM7 2l1.3 1-.5 1.5H6.2L5.7 3 7 2ZM2.8 6.8l.8-1.3 1.5.5v1.7l-1.5.4-.8-1.3Zm1.4 3.3v-1l1.6-.6 1.2.9-.4 1.5-1.5.4-.9-1.2Z" />
                      </svg>
                    </span>
                    <ul className="mp2-event-list home">{heroGoalLines("home")}</ul>
                    <ul className="mp2-event-list away">{heroGoalLines("away")}</ul>
                  </div>
                ) : null}
                {redCardEvents.length ? (
                  <div className="mp2-hero-event-row">
                    <span aria-hidden className="mp2-hero-event-icon">
                      <svg viewBox="0 0 10 10">
                        <path d="M6.82.6H3.18c-.75 0-1.36.62-1.36 1.37v6.06c0 .75.61 1.36 1.36 1.36h3.64c.75 0 1.36-.61 1.36-1.36V1.97C8.18 1.22 7.57.6 6.82.6Z" fill="#dd3636" />
                      </svg>
                    </span>
                    <ul className="mp2-event-list home">{heroRedCardLines("home")}</ul>
                    <ul className="mp2-event-list away">{heroRedCardLines("away")}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <nav
          aria-label="Match sections"
          className="mp2-hero-tabs"
          onKeyDown={handleTabListKeyDown}
          role="tablist"
        >
          {MATCH_TABS.map((tab) => (
            <button
              // Only the selected tab's panel is in the DOM, and
              // aria-controls must not point at a missing id.
              aria-controls={
                matchTab === tab.value ? `match-panel-${tab.value}` : undefined
              }
              aria-current={matchTab === tab.value ? "page" : undefined}
              aria-selected={matchTab === tab.value}
              className={matchTab === tab.value ? "active" : undefined}
              id={`match-tab-${tab.value}`}
              key={tab.value}
              onClick={() => selectMatchTab(tab.value)}
              role="tab"
              tabIndex={matchTab === tab.value ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
        </div>
      </header>

      <section
        aria-labelledby={`match-tab-${matchTab}`}
        className={`mp2-tab-panel mp2-tab-panel-${matchTab}`}
        id={`match-panel-${matchTab}`}
        role="tabpanel"
      >
        {matchTab === "overview" ? (
          <div className="mp2-layout mp2-overview-layout">
            {/* The game is the product: before kickoff the market cards fill
                the main column and the live ticket rides the sticky rail.
                After full time the result leads the main column; live
                matches keep the locked card in the rail. */}
            <div className="mp2-main">
              {preMatchPlay && fixture ? (
                <MarketCards
                  board={playBoard}
                  draft={playCard.draft}
                  fixture={fixture}
                  lineups={details.lineups?.data ?? null}
                  odds1x2={playOdds}
                  patchDraft={playCard.patchDraft}
                />
              ) : null}

              {finished ? playSection : null}

              {finished ? (
                <MatchMediaSection fixtureId={fixture.fixtureId} />
              ) : null}

              {preMatchPlay ? <HeadToHeadSection fixture={fixture} /> : null}

              <section className="card mp2-overview-card" aria-labelledby="glance-heading">
                <div className="mp2-card-heading">
                  <h2 id="glance-heading">Match at a glance</h2>
                  <Button
                    className="mp2-card-link"
                    onClick={() => selectMatchTab("stats")}
                    size="sm"
                    variant="ghost"
                  >
                    Full stats <span aria-hidden>→</span>
                  </Button>
                </div>
                {/* TxLINE publishes a 0-0 snapshot before kickoff, so check
                    notStarted first or the card shows meaningless zero rows. */}
                {notStarted ? (
                  <p className="muted">
                    Match statistics will appear after kickoff.
                  </p>
                ) : topStatRows.length ? (
                  <div className="mp2-glance-stats">
                    {topStatRows.slice(0, 4).map((row) => (
                      <div className="mp2-glance-stat" key={row.label}>
                        <strong>{row.homeDisplay ?? row.home}</strong>
                        <span>{row.label}</span>
                        <strong>{row.awayDisplay ?? row.away}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No match statistics are available yet.</p>
                )}
              </section>

              <section className="card mp2-overview-card" aria-labelledby="moments-heading">
                <div className="mp2-card-heading">
                  <h2 id="moments-heading">Key moments</h2>
                  <Button
                    className="mp2-card-link"
                    onClick={() => selectMatchTab("timeline")}
                    size="sm"
                    variant="ghost"
                  >
                    Full timeline <span aria-hidden>→</span>
                  </Button>
                </div>
                {overviewEvents.length ? (
                  <ol className="mp2-overview-events">
                    {overviewEvents.map((update) => (
                      <li key={update.id}>{update.text}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">No key match events yet.</p>
                )}
              </section>
            </div>

            <aside className="mp2-side">
              {finished ? (
                <OfficialHighlightsCard
                  awayTeam={fixture.awayTeam}
                  homeTeam={fixture.homeTeam}
                  kickoffUtc={fixture.kickoffUtc}
                />
              ) : null}

              {preMatchPlay ? (
                <TicketCard
                  draft={playCard.draft}
                  fixture={fixture}
                  odds1x2={playOdds}
                  onSave={playCard.save}
                  saved={Boolean(playCard.saved)}
                />
              ) : !finished ? (
                playSection
              ) : null}

              <MatchInfoSection fixture={fixture} info={matchInfo} />
            </aside>
          </div>
        ) : null}

        {matchTab === "lineups" ? (
          <div className="mp2-tab-stack">
            <LineupsSection
              goals={goals}
              lineups={details.lineups}
              playerStats={details.score?.data?.playerStats}
              redCards={redCardedPlayerIds}
              substitutions={substitutions}
              yellowCards={yellowCardCounts}
            />
          </div>
        ) : null}

        {matchTab === "stats" ? (
          <div className="mp2-tab-stack">
            <section className="card mp2-stats-card" aria-labelledby="stats-heading">
              <h2 className="mp2-stats-title" id="stats-heading">Stats</h2>
              {notStarted ? (
                <p className="muted">Stats appear once the match kicks off.</p>
              ) : statSections.length ? (
                <>
                  <div className="mp2-stat-sections">
                    {statSections.map((section) => (
                      <section className="mp2-stat-section" key={section.label}>
                        <h3 className="mp2-stat-section-title">{section.label}</h3>
                        {section.rows.map((row) => {
                          const total = row.home + row.away;
                          const homeWidth = total > 0 ? (row.home / total) * 100 : 50;
                          const awayWidth = total > 0 ? (row.away / total) * 100 : 50;

                          return (
                            <div
                              aria-label={`${row.label}: ${fixture.homeTeam} ${row.homeDisplay ?? row.home}, ${fixture.awayTeam} ${row.awayDisplay ?? row.away}`}
                              className="mp2-stat-row"
                              key={row.label}
                              role="img"
                            >
                              <div className="mp2-stat-values">
                                <span>{row.homeDisplay ?? row.home}</span>
                                <span>{row.label}</span>
                                <span>{row.awayDisplay ?? row.away}</span>
                              </div>
                              <div className="mp2-stat-bars" aria-hidden="true">
                                <span className="mp2-stat-track home">
                                  <span
                                    className={row.home > row.away ? "leading" : ""}
                                    style={{ width: `${homeWidth}%` }}
                                  />
                                </span>
                                <span className="mp2-stat-track away">
                                  <span
                                    className={row.away > row.home ? "leading" : ""}
                                    style={{ width: `${awayWidth}%` }}
                                  />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                  {possessionHomePct !== null || freeKicks.home + freeKicks.away > 0 ? (
                    <p className="muted">
                      Possession is ball-in-play time from TxLINE possession-phase
                      events; fouls are free kicks conceded to the opponent.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>No stats available.</p>
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
          </div>
        ) : null}

        {matchTab === "timeline" ? (
          <div className="mp2-tab-stack">
            <div className="mp2-timeline-grid">
              <div className="mp2-timeline-main">
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
              </div>
              <aside className="mp2-timeline-side">
                <GoalCallsSection
                  key={`calls-${fixture.fixtureId}`}
                  calls={liveCalls}
                  fixtureId={fixture.fixtureId}
                  live={liveStreamEligible}
                />
              </aside>
            </div>

            <VerificationSection
              detailsLoading={detailsLoading}
              displayScore={displayScore}
              finished={finished}
              fixture={fixture}
              fixtureValidation={details.fixtureValidation}
              historicalUpdates={details.historicalUpdates}
              liveStreamEligible={liveStreamEligible}
              oddsSource={details.odds?.source ?? details.odds?.error ?? "Pending"}
              oddsUpdates={details.oddsUpdates}
              oddsValidation={details.oddsValidation}
              scoreSource={scoreSource}
              streamStatus={streamStatus}
              streamUpdateCount={streamUpdates.length}
              updates={details.updates}
              validation={details.validation}
            />
          </div>
        ) : null}

        {matchTab === "knockout" ? (
          <section className="card mp2-bracket-tab" aria-labelledby="bracket-heading">
            <h2 id="bracket-heading">Tournament bracket</h2>
            <KnockoutBracketLive
              fixtures={fixtures}
              now={now}
              scores={bracketScores}
            />
          </section>
        ) : null}

        {matchTab === "head-to-head" ? (
          <HeadToHeadSection fixture={fixture} />
        ) : null}
      </section>
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

type FifaHighlight = {
  publishDate?: string;
  subtitle?: string;
  thumbnail?: string;
  title: string;
  url: string;
};

type FifaHighlightsResponse = {
  accessible: FifaHighlight | null;
  official: FifaHighlight | null;
  status: "published" | "pending" | "not-found";
};

// Optional regional partner clips remain in the main match column.
function MatchMediaSection({ fixtureId }: { fixtureId: number }) {
  const clip = matchClips[fixtureId];

  if (!clip) {
    return null;
  }

  return (
    <div className="mp2-media">
      <a
        className="card mp2-clip"
        href={clip.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={clip.title} className="mp2-clip-thumb" src={clip.thumbnail} />
        <div className="mp2-clip-head">
          <h3 className="mp2-clip-title">{clip.title}</h3>
          <span className="mp2-clip-label">Highlights</span>
        </div>
      </a>
    </div>
  );
}

// FIFA's official card lives in the sidebar and appears only after the real
// highlights have been published. Pending and missing responses stay hidden.
function OfficialHighlightsCard({
  awayTeam,
  homeTeam,
  kickoffUtc,
}: {
  awayTeam: string;
  homeTeam: string;
  kickoffUtc: string;
}) {
  const [fifa, setFifa] = useState<FifaHighlightsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      away: awayTeam,
      home: homeTeam,
      kickoff: kickoffUtc,
    });

    fetch(`/api/fifa/highlights?${params.toString()}`)
      .then((response) => response.json())
      .then((data: FifaHighlightsResponse) => {
        if (!cancelled) setFifa(data);
      })
      .catch(() => {
        if (!cancelled)
          setFifa({ accessible: null, official: null, status: "not-found" });
      });

    return () => {
      cancelled = true;
    };
  }, [awayTeam, homeTeam, kickoffUtc]);

  const official = fifa?.official ?? null;

  if (!official) {
    return null;
  }

  return (
    <a
      aria-label={`Official highlights: ${homeTeam} vs ${awayTeam}`}
      className="card mp2-official mp2-side-official"
      href={official.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="mp2-official-thumb">
        {official.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={official.thumbnail} />
        ) : (
          <span className="mp2-official-placeholder" aria-hidden>
            {homeTeam} v {awayTeam}
          </span>
        )}
        <svg
          aria-hidden
          className="mp2-official-play"
          fill="none"
          height="48"
          viewBox="0 0 48 48"
          width="48"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g clipPath="url(#mp2-official-play-clip)">
            <path
              d="M23.999 4C20.0434 4.0002 16.1767 5.17335 12.8879 7.37109C9.59902 9.56884 7.03573 12.6925 5.52213 16.347C4.00853 20.0016 3.61261 24.0229 4.38443 27.9024C5.15624 31.782 7.06114 35.3455 9.85823 38.1425C12.6553 40.9394 16.219 42.8441 20.0986 43.6158C23.9782 44.3874 27.9994 43.9913 31.6539 42.4775C35.3084 40.9637 38.4319 38.4002 40.6295 35.1113C42.827 31.8223 44 27.9556 44 24C43.9979 18.6961 41.8899 13.6102 38.1394 9.85986C34.389 6.10956 29.3028 4.00186 23.999 4ZM19.9996 31.0004V17.0005C20.0003 16.8151 20.0524 16.6334 20.1501 16.4757C20.2478 16.3181 20.3873 16.1906 20.5531 16.1074C20.7189 16.0243 20.9045 15.9887 21.0893 16.0046C21.2741 16.0206 21.4509 16.0875 21.6 16.1979L30.9403 23.1983C31.0659 23.2905 31.1681 23.4109 31.2386 23.55C31.309 23.689 31.3457 23.8426 31.3457 23.9985C31.3457 24.1543 31.309 24.308 31.2386 24.447C31.1681 24.586 31.0659 24.7065 30.9403 24.7987L21.6 31.7991C21.4512 31.9093 21.2748 31.9761 21.0903 31.9923C20.9059 32.0084 20.7206 31.9732 20.5549 31.8905C20.3892 31.8078 20.2497 31.6809 20.1517 31.5238C20.0537 31.3667 20.001 31.1856 19.9996 31.0004Z"
              fill="white"
            />
          </g>
          <defs>
            <clipPath id="mp2-official-play-clip">
              <rect fill="white" height="48" width="48" />
            </clipPath>
          </defs>
        </svg>
      </div>
      <span className="mp2-official-copy">
        <span className="mp2-official-matchup">
          {homeTeam} vs. {awayTeam}
        </span>
        <span className="mp2-official-label">Highlights</span>
      </span>
    </a>
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

function LineupGoalIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <circle cx="7" cy="7" fill="#fff" r="5.25" />
      <path
        d="M7 1.17a5.83 5.83 0 1 0 0 11.66A5.83 5.83 0 0 0 7 1.17Zm-.28 1.1.16.55a.35.35 0 0 0 .28.23c.65.1 1.28.29 1.87.58.1.05.21.05.32-.02l.53-.38a4.72 4.72 0 0 1-.68 7.5 4.8 4.8 0 0 1-2 .99l-.13-.4-.03-.11a.35.35 0 0 0-.33-.29 3.68 3.68 0 0 1-1.87-.61.38.38 0 0 0-.39.03l-.4.38a4.72 4.72 0 0 1 2.65-8.45Zm-.7 4.34c.02.11 0 .22-.09.3L4.67 8.1a.29.29 0 0 1-.38.01A3.42 3.42 0 0 1 3.19 7a.25.25 0 0 1-.08-.13c0-.64.17-1.26.49-1.81a.29.29 0 0 1 .2-.14c.38-.15.78-.23 1.18-.23.12 0 .25 0 .38.02.14.01.25.12.27.26l.39 1.64Zm1.65.88c-.03-.16.02-.31.14-.42l1.37-1.22a.3.3 0 0 1 .41 0c.46.25.87.58 1.22.97.08.1.12.21.12.34a3.4 3.4 0 0 1-.58 1.91.57.57 0 0 1-.3.27c-.38.11-.77.16-1.16.16-.17 0-.33-.01-.5-.03a.31.31 0 0 1-.23-.19l-.49-1.79Z"
        fill="#222"
      />
    </svg>
  );
}

function LineupCardIcon({ color }: { color: "red" | "yellow" }) {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <rect
        fill={color === "red" ? "#e55e5b" : "#ffce2c"}
        height="10.8"
        rx="2"
        width="8.3"
        x="2.85"
        y="1.6"
      />
    </svg>
  );
}

function LineupSubstitutionIcon({ direction }: { direction: "in" | "out" }) {
  return (
    <svg
      aria-hidden="true"
      height="12"
      style={{ transform: direction === "in" ? "rotate(180deg)" : undefined }}
      viewBox="0 0 12 12"
      width="12"
    >
      <path
        d="M6 .17A5.83 5.83 0 1 1 6 11.83 5.83 5.83 0 0 1 6 .17ZM2.75 6c0 .17.07.33.2.45l2.14 2.1a.53.53 0 0 0 .9-.36.52.52 0 0 0-.17-.38l-.75-.73-.72-.57 1.3.06h3.07a.56.56 0 1 0 0-1.13H5.65l-1.3.06.71-.57.76-.73a.52.52 0 0 0 .17-.38.52.52 0 0 0-.52-.52.55.55 0 0 0-.38.15L2.95 5.55a.6.6 0 0 0-.2.45Z"
        fill={direction === "in" ? "#33c771" : "#e55e5b"}
      />
    </svg>
  );
}

function LineupGoalMark() {
  return (
    <svg
      aria-hidden="true"
      className="mp2-lineup-goal-mark"
      viewBox="0 0 316 174"
    >
      <g fill="currentColor" transform="translate(84.168)">
        <path d="M57 0h5.907v50.136a5.92 5.92 0 0 0 5.907 5.9H192.85a5.92 5.92 0 0 0 5.907-5.9V0h5.907v50.136a11.84 11.84 0 0 1-11.813 11.8H68.813A11.84 11.84 0 0 1 57 50.136z" transform="translate(-57)" />
      </g>
      <path
        d="M11.813 150.407h90.813a76.778 76.778 0 0 0 110.748 0h90.813A11.839 11.839 0 0 0 316 138.61V0h-5.906v138.61a5.92 5.92 0 0 1-5.907 5.9H11.813a5.92 5.92 0 0 1-5.907-5.9V0H0v138.61a11.84 11.84 0 0 0 11.813 11.797zm193 0a70.761 70.761 0 0 1-93.619 0z"
        fill="currentColor"
      />
    </svg>
  );
}

function LineupPlayerAvatar({
  imageUrl,
  name,
  size = "lg",
}: {
  imageUrl?: string;
  name: string;
  size?: "default" | "lg";
}) {
  return (
    <Avatar
      aria-hidden="true"
      className="mp2-lineup-avatar after:border-0"
      size={size}
    >
      {imageUrl ? <AvatarImage alt="" src={imageUrl} /> : null}
      <AvatarFallback className="mp2-lineup-avatar-fallback">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="18" fill="currentColor" r="9" />
          <path d="M8 45c1.3-10 7-15 16-15s14.7 5 16 15H8Z" fill="currentColor" />
        </svg>
        <span className="mp2-lineup-avatar-label">{name.charAt(0)}</span>
      </AvatarFallback>
    </Avatar>
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
  const [lineupFilter, setLineupFilter] = useState<
    "age" | "club" | "season" | "value"
  >("season");
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
  const playerGoalCount = (playerId?: number) =>
      statLine(playerId)?.goals ??
      (playerId !== undefined ? goalCounts.get(playerId) : undefined) ??
      0;
  const playerYellowCount = (playerId?: number) =>
      statLine(playerId)?.yellowCards ??
      (playerId !== undefined ? yellowCards.get(playerId) : undefined) ??
      0;
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

  type LineupPlayer = NormalizedLineups["teams"][number]["players"][number];
  const fullName = (player: LineupPlayer) =>
    formatPlayerDisplayName(player.name);
  const pitchName = (player: LineupPlayer) => shortPlayerName(player.name);
  const playerAge = (player: LineupPlayer) => {
    if (!player.dateOfBirth) return null;

    const birthDate = new Date(player.dateOfBirth);

    if (Number.isNaN(birthDate.getTime())) return null;

    const now = new Date();
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const beforeBirthday =
      now.getUTCMonth() < birthDate.getUTCMonth() ||
      (now.getUTCMonth() === birthDate.getUTCMonth() &&
        now.getUTCDate() < birthDate.getUTCDate());

    if (beforeBirthday) age -= 1;

    return age;
  };
  const formation = (players: LineupPlayer[]) => {
    const starters = players.filter((player) => player.starter);
    const counts = ["DEF", "MID", "FWD"].map(
      (position) =>
        starters.filter((player) => player.position === position).length,
    );

    return counts.some(Boolean) ? counts.join("-") : "Starting XI";
  };
  const pitchRows = (players: LineupPlayer[], isHome: boolean) => {
    const starters = players.filter((player) => player.starter);
    const positions = ["GK", "DEF", "MID", "FWD"] as const;
    const rows = positions
      .map((position) => ({
        players: starters.filter((player) => player.position === position),
        position,
      }))
      .filter((row) => row.players.length > 0);
    const positioned = new Set(rows.flatMap((row) => row.players));
    const unpositioned = starters.filter((player) => !positioned.has(player));

    if (unpositioned.length) {
      rows.splice(Math.min(2, rows.length), 0, {
        players: unpositioned,
        position: "MID",
      });
    }

    return isHome ? rows : [...rows].reverse();
  };
  const filterValue = (player: LineupPlayer) => {
    if (lineupFilter === "age") {
      return playerAge(player);
    }

    return null;
  };
  const renderPitchEvents = (player: LineupPlayer) => {
    const goals = playerGoalCount(player.playerId);
    const yellows = playerYellowCount(player.playerId);
    const red = hasRed(player.playerId);

    return (
      <>
        {goals > 0 ? (
          <span className="mp2-lineup-event mp2-lineup-event-goal">
            {Array.from({ length: goals }, (_, index) => (
              <LineupGoalIcon key={index} />
            ))}
          </span>
        ) : null}
        {yellows > 0 || red ? (
          <span className="mp2-lineup-event mp2-lineup-event-card">
            {yellows > 0 ? <LineupCardIcon color="yellow" /> : null}
            {red ? <LineupCardIcon color="red" /> : null}
          </span>
        ) : null}
      </>
    );
  };
  const renderPitchPlayer = (player: LineupPlayer, side: "away" | "home") => {
    const subMinute =
      typeof player.playerId === "number"
        ? subOffMinutes.get(player.playerId)
        : undefined;
    const value = filterValue(player);
    const displayName = pitchName(player);

    return (
      <div
        aria-label={`${fullName(player)}, number ${player.number ?? "unknown"}${subMinute ? `, substituted at ${subMinute}` : ""}`}
        className={`mp2-lineup-player ${side}`}
        key={`${player.playerId}-${player.name}`}
        role="listitem"
      >
        <span className="mp2-lineup-player-marker">
          <LineupPlayerAvatar
            imageUrl={player.imageUrl}
            name={fullName(player)}
          />
          {subMinute ? (
            <span className="mp2-lineup-sub-badge">
              <span>{subMinute}</span>
              <LineupSubstitutionIcon direction="out" />
            </span>
          ) : null}
          {value !== null ? (
            <span className="mp2-lineup-filter-value" title="Age">
              {value}
            </span>
          ) : null}
          {renderPitchEvents(player)}
        </span>
        <span
          className="mp2-lineup-player-name"
          title={fullName(player)}
        >
          <span>{player.number ?? "—"}</span>
          {" "}
          {displayName}
        </span>
      </div>
    );
  };
  const renderBenchPlayer = (
    player: LineupPlayer | undefined,
    side: "away" | "home",
  ) => {
    if (!player) {
      return <span className="mp2-lineup-bench-empty" aria-hidden="true" />;
    }

    const subMinute =
      typeof player.playerId === "number"
        ? subOnMinutes.get(player.playerId)
        : undefined;
    const value = filterValue(player);
    const positionLabel = {
      DEF: "Defender",
      FWD: "Attacker",
      GK: "Keeper",
      MID: "Midfielder",
    }[player.position ?? "MID"];

    return (
      <div className={`mp2-lineup-bench-player ${side}`}>
        <LineupPlayerAvatar
          imageUrl={player.imageUrl}
          name={fullName(player)}
          size="default"
        />
        {value !== null ? (
          <span className="mp2-lineup-bench-filter-value" title="Age">
            {value}
          </span>
        ) : null}
        <span className="mp2-lineup-bench-copy">
          <strong>
            <span>{player.number ?? "—"}</span>
            {fullName(player)}
          </strong>
          <span>{positionLabel}</span>
        </span>
        {subMinute ? (
          <span className="mp2-lineup-bench-sub">
            <span>{subMinute}</span>
            <LineupSubstitutionIcon direction="in" />
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <section className="card mp2-lineup-card" aria-labelledby="lineups-heading">
      <h2 className="mp2-lineup-accessible-title" id="lineups-heading">
        Lineups
      </h2>
      {teams?.length ? (
        (() => {
            const home = teams.find((team) => team.isHome) ?? teams[0];
            const away = teams.find((team) => !team.isHome) ?? teams[1];

            if (!home || !away) {
              return null;
            }

            const homeIso = teamFlag(home.teamName);
            const awayIso = teamFlag(away.teamName);
            const homeBench = home.players.filter((player) => !player.starter);
            const awayBench = away.players.filter((player) => !player.starter);
            const wasSubbedOn = (player: LineupPlayer) =>
              typeof player.playerId === "number" &&
              subOnMinutes.has(player.playerId);
            const homeSubstitutes = homeBench.filter(wasSubbedOn);
            const awaySubstitutes = awayBench.filter(wasSubbedOn);
            const homeUnused = homeBench.filter((player) => !wasSubbedOn(player));
            const awayUnused = awayBench.filter((player) => !wasSubbedOn(player));
            const renderBenchSection = (
              title: string,
              homePlayers: LineupPlayer[],
              awayPlayers: LineupPlayer[],
            ) => {
              const rows = Math.max(homePlayers.length, awayPlayers.length);

              if (!rows) return null;

              return (
                <section className="mp2-lineup-bench" aria-label={title}>
                  <h3>{title}</h3>
                  <div className="mp2-lineup-bench-list">
                    {Array.from({ length: rows }).map((_, index) => (
                      <div className="mp2-lineup-bench-row" key={index}>
                        {renderBenchPlayer(homePlayers[index], "home")}
                        {renderBenchPlayer(awayPlayers[index], "away")}
                      </div>
                    ))}
                  </div>
                </section>
              );
            };

            return (
              <div className="mp2-lineup">
                <div className="mp2-lineup-header">
                  {[home, away].map((team) => {
                    const iso = team.isHome ? homeIso : awayIso;

                    return (
                      <div
                        className={`mp2-lineup-team-summary ${team.isHome ? "home" : "away"}`}
                        key={team.teamName}
                      >
                        {iso ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt=""
                            src={`https://flagcdn.com/w80/${iso}.png`}
                          />
                        ) : (
                          <span className="mp2-lineup-team-placeholder" />
                        )}
                        <span className="mp2-lineup-team-copy">
                          <strong>{team.teamName}</strong>
                          <small>{formation(team.players)}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mp2-lineup-filters" aria-label="Lineup details">
                  {([
                    ["season", "Season stats"],
                    ["value", "Transfer value"],
                    ["age", "Age"],
                    ["club", "Club"],
                  ] as const).map(([value, label]) => {
                    const supported = value === "age" || value === "season";

                    return (
                      <Button
                        aria-pressed={lineupFilter === value}
                        className="mp2-lineup-filter-button"
                        disabled={!supported}
                        key={value}
                        onClick={() => setLineupFilter(value)}
                        size="sm"
                        title={
                          supported
                            ? undefined
                            : `${label} is not supplied by TxLINE`
                        }
                        variant={lineupFilter === value ? "secondary" : "ghost"}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>

                <div className="mp2-lineup-pitch" role="group" aria-label="Starting lineups">
                  <span className="mp2-lineup-goal home" aria-hidden="true">
                    <LineupGoalMark />
                  </span>
                  <span className="mp2-lineup-midfield" aria-hidden="true" />
                  <span className="mp2-lineup-goal away" aria-hidden="true">
                    <LineupGoalMark />
                  </span>
                  <div className="mp2-lineup-half home" role="list" aria-label={`${home.teamName} starting lineup`}>
                    {pitchRows(home.players, true).map((row, index) => (
                      <div className="mp2-lineup-row" key={`${row.position}-${index}`}>
                        {row.players.map((player) =>
                          renderPitchPlayer(player, "home"),
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mp2-lineup-half away" role="list" aria-label={`${away.teamName} starting lineup`}>
                    {pitchRows(away.players, false).map((row, index) => (
                      <div className="mp2-lineup-row" key={`${row.position}-${index}`}>
                        {row.players.map((player) =>
                          renderPitchPlayer(player, "away"),
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {renderBenchSection(
                  "Substitutes",
                  homeSubstitutes,
                  awaySubstitutes,
                )}
                {renderBenchSection("Bench", homeUnused, awayUnused)}
              </div>
            );
          })()
      ) : (
        <p className="muted">
          No lineups from TxLINE yet:{" "}
          {lineups?.error ?? lineups?.source ?? "pending"}.
        </p>
      )}
    </section>
  );
}

// Local prediction-card state shared by the market cards (main column) and
// the live ticket (rail). Lazy-reads localStorage once per fixture.
function usePlayCard(fixtureId: number) {
  const [state, setState] = useState(() => ({
    confirmation: "",
    draft: loadPrediction(fixtureId) ?? defaultPrediction(fixtureId),
    fixtureId,
    saved: loadPrediction(fixtureId),
  }));

  // Render-phase reset when navigating between fixtures.
  if (state.fixtureId !== fixtureId) {
    setState({
      confirmation: "",
      draft: loadPrediction(fixtureId) ?? defaultPrediction(fixtureId),
      fixtureId,
      saved: loadPrediction(fixtureId),
    });
  }

  const patchDraft = useCallback(
    (recipe: (previous: MatchPrediction) => MatchPrediction) => {
      setState((previous) => ({ ...previous, draft: recipe(previous.draft) }));
    },
    [],
  );

  const save = useCallback(
    (odds1x2: { away: number; draw: number; home: number } | null) => {
      setState((previous) => {
        const prediction: MatchPrediction = {
          ...previous.draft,
          fixtureId,
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

        return {
          ...previous,
          confirmation:
            "Picks saved on this device. You can edit them until kickoff.",
          draft: prediction,
          saved: prediction,
        };
      });
    },
    [fixtureId],
  );

  return {
    confirmation: state.confirmation,
    draft: state.draft,
    patchDraft,
    save,
    saved: state.saved,
  };
}

// The same simulated trio as the homepage leaderboard. Until leagues have a
// backend, their winner picks are derived deterministically from the fixture
// (stable across reloads, no randomness) and labelled as simulated.
const LEAGUE_RIVALS = ["Amina", "Sam", "Noah"] as const;

function rivalWinnerPick(fixtureId: number, name: string): WinnerPick {
  let hash = 5381;

  for (const char of `${fixtureId}:${name}`) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }

  const roll = hash % 100;

  return roll < 45 ? "home" : roll < 70 ? "draw" : "away";
}

// Pre-kickoff market cards for the main column: one plain card per market
// family, consistent with every other card on the page.
function MarketCards({
  board,
  draft,
  fixture,
  lineups,
  odds1x2,
  patchDraft,
}: {
  board: OddsBoard | undefined;
  draft: MatchPrediction;
  fixture: WorldCupFixture;
  lineups: NormalizedLineups | null;
  odds1x2: { away: number; draw: number; home: number } | null;
  patchDraft: (recipe: (previous: MatchPrediction) => MatchPrediction) => void;
}) {
  const homeIso = teamFlag(fixture.homeTeam);
  const awayIso = teamFlag(fixture.awayTeam);
  const draftSidePicks = draft.sidePicks ?? [];
  const sideOfferRows = buildSideOffers(board, fixture);
  const toggleSidePick = (offer: SideOffer) => {
    patchDraft((previous) => {
      const existing = previous.sidePicks ?? [];
      const already = existing.some(
        (pick) => sidePickKey(pick) === offer.key,
      );
      // One outcome per market: taking a line's "over" drops its "under".
      const cleared = existing.filter(
        (pick) => sidePickMarketKey(pick) !== offer.marketKey,
      );

      if (already) {
        return { ...previous, sidePicks: cleared };
      }

      if (cleared.length >= MAX_SIDE_PICKS) {
        return previous;
      }

      return { ...previous, sidePicks: [...cleared, offer.pick] };
    });
  };
  const goalsBoardLine = board?.overUnder?.find(
    (entry) =>
      entry.line === PREDICTION_LINES.goals && entry.prices.length >= 2,
  );
  const totalsRows: Array<{
    field: "totalCards" | "totalCorners" | "totalGoals";
    label: string;
    line: number;
    prices?: number[];
  }> = [
    {
      field: "totalGoals",
      label: "Goals",
      line: PREDICTION_LINES.goals,
      prices: goalsBoardLine?.prices,
    },
    { field: "totalCorners", label: "Corners", line: PREDICTION_LINES.corners },
    { field: "totalCards", label: "Cards", line: PREDICTION_LINES.cards },
  ];
  const scorerGroups = (lineups?.teams ?? [])
    .map((team) => ({
      players: team.players
        .filter((player) => typeof player.playerId === "number")
        .sort((left, right) => Number(right.starter) - Number(left.starter)),
      teamName: team.teamName,
    }))
    .filter((team) => team.players.length > 0);
  const resultShares = impliedShares([
    odds1x2?.home,
    odds1x2?.draw,
    odds1x2?.away,
  ]);
  const resultLead = leadIndex(resultShares);
  // Your league's winner picks: the simulated trio plus your current call,
  // so switching your pick updates the tally live.
  const winnerNames: Record<WinnerPick, string> = {
    away: fixture.awayTeam,
    draw: "a draw",
    home: fixture.homeTeam,
  };
  const leaguePicks: Array<{ name: string; pick: WinnerPick }> = [
    ...LEAGUE_RIVALS.map((name) => ({
      name,
      pick: rivalWinnerPick(fixture.fixtureId, name),
    })),
    { name: "You", pick: draft.winner },
  ];
  const leagueCounts = leaguePicks.reduce<Record<WinnerPick, number>>(
    (counts, member) => {
      counts[member.pick] += 1;

      return counts;
    },
    { away: 0, draw: 0, home: 0 },
  );
  const leagueModal = (
    Object.keys(leagueCounts) as WinnerPick[]
  ).reduce((best, pick) =>
    leagueCounts[pick] > leagueCounts[best] ? pick : best,
  );
  const leagueMembers = leaguePicks.filter(
    (member) => member.pick === leagueModal,
  );
  // Double-chance covers two outcomes; its implied chance is their sum.
  const dcShare = (pick: DoubleChancePick): number | null => {
    const [home, draw, away] = resultShares;
    const pair: Record<DoubleChancePick, [number | null, number | null]> = {
      draw_away: [draw, away],
      home_away: [home, away],
      home_draw: [home, draw],
    };
    const [first, second] = pair[pick];

    return first === null || second === null ? null : first + second;
  };

  return (
    <>
      <section aria-labelledby="market-result-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-result-heading">Match result</h2>
          <span className="mp2-card-hint">
            bold winner calls pay more · exact score +
            {PREDICTION_POINTS.exactScore} pts
          </span>
        </div>
        <div
          className="mp2-play-panel"
          style={
            {
              "--glow-away": (awayIso && teamGlow[awayIso]) || "#3b3b46",
              "--glow-home": (homeIso && teamGlow[homeIso]) || "#3b3b46",
            } as CSSProperties
          }
        >
          <div className="mp2-play-teams">
            <div className="mp2-play-team">
              {homeIso ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="mp2-play-flag"
                  src={`https://flagcdn.com/w80/${homeIso}.png`}
                />
              ) : (
                <span className="mp2-play-flag mp2-play-flag-tbd" />
              )}
              <span className="mp2-play-team-name">{fixture.homeTeam}</span>
            </div>
            <div className="mp2-play-center">
              <div className="mp2-play-scores">
                <GoalStepper
                  label={fixture.homeTeam}
                  onChange={(value) =>
                    patchDraft((previous) => ({
                      ...previous,
                      homeGoals: value,
                    }))
                  }
                  value={draft.homeGoals}
                />
                <GoalStepper
                  label={fixture.awayTeam}
                  onChange={(value) =>
                    patchDraft((previous) => ({
                      ...previous,
                      awayGoals: value,
                    }))
                  }
                  value={draft.awayGoals}
                />
              </div>
              <span className="mp2-play-exact-hint">
                Exact score +{PREDICTION_POINTS.exactScore}
              </span>
            </div>
            <div className="mp2-play-team">
              {awayIso ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="mp2-play-flag"
                  src={`https://flagcdn.com/w80/${awayIso}.png`}
                />
              ) : (
                <span className="mp2-play-flag mp2-play-flag-tbd" />
              )}
              <span className="mp2-play-team-name">{fixture.awayTeam}</span>
            </div>
          </div>
          <div className="mp2-odds-row cols-3 mp2-play-result">
            {(
              [
                { label: fixture.homeTeam, value: "home" },
                { label: "Draw", value: "draw" },
                { label: fixture.awayTeam, value: "away" },
              ] as const
            ).map((option, index) => (
              <OddsButton
                active={draft.winner === option.value}
                key={option.value}
                label={option.label}
                leading={index === resultLead}
                onClick={() =>
                  patchDraft((previous) => ({
                    ...previous,
                    winner: option.value,
                  }))
                }
                points={winnerPoints(odds1x2?.[option.value])}
                share={resultShares[index]}
              />
            ))}
          </div>
        </div>
        <p className="mp2-league-picks">
          <span aria-hidden className="mp2-league-avatars">
            {leagueMembers.map((member) => (
              <span
                className={`mp2-league-avatar${member.name === "You" ? " you" : ""}`}
                key={member.name}
              >
                {member.name[0]}
              </span>
            ))}
          </span>
          <span className="mp2-league-copy">
            <strong>
              {leagueMembers.length} of {leaguePicks.length}
            </strong>{" "}
            in your league took {winnerNames[leagueModal]}
            <em> · simulated</em>
          </span>
        </p>
      </section>

      <section aria-labelledby="market-totals-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-totals-heading">Totals</h2>
          <span className="mp2-card-hint">
            +{PREDICTION_POINTS.line} pts each
          </span>
        </div>
        <div className="mp2-market-rows">
          {totalsRows.map((row) => {
            const shares = impliedShares([row.prices?.[0], row.prices?.[1]]);
            const lead = leadIndex(shares);

            return (
              <div className="mp2-odds-line" key={row.field}>
                <span className="mp2-odds-line-label">{row.label}</span>
                <div className="mp2-odds-row cols-2">
                  <OddsButton
                    active={draft[row.field] === "over"}
                    label={`Over ${row.line}`}
                    leading={lead === 0}
                    onClick={() =>
                      patchDraft((previous) => ({
                        ...previous,
                        [row.field]: "over",
                      }))
                    }
                    points={PREDICTION_POINTS.line}
                    share={shares[0]}
                  />
                  <OddsButton
                    active={draft[row.field] === "under"}
                    label={`Under ${row.line}`}
                    leading={lead === 1}
                    onClick={() =>
                      patchDraft((previous) => ({
                        ...previous,
                        [row.field]: "under",
                      }))
                    }
                    points={PREDICTION_POINTS.line}
                    share={shares[1]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {sideOfferRows ? (
        <section aria-labelledby="market-more-heading" className="card">
          <div className="mp2-card-heading">
            <h2 id="market-more-heading">More markets</h2>
            <span className="mp2-card-hint">
              {draftSidePicks.length}/{MAX_SIDE_PICKS} picks · long shots pay
              up to {SIDE_PICK_POINTS.cap} pts
            </span>
          </div>
          <div className="mp2-market-rows">
            {sideOfferRows.map((row) => {
              if (row.layout === "rows") {
                const rowShares = row.offers.map((offer) =>
                  offer.pick.kind === "double_chance"
                    ? dcShare(offer.pick.pick)
                    : null,
                );
                const rowLead = leadIndex(rowShares);

                return (
                  <div className="mp2-dc-block" key={row.label}>
                    <span className="mp2-odds-line-label">{row.label}</span>
                    <div className="mp2-dc-list">
                      {row.offers.map((offer, index) => {
                        const share = rowShares[index];

                        return (
                          <div className="mp2-dc-row" key={offer.key}>
                            <span className="mp2-dc-copy">
                              <span className="mp2-dc-label">
                                {offer.label}
                              </span>
                              <ShareMeter
                                leading={index === rowLead}
                                share={share}
                              />
                            </span>
                            <OddsButton
                              active={draftSidePicks.some(
                                (pick) => sidePickKey(pick) === offer.key,
                              )}
                              label={offer.label}
                              labelHidden
                              onClick={() => toggleSidePick(offer)}
                              points={sidePickPoints(offer.pick.odds)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              const shares = impliedShares(
                row.offers.map((offer) => offer.pick.odds),
              );
              const lead = leadIndex(shares);

              return (
                <div className="mp2-odds-line" key={row.label}>
                  <span className="mp2-odds-line-label">{row.label}</span>
                  <div className={`mp2-odds-row cols-${row.offers.length}`}>
                    {row.offers.map((offer, index) => (
                      <OddsButton
                        active={draftSidePicks.some(
                          (pick) => sidePickKey(pick) === offer.key,
                        )}
                        key={offer.key}
                        label={offer.label}
                        leading={index === lead}
                        onClick={() => toggleSidePick(offer)}
                        points={sidePickPoints(offer.pick.odds)}
                        share={shares[index]}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted">
            Points follow the live TxLINE odds - the bolder the call, the more
            it pays. Bars show the chance the market gives each outcome.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="market-scorer-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-scorer-heading">First scorer</h2>
          <span className="mp2-card-hint">
            +{PREDICTION_POINTS.firstScorer} pts
          </span>
        </div>
        {scorerGroups.length ? (
          <div className="mp2-scorer-strip no-scrollbar">
            <button
              aria-pressed={draft.firstScorer === "none"}
              className={`mp2-scorer-chip mp2-scorer-chip-none${
                draft.firstScorer === "none" ? " picked" : ""
              }`}
              onClick={() =>
                patchDraft((previous) => ({
                  ...previous,
                  firstScorer:
                    previous.firstScorer === "none" ? null : "none",
                }))
              }
              type="button"
            >
              <span className="mp2-scorer-chip-name">No goal scorer</span>
              <span aria-hidden className="mp2-odds-badge">
                +{PREDICTION_POINTS.firstScorer}
              </span>
            </button>
            {scorerGroups.flatMap((team) =>
              team.players.map((player) => {
                const active =
                  draft.firstScorer != null &&
                  draft.firstScorer !== "none" &&
                  draft.firstScorer.playerId === player.playerId;

                return (
                  <button
                    aria-pressed={active}
                    className={`mp2-scorer-chip${active ? " picked" : ""}`}
                    key={`${team.teamName}-${player.playerId}`}
                    onClick={() =>
                      patchDraft((previous) => ({
                        ...previous,
                        firstScorer: active
                          ? null
                          : {
                              name: player.name,
                              playerId: player.playerId as number,
                            },
                      }))
                    }
                    title={`${formatPlayerDisplayName(player.name)} · ${team.teamName}`}
                    type="button"
                  >
                    <LineupPlayerAvatar
                      imageUrl={player.imageUrl}
                      name={formatPlayerDisplayName(player.name)}
                      size="default"
                    />
                    <span className="mp2-scorer-chip-name">
                      {shortPlayerName(player.name)}
                    </span>
                    <span className="mp2-scorer-chip-team">
                      {team.teamName}
                    </span>
                    <span aria-hidden className="mp2-odds-badge">
                      +{PREDICTION_POINTS.firstScorer}
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        ) : (
          <p className="muted">
            First scorer picks unavailable: TxLINE has not published a player
            list for this fixture yet.
          </p>
        )}
      </section>
    </>
  );
}

// The live ticket in the rail: every pick on the card as a slip row, the
// perfect-card total, and the save action.
// The counterfoil payoff: a big green total that counts up or down with a
// spring whenever a pick changes, plus a pop on the new value.
function PotentialPoints({ points }: { points: number }) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(points);
  const previous = useRef(points);

  useEffect(() => {
    if (previous.current === points) {
      return;
    }

    const from = previous.current;

    previous.current = points;

    if (reducedMotion) {
      setDisplay(points);
      return;
    }

    const controls = animate(from, points, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => setDisplay(Math.round(value)),
    });

    return () => controls.stop();
  }, [points, reducedMotion]);

  return (
    <div className="mp2-ticket-payout" title="If every pick hits">
      <span className="mp2-ticket-payout-label">Potential win</span>
      <span className="mp2-ticket-payout-value">+{display} pts</span>
    </div>
  );
}

function TicketCard({
  draft,
  fixture,
  odds1x2,
  onSave,
  saved,
}: {
  draft: MatchPrediction;
  fixture: WorldCupFixture;
  odds1x2: { away: number; draw: number; home: number } | null;
  onSave: (odds1x2: { away: number; draw: number; home: number } | null) => void;
  saved: boolean;
}) {
  const draftSidePicks = draft.sidePicks ?? [];
  const winnerNames = {
    away: fixture.awayTeam,
    draw: "Draw",
    home: fixture.homeTeam,
  } as const;
  const potentialPoints =
    PREDICTION_POINTS.exactScore +
    winnerPoints(odds1x2?.[draft.winner]) +
    PREDICTION_POINTS.line * 3 +
    (draft.firstScorer ? PREDICTION_POINTS.firstScorer : 0) +
    draftSidePicks.reduce(
      (total, pick) => total + sidePickPoints(pick.odds),
      0,
    );
  const ticketRows: Array<{
    market: string;
    pick: string;
    pts: number;
  }> = [
    {
      market: "Winner",
      pick: winnerNames[draft.winner],
      pts: winnerPoints(odds1x2?.[draft.winner]),
    },
    {
      market: "Exact score",
      pick: `${draft.homeGoals} - ${draft.awayGoals}`,
      pts: PREDICTION_POINTS.exactScore,
    },
    {
      market: "Goals",
      pick: linePickLabel(draft.totalGoals, PREDICTION_LINES.goals),
      pts: PREDICTION_POINTS.line,
    },
    {
      market: "Corners",
      pick: linePickLabel(draft.totalCorners, PREDICTION_LINES.corners),
      pts: PREDICTION_POINTS.line,
    },
    {
      market: "Cards",
      pick: linePickLabel(draft.totalCards, PREDICTION_LINES.cards),
      pts: PREDICTION_POINTS.line,
    },
    ...(draft.firstScorer
      ? [
          {
            market: "First scorer",
            pick:
              draft.firstScorer === "none"
                ? "No goal scorer"
                : shortPlayerName(draft.firstScorer.name),
            pts: PREDICTION_POINTS.firstScorer,
          },
        ]
      : []),
    ...draftSidePicks.map((pick) =>
      pick.kind === "double_chance"
        ? {
            market: "Double chance",
            pick: doubleChanceLabel(pick.pick, fixture),
            pts: sidePickPoints(pick.odds),
          }
        : pick.kind === "goals_line"
          ? {
              market: `Goals ${pick.line}`,
              pick: linePickLabel(pick.pick, pick.line),
              pts: sidePickPoints(pick.odds),
            }
          : {
              market: `Handicap ${handicapLineLabel(pick.line)}`,
              pick: pick.pick === "home" ? fixture.homeTeam : fixture.awayTeam,
              pts: sidePickPoints(pick.odds),
            },
    ),
  ];

  return (
    <section
      aria-label={`Your card: ${fixture.homeTeam} vs ${fixture.awayTeam}`}
      className="card mp2-ticket-card"
    >
      <div aria-hidden className="mp2-ticket-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/ticket-header.jpg" />
      </div>
      <div className="mp2-ticket-head">
        <h2 className="mp2-ticket-title">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h2>
        <span className="mp2-play-pill">
          {ticketRows.length} pick{ticketRows.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mp2-ticket-list">
        {ticketRows.map((row, index) => (
          <li key={`${row.market}-${index}`}>
            <span className="mp2-ticket-market">{row.market}</span>
            <span className="mp2-ticket-pts">+{row.pts}</span>
            <span className="mp2-ticket-pick">{row.pick}</span>
          </li>
        ))}
      </ul>
      <div aria-hidden className="mp2-ticket-tear" />
      <PotentialPoints points={potentialPoints} />
      <Button
        className="mp2-ticket-save"
        onClick={() => onSave(odds1x2)}
        type="button"
      >
        {saved ? "Update picks" : "Save picks"}
      </Button>
    </section>
  );
}

function PredictionSection({
  calls,
  fixture,
  now,
  outcome,
}: {
  calls: SettleableCall[];
  fixture: WorldCupFixture;
  now: number | null;
  outcome: MatchOutcome | null;
}) {
  const mounted = useIsMounted();
  const [saved] = useState<MatchPrediction | null>(() =>
    loadPrediction(fixture.fixtureId),
  );

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
        <h2 id="prediction-heading">Your picks</h2>
        <p>Loading prediction...</p>
      </section>
    );
  }

  if (!saved) {
    return (
      <section className="card mp2-play" aria-labelledby="prediction-heading">
        <div className="mp2-play-head">
          <h2 id="prediction-heading">Your picks</h2>
          <span className="mp2-play-pill">Locked</span>
        </div>
        <p className="muted">
          Picks locked at kickoff ({formatDate(fixture.kickoffUtc)} UTC). None
          were saved for this match.
        </p>
      </section>
    );
  }

  const totalPoints = settlement
    ? settlement.totalPoints + settledCallPoints
    : 0;

  return (
    <section className="card mp2-play" aria-labelledby="prediction-heading">
      <div className="mp2-play-head">
        <h2 id="prediction-heading">
          {settlement?.final ? "Your result" : "Your picks"}
        </h2>
        {settlement ? (
          <span
            className={`mp2-play-pill${settlement.final ? " mp2-play-total" : ""}`}
          >
            {settlement.final
              ? `+${totalPoints} pts`
              : `${totalPoints} pts so far`}
          </span>
        ) : (
          <span className="mp2-play-pill">Locked</span>
        )}
      </div>
      <p className="muted">
        Locked at kickoff ({formatDate(fixture.kickoffUtc)} UTC). Saved{" "}
        {saved.savedAt ? formatDate(saved.savedAt) : "before kickoff"} UTC.
      </p>
      {settlement ? (
        <>
          <ul className="mp2-slip">
            {settlement.markets.map((market) => (
              <li className="mp2-slip-row" key={`${market.market}-${market.pick}`}>
                <span className="mp2-slip-copy">
                  <span className="mp2-slip-market">{market.market}</span>
                  <span className="mp2-slip-pick">{market.pick}</span>
                </span>
                <span className={`mp2-slip-status ${market.status}`}>
                  {market.status}
                </span>
                <span className="mp2-slip-pts">
                  {market.status === "won"
                    ? `+${market.points}`
                    : market.status === "open"
                      ? "–"
                      : "0"}
                </span>
              </li>
            ))}
            {settledCallPoints > 0 ? (
              <li className="mp2-slip-row" key="live-calls">
                <span className="mp2-slip-copy">
                  <span className="mp2-slip-market">Live calls</span>
                  <span className="mp2-slip-pick">
                    Answered during the match
                  </span>
                </span>
                <span className="mp2-slip-status won">won</span>
                <span className="mp2-slip-pts">+{settledCallPoints}</span>
              </li>
            ) : null}
          </ul>
          <p className="muted">
            {settlement.final
              ? "Final settlement, computed deterministically from the TxLINE feed."
              : "Provisional - markets settle as the verified feed confirms them."}
          </p>
        </>
      ) : (
        <p className="muted">
          Waiting for TxLINE score data to settle these picks.
        </p>
      )}
    </section>
  );
}

// Implied probability of each outcome from its decimal odds, with the
// bookmaker margin stripped by normalising across the market's outcomes.
// Null odds keep their slot so callers can zip shares back onto options.
function impliedShares(
  odds: Array<number | null | undefined>,
): Array<number | null> {
  const inverses = odds.map((value) =>
    typeof value === "number" && Number.isFinite(value) && value > 1
      ? 1 / value
      : null,
  );
  const total = inverses.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  if (total <= 0) {
    return odds.map(() => null);
  }

  return inverses.map((value) =>
    value === null ? null : (value / total) * 100,
  );
}

function leadIndex(shares: Array<number | null>): number {
  let best = -1;
  let bestValue = -Infinity;

  shares.forEach((share, index) => {
    if (share !== null && share > bestValue) {
      bestValue = share;
      best = index;
    }
  });

  return best;
}

// The "share" meter under an outcome: the chance TxLINE's prices imply.
function ShareMeter({
  leading,
  share,
}: {
  leading: boolean;
  share: number | null | undefined;
}) {
  if (typeof share !== "number" || !Number.isFinite(share)) {
    return null;
  }

  const pct = Math.round(share);

  return (
    <span
      aria-label={`Implied chance ${pct}%`}
      className="mp2-odds-share"
      role="img"
    >
      <em>{pct}%</em>
      <span className="mp2-odds-track">
        <span
          className={`mp2-odds-fill${leading ? " lead" : ""}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
    </span>
  );
}

// A tappable market outcome: label, the points it adds to the card, and the
// implied-chance meter. The points already carry the live TxLINE odds (bold
// calls pay more) so no bookmaker decimals appear anywhere. Picked chips go
// solid white (the homepage pc-pill idiom) with a floating corner badge.
function OddsButton({
  active,
  label,
  labelHidden = false,
  leading = false,
  onClick,
  points,
  share,
}: {
  active: boolean;
  label: string;
  labelHidden?: boolean;
  leading?: boolean;
  onClick: () => void;
  points: number;
  share?: number | null;
}) {
  return (
    <button
      aria-label={`${label}, pays ${points} points`}
      aria-pressed={active}
      className={`mp2-odds-btn${active ? " picked" : ""}`}
      onClick={onClick}
      type="button"
    >
      {labelHidden ? null : (
        <span className="mp2-odds-btn-label">{label}</span>
      )}
      <span className="mp2-odds-btn-value">
        <em>+{points}</em>
        <span className="mp2-odds-btn-unit">pts</span>
      </span>
      <ShareMeter leading={leading} share={share} />
      <span aria-hidden className="mp2-odds-badge">
        +{points}
      </span>
    </button>
  );
}

// Glassy vertical stepper column, straight from the homepage prediction
// card: the animated team glow bleeds through the translucent fills.
function GoalStepper({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="mp2-play-stepper">
      <button
        aria-label={`More ${label} goals`}
        className="mp2-play-step up"
        onClick={() => onChange(clampGoals(value + 1))}
        type="button"
      >
        +
      </button>
      <output aria-label={`${label} goals`}>{value}</output>
      <button
        aria-label={`Fewer ${label} goals`}
        className="mp2-play-step down"
        disabled={value <= 0}
        onClick={() => onChange(clampGoals(value - 1))}
        type="button"
      >
        −
      </button>
    </div>
  );
}

type SideOffer = {
  key: string;
  label: string;
  marketKey: string;
  pick: SidePick;
};

function sidePickKey(pick: SidePick): string {
  if (pick.kind === "double_chance") {
    return `dc:${pick.pick}`;
  }

  if (pick.kind === "goals_line") {
    return `gl:${pick.line}:${pick.pick}`;
  }

  return `ah:${pick.line}:${pick.pick}`;
}

function sidePickMarketKey(pick: SidePick): string {
  if (pick.kind === "double_chance") {
    return "dc";
  }

  return pick.kind === "goals_line" ? `gl:${pick.line}` : `ah:${pick.line}`;
}

function roundOdds(value: number): number {
  return Math.round(value * 100) / 100;
}

// Fair double-chance price from the two covered 1X2 outcomes.
function doubleChanceOdds(first: number, second: number): number {
  return roundOdds(1 / (1 / first + 1 / second));
}

// Extra markets straight off the TxLINE odds board: double chance (derived),
// the .5 goals lines around the core 2.5, and .5 home handicaps. Quarter and
// integer lines are skipped so every pick settles cleanly won or lost.
type SideOfferRow = {
  label: string;
  layout: "chips" | "rows";
  offers: SideOffer[];
};

function buildSideOffers(
  board: OddsBoard | undefined,
  fixture: WorldCupFixture,
): SideOfferRow[] | null {
  if (!board) {
    return null;
  }

  const rows: SideOfferRow[] = [];
  const isHalfLine = (line: number) =>
    line % 1 !== 0 && (line * 2) % 1 === 0;

  if (board.result) {
    const { away, draw, home } = board.result;
    const covers: Array<[DoubleChancePick, string, number]> = [
      ["home_draw", `${fixture.homeTeam} or draw`, doubleChanceOdds(home, draw)],
      [
        "home_away",
        `${fixture.homeTeam} or ${fixture.awayTeam}`,
        doubleChanceOdds(home, away),
      ],
      ["draw_away", `Draw or ${fixture.awayTeam}`, doubleChanceOdds(draw, away)],
    ];

    rows.push({
      label: "Double chance",
      layout: "rows",
      offers: covers.map(([pick, label, odds]) => ({
        key: `dc:${pick}`,
        label,
        marketKey: "dc",
        pick: { kind: "double_chance", odds, pick },
      })),
    });
  }

  for (const entry of (board.overUnder ?? [])
    .filter(
      (candidate) =>
        isHalfLine(candidate.line) &&
        candidate.line !== PREDICTION_LINES.goals &&
        candidate.prices.length >= 2,
    )
    .slice(0, 2)) {
    rows.push({
      label: `Goals ${entry.line}`,
      layout: "chips",
      offers: (["over", "under"] as const).map((pick, index) => ({
        key: `gl:${entry.line}:${pick}`,
        label: `${pick === "over" ? "Over" : "Under"} ${entry.line}`,
        marketKey: `gl:${entry.line}`,
        pick: {
          kind: "goals_line",
          line: entry.line,
          odds: roundOdds(entry.prices[index]),
          pick,
        },
      })),
    });
  }

  for (const entry of (board.asianHandicap ?? [])
    .filter(
      (candidate) => isHalfLine(candidate.line) && candidate.prices.length >= 2,
    )
    .slice(0, 2)) {
    rows.push({
      label: `Handicap ${fixture.homeTeam} ${handicapLineLabel(entry.line)}`,
      layout: "chips",
      offers: (["home", "away"] as const).map((pick, index) => ({
        key: `ah:${entry.line}:${pick}`,
        label: pick === "home" ? fixture.homeTeam : fixture.awayTeam,
        marketKey: `ah:${entry.line}`,
        pick: {
          kind: "handicap",
          line: entry.line,
          odds: roundOdds(entry.prices[index]),
          pick,
        },
      })),
    });
  }

  return rows.length ? rows : null;
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

function HeadToHeadSection({ fixture }: { fixture: WorldCupFixture }) {
  const kickoff = new Date(fixture.kickoffUtc).getTime();
  const isPair = (home: string, away: string) =>
    (home === fixture.homeTeam && away === fixture.awayTeam) ||
    (home === fixture.awayTeam && away === fixture.homeTeam);
  const directMeetings = worldCupResults
    .filter(
      (result) =>
        result.fixtureId !== fixture.fixtureId &&
        new Date(result.kickoffUtc).getTime() < kickoff &&
        isPair(result.home, result.away),
    )
    .sort(
      (left, right) =>
        new Date(right.kickoffUtc).getTime() -
        new Date(left.kickoffUtc).getTime(),
    );
  const recentFor = (teamName: string) =>
    worldCupResults
      .filter(
        (result) =>
          result.fixtureId !== fixture.fixtureId &&
          new Date(result.kickoffUtc).getTime() < kickoff &&
          (result.home === teamName || result.away === teamName),
      )
      .sort(
        (left, right) =>
          new Date(right.kickoffUtc).getTime() -
          new Date(left.kickoffUtc).getTime(),
      )
      .slice(0, 5);
  const resultForTeam = (
    result: (typeof worldCupResults)[number],
    teamName: string,
  ) => {
    const isHome = result.home === teamName;
    const scored = result.score[isHome ? 0 : 1];
    const conceded = result.score[isHome ? 1 : 0];

    return scored === conceded ? "D" : scored > conceded ? "W" : "L";
  };
  const renderForm = (teamName: string) => {
    const results = recentFor(teamName);
    const iso = teamFlag(teamName);

    return (
      <section className="card mp2-form-card" aria-label={`${teamName} recent form`}>
        <div className="mp2-form-title">
          {iso ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={`https://flagcdn.com/w80/${iso}.png`} />
          ) : null}
          <span>
            <strong>{teamName}</strong>
            <small>Last five tournament matches</small>
          </span>
        </div>
        {results.length ? (
          <ol className="mp2-form-list">
            {results.map((result) => {
              const isHome = result.home === teamName;
              const opponent = isHome ? result.away : result.home;
              const outcome = resultForTeam(result, teamName);

              return (
                <li key={result.fixtureId}>
                  <Link href={`/demo/match/${result.fixtureId}`}>
                    <span className={`mp2-form-result ${outcome.toLowerCase()}`}>
                      {outcome}
                    </span>
                    <span>{opponent}</span>
                    <strong>
                      {result.score[isHome ? 0 : 1]} - {result.score[isHome ? 1 : 0]}
                    </strong>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted">No recent tournament results available.</p>
        )}
      </section>
    );
  };

  return (
    <div className="mp2-tab-stack mp2-h2h-tab">
      <section className="card mp2-direct-card" aria-labelledby="h2h-heading">
        <h2 id="h2h-heading">Head-to-head</h2>
        {directMeetings.length ? (
          <ol className="mp2-direct-list">
            {directMeetings.map((result) => (
              <li key={result.fixtureId}>
                <Link href={`/demo/match/${result.fixtureId}`}>
                  <span>{result.home}</span>
                  <strong>{result.score[0]} - {result.score[1]}</strong>
                  <span>{result.away}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mp2-empty-state">
            <strong>First meeting in this tournament</strong>
            <span>No earlier 2026 World Cup meeting is available for these teams.</span>
          </div>
        )}
      </section>
      <div className="mp2-form-grid">
        {renderForm(fixture.homeTeam)}
        {renderForm(fixture.awayTeam)}
      </div>
    </div>
  );
}

function VerificationSection({
  detailsLoading,
  displayScore,
  finished,
  fixture,
  fixtureValidation,
  historicalUpdates,
  liveStreamEligible,
  oddsSource,
  oddsUpdates,
  oddsValidation,
  scoreSource,
  streamStatus,
  streamUpdateCount,
  updates,
  validation,
}: {
  detailsLoading: boolean;
  displayScore: TxlineScoreData | null | undefined;
  finished: boolean;
  fixture: WorldCupFixture;
  fixtureValidation: ApiResult<unknown> | null;
  historicalUpdates: ApiResult<TxlineUpdateData[]> | null;
  liveStreamEligible: boolean;
  oddsSource: string;
  oddsUpdates: ApiResult<TxlineOddsUpdatesData> | null;
  oddsValidation: ApiResult<TxlineOddsValidationData> | null;
  scoreSource: string;
  streamStatus: StreamStatus;
  streamUpdateCount: number;
  updates: ApiResult<TxlineUpdateData[]> | null;
  validation: ApiResult<TxlineValidationData> | null;
}) {
  const proof = isValidationData(validation?.data) ? validation.data : null;
  const oddsProof = oddsValidation?.data?.messageId
    ? oddsValidation.data
    : null;

  return (
    <section className="card mp2-verification-card" aria-labelledby="verification-heading">
      <h2 className="sr-only" id="verification-heading">Data verification</h2>
      <details className="mp2-verification-root">
        <summary>
          <span>
            <span aria-hidden className="verified-check">✓</span>{" "}
            Verified by TxLINE
          </span>
          <small>Data sources and proof</small>
        </summary>
        <div className="mp2-verification-content">
          <p className="muted">
            Fixture #{fixture.fixtureId} · Kickoff {formatDate(fixture.kickoffUtc)} UTC
          </p>
          {detailsLoading ? <p className="muted">Loading TxLINE details...</p> : null}
          {liveStreamEligible ? (
            <p className="muted">
              Live stream:{" "}
              {streamStatus === "connected"
                ? `connected · ${streamUpdateCount} live record(s)`
                : streamStatus === "unavailable"
                  ? "unavailable · using snapshot and replay data"
                  : "connecting…"}
            </p>
          ) : null}
          <p className="muted">Score source: {scoreSource}</p>
          <p className="muted">Odds source: {oddsSource}</p>
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
        </div>
      </details>
    </section>
  );
}
