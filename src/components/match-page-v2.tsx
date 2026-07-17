"use client";

import Link from "next/link";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  EqualSignIcon,
  FootballIcon,
  InformationCircleIcon,
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
  type ReactNode,
} from "react";
import {
  XAxis,
  YAxis,
} from "recharts";

import { Button, buttonVariants } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { PointsBadge } from "@/components/home-page";
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
  DialogTitle,
} from "@/components/ui/dialog";

import type {
  ScorerPool,
  ScorerPoolPlayer,
  ScorerPoolTeam,
} from "@/lib/api-football-player-media";
import {
  buildOutcome,
  countHeadedGoals,
  countShotOutcomes,
  countShotsOnTarget,
  countTeamEvents,
  fetchJson,
  fillUnknownStats,
  formatCompetition,
  formatDate,
  formatFeedLabel,
  formatGameState,
  formatKickoffLabel,
  formatKickoffTime,
  formatMinute,
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
  type DisplayUpdate,
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
  defaultPrediction,
  exactScorePoints,
  handicapLineLabel,
  linePickLabel,
  MAX_SIDE_PICKS,
  PREDICTION_LINES,
  PREDICTION_POINTS,
  scorerPoints,
  settlePrediction,
  sidePickPoints,
  sidePickSummary,
  winnerPoints,
  type DoubleChancePick,
  type FirstScorerPick,
  type MatchOutcome,
  type MatchPrediction,
  type LinePick,
  type PlayerPick,
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
  extractNextGoalCalls,
  extractVarCalls,
  extractGoals,
  extractMatchInfo,
  extractPenaltyEvents,
  extractSettleableCalls,
  extractSubstitutionEvents,
  formatLiveMinute,
  formatMatchPhase,
  normalizeScoreSnapshot,
  withoutRaw,
  type GoalEvent,
  type LineupPosition,
  type MomentumBucket,
  type NormalizedLineups,
  type OddsBoard,
  type SettleableCall,
  type SideMarkets,
  type SubstitutionEvent,
} from "@/lib/txline-normalize";
import { FlashMomentum } from "@/components/flash-momentum";
import { matchClips } from "@/lib/match-media";
import { teamFlag, teamGlow } from "@/lib/team-visuals";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";
import { pastWorldCupFixtures } from "@/lib/past-world-cup-fixtures";

type MatchTab =
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
    scorerPool: null,
    updates: null,
    validation: null,
  });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedFixtureRef = useRef<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [streamUpdates, setStreamUpdates] = useState<TxlineUpdateData[]>([]);
  const [shareLabel, setShareLabel] = useState("Share");
  const [matchTab, setMatchTab] = useState<MatchTab>("overview");
  const now = useNow();
  const playCard = usePlayCard(fixtureId);
  const scorerPool = details.scorerPool?.data ?? null;
  const reconcileScorerPicks = playCard.reconcile;

  useEffect(() => {
    reconcileScorerPicks(scorerPool);
  }, [reconcileScorerPicks, scorerPool]);

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

      // Include the on-device fixture cache and every fixture with a replay
      // pack: finished fixtures drop off the TxLINE snapshot within hours, and
      // deep links must keep resolving.
      const merged = mergeFixtures(
        [...loadCachedFixtures(), ...pastWorldCupFixtures, ...txlineWorldCupFixtures],
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
          scorerPool: null,
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
        scorerPool,
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
        fetchJson<ScorerPool>(`/api/txline/scores/${fixtureId}/scorer-pool`),
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
          scorerPool,
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

  const snapshotUpdates = details.historicalUpdates?.data?.length
    ? details.historicalUpdates
    : details.updates;
  // The one feed spine: whatever TxLINE served, plus anything the live stream
  // has pushed since.
  const feedUpdates = useMemo(
    () => [...(snapshotUpdates?.data ?? []), ...streamUpdates],
    [snapshotUpdates, streamUpdates],
  );
  // TxLINE devnet never flips GameState to finished; the authoritative end of
  // a match is the game_finalised record on the score feed.
  const feedFinished = useMemo(
    () => feedUpdates.some((update) => update.action === "game_finalised"),
    [feedUpdates],
  );
  // A match can outlive the 4h kickoff window (delays, long extra time):
  // the feed's StatusId is authoritative for "still being played".
  const feedInPlay = useMemo(() => {
    let statusId = 0;

    for (const update of [...feedUpdates].sort(
      (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
    )) {
      if (typeof update.statusId === "number") {
        statusId = update.statusId;
      }
    }

    return statusId >= 2 && statusId <= 9;
  }, [feedUpdates]);
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


    return () => {
      scoreStream.close();
      setStreamUpdates([]);
      setStreamStatus("idle");
    };
  }, [fixtureId, liveStreamEligible]);

  // Scout corrections first: drop discarded events (disallowed goals, wrongly
  // logged corners) and apply amends (re-graded shot outcomes) so every
  // consumer below - stats, calls, feed - sees the corrected record of play.
  // Memoized (with the other feed folds below): the component re-renders at
  // least every 30s via useNow, and these walk 1000+ records per pass.
  const combinedUpdates = useMemo(
    () => applyScoutCorrections(fillUnknownStats(feedUpdates)),
    [feedUpdates],
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
  const scoreSource = snapshotUpdates?.data?.length
    ? `${details.score?.source ?? "TxLINE scores snapshot API"} + ${
        snapshotUpdates.source ?? "TxLINE scores updates API"
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
    ...extractVarCalls(combinedUpdates).map((call) => ({
      correctIndex: call.resolved
        ? ((call.overturned ? 0 : 1) as 0 | 1)
        : undefined,
      key: call.key,
      minute: formatMinute(call.clockSeconds) || "—",
      options: ["Overturned", "Stands"] as [string, string],
      outcome: call.resolved
        ? call.overturned
          ? "Overturned"
          : "Decision stands"
        : "Open",
      question: `VAR check${
        call.type ? ` (${formatFeedLabel(call.type).toLowerCase()})` : ""
      } - overturned or stands?`,
      resolved: call.resolved,
      seq: call.seq,
    })),
    ...extractNextGoalCalls(combinedUpdates).map((call) => ({
      correctIndex:
        call.winner === 1
          ? (0 as const)
          : call.winner === 2
            ? (1 as const)
            : undefined,
      key: call.key,
      minute: formatMinute(call.clockSeconds) || "0'",
      options: [fixture.homeTeam, fixture.awayTeam] as [string, string],
      outcome: !call.resolved
        ? "Open"
        : call.voided
          ? "No more goals"
          : callTeam(call.winner) ?? "Unknown",
      question: "Who scores the next goal?",
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
    goals.map((goal) => ({
      playerId: goal.playerId,
      scorerName: lineupPlayers.find(
        (player) => player.playerId === goal.playerId,
      )?.name,
    })),
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
  const shotOutcomes = countShotOutcomes(combinedUpdates);
  const headedGoals = countHeadedGoals(combinedUpdates);
  // Possession per half: the phase records carry the match phase, so the
  // same split recomputes over each half's slice.
  const halfPossession = (statusId: number) => {
    const split = computePossessionSplit(
      combinedUpdates.filter((update) => update.statusId === statusId),
    );

    if (!split) {
      return null;
    }

    const home = participant1IsHome ? split.team1Pct : split.team2Pct;

    return { away: 100 - home, home };
  };
  const firstHalfPossession = halfPossession(2);
  const secondHalfPossession = halfPossession(4);
  const throwIns = countTeamEvents(combinedUpdates, "throw_in");
  const goalKicks = countTeamEvents(combinedUpdates, "goal_kick");
  // Possession-quality phases double as attack counters: every attack /
  // danger / high-danger phase is one spell of pressure for that side.
  const attacks = countTeamEvents(combinedUpdates, "attack_possession");
  const dangerPhases = countTeamEvents(combinedUpdates, "danger_possession");
  const highDangerPhases = countTeamEvents(
    combinedUpdates,
    "high_danger_possession",
  );
  const dangerousAttacks = {
    away: dangerPhases.away + highDangerPhases.away,
    home: dangerPhases.home + highDangerPhases.home,
  };
  const injuryStops = countTeamEvents(combinedUpdates, "injury");
  const subsUsed = countTeamEvents(combinedUpdates, "substitution");
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
    ...(shotOutcomes.home.offTarget + shotOutcomes.away.offTarget > 0
      ? [
          {
            away: shotOutcomes.away.offTarget,
            home: shotOutcomes.home.offTarget,
            label: "Shots off target",
          },
        ]
      : []),
    ...(shotOutcomes.home.blocked + shotOutcomes.away.blocked > 0
      ? [
          {
            away: shotOutcomes.away.blocked,
            home: shotOutcomes.home.blocked,
            label: "Blocked shots",
          },
        ]
      : []),
    ...(shotOutcomes.home.woodwork + shotOutcomes.away.woodwork > 0
      ? [
          {
            away: shotOutcomes.away.woodwork,
            home: shotOutcomes.home.woodwork,
            label: "Hit the woodwork",
          },
        ]
      : []),
    ...(attacks.home + attacks.away > 0
      ? [
          { away: attacks.away, home: attacks.home, label: "Attacks" },
          {
            away: dangerousAttacks.away,
            home: dangerousAttacks.home,
            label: "Dangerous attacks",
          },
        ]
      : []),
    ...(headedGoals.home + headedGoals.away > 0
      ? [
          {
            away: headedGoals.away,
            home: headedGoals.home,
            label: "Headed goals",
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
  const gameFlowStatRows: MatchStatRow[] = [
    ...(injuryStops.home + injuryStops.away > 0
      ? [
          {
            away: injuryStops.away,
            home: injuryStops.home,
            label: "Injury stoppages",
          },
        ]
      : []),
    ...(subsUsed.home + subsUsed.away > 0
      ? [
          {
            away: subsUsed.away,
            home: subsUsed.home,
            label: "Substitutions used",
          },
        ]
      : []),
  ];
  // The per-half stat banks ride on every score record once TxLINE opens
  // them, so these split without any extra requests.
  const halfBanks = displayScore?.halfStats;
  const byHalfStatRows: MatchStatRow[] = [
    ...(firstHalfPossession
      ? [
          {
            away: firstHalfPossession.away,
            awayDisplay: `${firstHalfPossession.away}%`,
            home: firstHalfPossession.home,
            homeDisplay: `${firstHalfPossession.home}%`,
            label: "1st-half possession",
          },
        ]
      : []),
    ...(secondHalfPossession
      ? [
          {
            away: secondHalfPossession.away,
            awayDisplay: `${secondHalfPossession.away}%`,
            home: secondHalfPossession.home,
            homeDisplay: `${secondHalfPossession.home}%`,
            label: "2nd-half possession",
          },
        ]
      : []),
    ...(halfBanks
    ? [
        {
          away: halfBanks.first.awayGoals,
          home: halfBanks.first.homeGoals,
          label: "1st-half goals",
        },
        {
          away: halfBanks.second.awayGoals,
          home: halfBanks.second.homeGoals,
          label: "2nd-half goals",
        },
        {
          away: halfBanks.first.awayCorners,
          home: halfBanks.first.homeCorners,
          label: "1st-half corners",
        },
        {
          away: halfBanks.second.awayCorners,
          home: halfBanks.second.homeCorners,
          label: "2nd-half corners",
        },
        {
          away: halfBanks.first.awayYellowCards,
          home: halfBanks.first.homeYellowCards,
          label: "1st-half yellow cards",
        },
        {
          away: halfBanks.second.awayYellowCards,
          home: halfBanks.second.homeYellowCards,
          label: "2nd-half yellow cards",
        },
      ].filter((row) => row.home + row.away > 0)
    : []),
  ];
  const statSections = [
    { label: "Top stats", rows: topStatRows },
    { label: "Attack", rows: attackStatRows },
    { label: "Defence", rows: defenceStatRows },
    { label: "Goalkeeping", rows: goalkeepingStatRows },
    { label: "Game flow", rows: gameFlowStatRows },
    { label: "By half", rows: byHalfStatRows },
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
          <rect
            className="mp2bg-drift mp2bg-drift-blue"
            fill="url(#mp2bg-blue)"
            height="260"
            width="1040"
          />
          <rect
            className="mp2bg-drift mp2bg-drift-green"
            fill="url(#mp2bg-green)"
            height="260"
            width="1040"
          />
          <rect
            className="mp2bg-drift mp2bg-drift-purple"
            fill="url(#mp2bg-purple)"
            height="260"
            width="1040"
          />
          <path
            className="mp2bg-drift mp2bg-drift-arc"
            d="M64 128 L196 128 C270 128 330 62 330 -20 L198 -20 C124 -20 64 46 64 128 Z"
            fill="url(#mp2bg-red)"
          />
          <path
            className="mp2bg-drift mp2bg-drift-arc2"
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
              gradientTransform="translate(30 -40) rotate(58) scale(300 460)"
              gradientUnits="userSpaceOnUse"
              id="mp2bg-purple"
              r="1"
            >
              <stop stopColor="#8b5cf6" stopOpacity="0.5" />
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
                      <KickoffCountdown kickoff={kickoff} now={now} />
                    </span>
                  </div>
                )}
                {finished ? (
                  <span className="mp2-hero-reason">
                    {hadExtraTime ? "After extra time" : "Full time"}
                  </span>
                ) : notStarted || !displayScore ? (
                  // No feed data yet: the kickoff time and date render in the
                  // same spot, and a status pill with nothing truthful to say
                  // would double-expose over them while the page loads.
                  null
                ) : (
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
                  odds1x2={playOdds}
                  patchDraft={playCard.patchDraft}
                  scorerPool={scorerPool}
                  sideMarkets={details.oddsUpdates?.data?.sideMarkets ?? null}
                />
              ) : null}

              {finished ? playSection : null}

              {finished ? (
                <MatchMediaSection fixtureId={fixture.fixtureId} />
              ) : null}

              <LiveCallsPanel
                key={`calls-${fixture.fixtureId}`}
                calls={liveCalls}
                fixtureId={fixture.fixtureId}
                live={liveStreamEligible}
              />

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
                  scorerPool={scorerPool}
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
                      events; attacks count its attack and danger phases; fouls
                      are free kicks conceded to the opponent.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>No stats available.</p>
              )}
            </section>

            <FlashMomentum
              awayIso={awayIso}
              fixture={fixture}
              goals={goals}
              homeIso={homeIso}
              updates={combinedUpdates}
            />
          </div>
        ) : null}

        {matchTab === "timeline" ? (
          <div className="mp2-tab-stack">
            <UpdatesSection
              fixture={fixture}
              lineups={details.lineups?.data ?? null}
              players={playerDirectory}
              updates={
                snapshotUpdates?.data?.length
                  ? { ...snapshotUpdates, data: combinedUpdates }
                  : combinedUpdates.length
                    ? {
                        data: combinedUpdates,
                        source: "TxLINE live score stream",
                      }
                    : snapshotUpdates
              }
            />

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
  frozen,
  onAnswer,
  onDismiss,
}: {
  call: LiveUiCall;
  frozen?: boolean;
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
    // Design-review mode: hold the prompt open with a full window instead of
    // ticking it down (the static demo uses this).
    if (frozen) {
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, CALL_WINDOW_MS - (Date.now() - start));

      setRemaining(left);

      if (left <= 0) {
        onDismiss(callKey);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [callKey, frozen, onDismiss]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onDismiss(callKey);
        }
      }}
    >
      <DialogContent className="lc-prompt">
        <div className="lc-prompt-eyebrow">
          <DialogTitle className="lc-prompt-label">
            <span aria-hidden className="lc-prompt-dot" />
            Live call
          </DialogTitle>
          <span className="lc-prompt-minute">{call.minute}</span>
        </div>
        <DialogDescription className="lc-prompt-question">
          {call.question}
        </DialogDescription>
        <div aria-hidden className="lc-prompt-timer">
          <div
            className="lc-prompt-timer-fill"
            style={{ width: `${(remaining / CALL_WINDOW_MS) * 100}%` }}
          />
        </div>
        <div className="lc-prompt-note">
          <span>{Math.ceil(remaining / 1000)}s to answer</span>
          <span className="lc-prompt-worth">
            Pays
            <PointsBadge points={GOAL_CALL_POINTS} />
          </span>
        </div>
        <div className="lc-prompt-actions">
          <button
            className="lc-prompt-btn lc-prompt-btn-main"
            onClick={() => onAnswer(0)}
            type="button"
          >
            <span>{call.options[0]}</span>
          </button>
          <button
            className="lc-prompt-btn lc-prompt-btn-alt"
            onClick={() => onAnswer(1)}
            type="button"
          >
            <span>{call.options[1]}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CallKind = "added" | "corner" | "goal" | "next" | "var";

const CALL_KIND_LABELS: Record<CallKind, string> = {
  added: "Added time",
  corner: "Corners",
  goal: "Goals",
  next: "Next goal",
  var: "VAR",
};

// Filter order: the two goal-family calls lead, specials trail.
const CALL_KIND_ORDER: CallKind[] = ["goal", "next", "corner", "var", "added"];

// How many settled calls the panel shows before the "Show all" expander.
const SETTLED_CALLS_PREVIEW = 6;

function callKindOf(question: string): CallKind {
  if (/corner/i.test(question)) return "corner";
  if (/added time/i.test(question)) return "added";
  if (/VAR/i.test(question)) return "var";
  if (/next goal/i.test(question)) return "next";

  return "goal";
}

function CallKindIcon({ kind }: { kind: CallKind }) {
  if (kind === "corner") {
    return (
      <svg fill="currentColor" height="11" viewBox="0 0 10 10" width="11">
        <path d="M2 1h1v8H2zM3.6 1.4l4.4 1.8-4.4 1.8z" />
      </svg>
    );
  }

  if (kind === "added") return <StopwatchIcon />;
  if (kind === "var") return <span className="lc-var">VAR</span>;

  return <LineupGoalIcon />;
}

export function LiveCallsPanel({
  calls,
  fixtureId,
  freezePrompt,
  live,
}: {
  calls: LiveUiCall[];
  fixtureId: number;
  freezePrompt?: boolean;
  live: boolean;
}) {
  const mounted = useIsMounted();
  const [answers, setAnswers] = useState<Record<string, GoalCallAnswer>>(() =>
    loadGoalCalls(fixtureId),
  );
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<"all" | CallKind>("all");
  const [expanded, setExpanded] = useState(false);
  const handleDismiss = useCallback((key: string) => {
    setDismissed((previous) => {
      const next = new Set(previous);

      next.add(key);

      return next;
    });
  }, []);

  function answer(callKey: string, index: 0 | 1) {
    const record: GoalCallAnswer = {
      answer: String(index),
      answeredAt: new Date().toISOString(),
    };

    saveGoalCall(fixtureId, callKey, record);
    setAnswers((previous) => ({ ...previous, [callKey]: record }));
  }

  // During a live match, surface the most recent still-open call for a prompt.
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

  // Per-type counts drive the filter chips.
  const kindCounts = new Map<CallKind, number>();

  for (const call of calls) {
    const kind = callKindOf(call.question);

    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  // Total earned across every settled call, shown on the Settled strip.
  const points = calls.reduce((total, call) => {
    const record = mounted ? answers[call.key] : undefined;

    if (!call.resolved || call.voided || !record || call.correctIndex === undefined) {
      return total;
    }

    return (
      total +
      (answerIndex(record.answer) === call.correctIndex ? GOAL_CALL_POINTS : 0)
    );
  }, 0);

  const kinds = CALL_KIND_ORDER.filter((kind) => kindCounts.has(kind));
  const visible = [...calls]
    .reverse()
    .filter((call) => filter === "all" || callKindOf(call.question) === filter);
  const openRows = visible.filter((call) => !call.resolved && !call.voided);
  const settledRows = visible.filter((call) => call.resolved || call.voided);
  // Riding on the Overview, the settled log is capped to a preview so it never
  // buries the cards below it; the rest is one tap away.
  const settledPreview =
    expanded || settledRows.length <= SETTLED_CALLS_PREVIEW
      ? settledRows
      : settledRows.slice(0, SETTLED_CALLS_PREVIEW);

  function renderCall(call: LiveUiCall) {
    const kind = callKindOf(call.question);
    const record = mounted ? answers[call.key] : undefined;
    const correct =
      call.resolved && !call.voided && record && call.correctIndex !== undefined
        ? answerIndex(record.answer) === call.correctIndex
        : null;
    const picked = record
      ? call.options[answerIndex(record.answer)] ?? record.answer
      : null;
    // Settled calls score with the homepage hexagon badge (green when the
    // fan played, grey when they let it pass); everything still in flight
    // keeps a pill.
    const chip = call.voided
      ? { label: "Void", tone: "muted" }
      : !call.resolved
        ? picked
          ? { label: picked, tone: "picked" }
          : { label: "Open", tone: "open" }
        : null;

    return (
      <li className="lcx-row" key={call.key}>
        <span aria-hidden className="lcx-row-icon">
          <CallKindIcon kind={kind} />
        </span>
        <div className="lcx-row-body">
          <span className="lcx-row-q">{call.question}</span>
          <div className="lcx-row-meta">
            <span className="lcx-min">{call.minute}</span>
            {/* Voided calls carry a reason ("No more goals", "Not taken") -
                show it like a settled outcome. */}
            {call.resolved || call.voided ? (
              <span className="lcx-outcome">{call.outcome}</span>
            ) : null}
            {picked ? <span className="lcx-you">You: {picked}</span> : null}
          </div>
        </div>
        {chip ? (
          <span className={`lcx-chip lcx-chip-${chip.tone}`}>{chip.label}</span>
        ) : (
          <PointsBadge
            muted={correct === null}
            points={correct ? GOAL_CALL_POINTS : 0}
          />
        )}
      </li>
    );
  }

  return (
    <section aria-labelledby="live-calls-heading" className="card lcx">
      {openCall && mounted ? (
        <CallPromptDialog
          key={openCall.key}
          call={openCall}
          frozen={freezePrompt}
          onAnswer={(index) => answer(openCall.key, index)}
          onDismiss={handleDismiss}
        />
      ) : null}

      <header className="lcx-head">
        <div className="lcx-title">
          <h2 id="live-calls-heading">Live calls</h2>
        </div>
        <span
          className="text-muted-foreground cursor-help"
          title="Snap predictions on live TxLINE moments - a shot about to drop, the next corner, a VAR check - scored the instant the verified feed settles them."
        >
          <HugeiconsIcon
            aria-label="How live calls work"
            icon={InformationCircleIcon}
            size={16}
            strokeWidth={2.5}
          />
        </span>
      </header>

      {calls.length === 0 ? (
        <div className="lcx-empty">
          <div aria-hidden className="lcx-empty-ghosts">
            <span className="lcx-empty-ghost" />
            <span className="lcx-empty-ghost" />
            <span className="lcx-empty-ghost" />
          </div>
          <p className="lcx-empty-title">No calls yet</p>
          <p className="lcx-empty-sub">
            When the match kicks off, live micro-calls appear here the moment a
            play turns dangerous - and settle themselves against the TxLINE
            feed.
          </p>
        </div>
      ) : (
        <>
          {kinds.length > 1 ? (
            <div aria-label="Filter calls by type" className="lcx-filters">
              <button
                className={`lcx-filter${filter === "all" ? " is-active" : ""}`}
                onClick={() => setFilter("all")}
                type="button"
              >
                All <span className="lcx-filter-count">{calls.length}</span>
              </button>
              {kinds.map((kind) => (
                <button
                  className={`lcx-filter${filter === kind ? " is-active" : ""}`}
                  key={kind}
                  onClick={() => setFilter(kind)}
                  type="button"
                >
                  {CALL_KIND_LABELS[kind]}{" "}
                  <span className="lcx-filter-count">{kindCounts.get(kind)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {openRows.length || settledRows.length ? (
            <>
              {/* Open and settled live in their own board containers so a
                  live match reads as two clean subsections. */}
              {openRows.length ? (
                <div className="lcx-boardwrap">
                  <div className="lcx-board-head">
                    <span aria-hidden className="lcx-open-dot" />
                    {live ? "Open now" : "Open"}
                  </div>
                  <div className="lcx-board-body">
                    <ul className="lcx-list">
                      {openRows.map((call) => renderCall(call))}
                    </ul>
                  </div>
                </div>
              ) : null}
              {settledRows.length ? (
                <div className="lcx-boardwrap">
                  <div className="lcx-board-head lcx-board-head-split">
                    Settled
                    {mounted ? (
                      <PointsBadge muted={points === 0} points={points} />
                    ) : null}
                  </div>
                  <div className="lcx-board-body">
                    <ul className="lcx-list">
                      {settledPreview.map((call) => renderCall(call))}
                    </ul>
                    {settledRows.length > SETTLED_CALLS_PREVIEW ? (
                      <button
                        aria-label={
                          expanded ? "Show fewer calls" : "Show more calls"
                        }
                        className="text-muted-foreground hover:text-foreground mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-2xl bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
                        onClick={() => setExpanded((value) => !value)}
                        type="button"
                      >
                        <span className="text-xs leading-4 font-medium">
                          {expanded
                            ? "Fewer calls"
                            : `More calls (${settledRows.length - SETTLED_CALLS_PREVIEW})`}
                        </span>
                        <HugeiconsIcon
                          icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
                          size={12}
                          strokeWidth={2.5}
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="lcx-none">
              No{" "}
              {filter === "all"
                ? ""
                : `${CALL_KIND_LABELS[filter].toLowerCase()} `}
              calls in this match.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Tooltip for the momentum chart: the hovered 5-minute window with each
// side's raw pressure score.

// Attack momentum as FotMob-style diverging bars (shadcn chart / recharts):
// one signed value per 5-minute bucket - home pressure minus away pressure -
// drawn upward in the home colour and downward in the away colour. Discrete
// bars mean a live match simply stops at its latest bucket; nothing
// interpolates across the unplayed timeline.

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
  // First surname token only ("Oyarzabal", not "Oyarzabal Ugarte") so pitch
  // captions stay one clean line, Google-style.
  const pitchName = (player: LineupPlayer) =>
    shortPlayerName(player.name).split(/\s+/)[0] ?? player.name;
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
        {/* Same match events as the pitch view - a substitute's goal deserves
            its ball too. Own flex item so the away side's row-reverse mirrors
            it with the minute badge. */}
        <span className="mp2-lineup-bench-events">
          {renderPitchEvents(player)}
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
      {lineups?.data?.predicted ? (
        <p className="mp2-lineup-predicted">
          <span className="mp2-play-pill">Predicted XI</span>
          Projected from each side&apos;s recent matches, suspensions applied -
          the official lineups land about an hour before kickoff and replace
          this view.
        </p>
      ) : null}
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
// Rewrites one scorer pick from the provider id space onto the TxLINE ids the
// goal feed settles against, using the provider id each verified player matched.
// A pick that bridges to nobody is dropped: the player is not in the matchday
// squad, so leaving it on the card would promise a payout that cannot happen.
function reconcilePlayerPick(
  pick: PlayerPick | null | undefined,
  players: ScorerPoolPlayer[],
): PlayerPick | null | undefined {
  if (!pick || !pick.provisional) return pick;

  const bridged = players.find((player) => player.providerId === pick.playerId);

  return bridged ? { name: bridged.name, playerId: bridged.playerId } : null;
}

// "No goal scorer" names no player, so there is nothing to bridge.
function reconcileScorerPick(
  pick: FirstScorerPick | null | undefined,
  players: ScorerPoolPlayer[],
): FirstScorerPick | null | undefined {
  return pick === "none" ? pick : reconcilePlayerPick(pick, players);
}

// Every player market a provisional pick can land on, not just the scorers: a
// booking taken off the provider squad settles against the same TxLINE ids.
function reconcileScorers(
  prediction: MatchPrediction,
  players: ScorerPoolPlayer[],
): MatchPrediction {
  const anytimeScorer = reconcileScorerPick(prediction.anytimeScorer, players);
  const bookedPlayer = reconcilePlayerPick(prediction.bookedPlayer, players);
  const firstScorer = reconcileScorerPick(prediction.firstScorer, players);
  const lastScorer = reconcileScorerPick(prediction.lastScorer, players);
  const sentOffPlayer = reconcilePlayerPick(prediction.sentOffPlayer, players);

  return anytimeScorer === prediction.anytimeScorer &&
    bookedPlayer === prediction.bookedPlayer &&
    firstScorer === prediction.firstScorer &&
    lastScorer === prediction.lastScorer &&
    sentOffPlayer === prediction.sentOffPlayer
    ? prediction
    : {
        ...prediction,
        anytimeScorer,
        bookedPlayer,
        firstScorer,
        lastScorer,
        sentOffPlayer,
      };
}

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

  // Called once the TxLINE XI lands. The saved copy matters most: it is what the
  // home page settles from, and it is the only copy that outlives this page.
  const reconcile = useCallback((pool: ScorerPool | null) => {
    if (!pool || pool.provisional || !pool.teams?.length) return;

    const players = pool.teams.flatMap((team) => team.players);

    setState((previous) => {
      const draft = reconcileScorers(previous.draft, players);
      const saved = previous.saved
        ? reconcileScorers(previous.saved, players)
        : null;

      if (draft === previous.draft && saved === previous.saved) {
        return previous;
      }

      if (saved) savePrediction(saved);

      return { ...previous, draft, saved };
    });
  }, []);

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
    reconcile,
    save,
    saved: state.saved,
  };
}

// Scoreline pills shown before the fan expands the board (three rows of 4).
const SCORE_FOLD = 12;

// Tiny Poisson model over the TxLINE prices: total goals from the over 2.5
// price, split home/away by the 1X2 shares, giving the most likely exact
// scorelines and their fair odds.
function poissonPmf(k: number, lambda: number): number {
  let factorial = 1;

  for (let i = 2; i <= k; i += 1) {
    factorial *= i;
  }

  return (Math.exp(-lambda) * lambda ** k) / factorial;
}

function solveTotalLambda(overProb: number): number {
  let low = 0.2;
  let high = 6;

  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const under =
      poissonPmf(0, mid) + poissonPmf(1, mid) + poissonPmf(2, mid);

    if (1 - under > overProb) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return (low + high) / 2;
}

// Ticking pre-kickoff countdown. The shared clock only beats every 30s (a
// full-page tick recomputes heavy derived data), so within the final day
// this label runs its own 1s interval and re-renders alone.
function KickoffCountdown({
  kickoff,
  now,
}: {
  kickoff: Date;
  now: number | null;
}) {
  const [tick, setTick] = useState<number | null>(null);
  const withinDay =
    now !== null &&
    kickoff.getTime() - now > 0 &&
    kickoff.getTime() - now < 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (!withinDay) {
      return;
    }

    const timer = setInterval(() => setTick(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [withinDay]);

  // Until the first tick lands (or outside the final day), the 30s shared
  // clock still gives a fresh-enough label.
  return <>{formatKickoffLabel(kickoff, tick ?? now)}</>;
}

// Small outcome circle used on the market chips: a team's flag, or the
// neutral equals badge standing in for the draw.
function OutcomeCircle({ iso }: { iso: string | null | undefined }) {
  if (iso) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-5 shrink-0 rounded-full object-cover ring-1 ring-white/10"
        src={`https://flagcdn.com/w40/${iso}.png`}
      />
    );
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3f3f46] text-white/85 ring-1 ring-white/10">
      <HugeiconsIcon
        aria-hidden
        icon={EqualSignIcon}
        size={12}
        strokeWidth={2.5}
      />
    </span>
  );
}

type PlayerMarketField =
  | "anytimeScorer"
  | "bookedPlayer"
  | "firstScorer"
  | "lastScorer"
  | "sentOffPlayer";

type PlayerMarket = {
  field: PlayerMarketField;
  short: string;
  title: string;
};

const SCORER_MARKETS: readonly PlayerMarket[] = [
  { field: "anytimeScorer", short: "Anytime", title: "Anytime scorer" },
  { field: "firstScorer", short: "First", title: "First scorer" },
  { field: "lastScorer", short: "Last", title: "Last scorer" },
];

const BOOKING_MARKETS: readonly PlayerMarket[] = [
  { field: "bookedPlayer", short: "Booked", title: "Booked" },
  { field: "sentOffPlayer", short: "Sent off", title: "Sent off" },
];

const POSITION_RANK: Record<LineupPosition, number> = {
  DEF: 2,
  FWD: 0,
  GK: 3,
  MID: 1,
};

// The shirts the scoring roles wear. The provider files only four position
// buckets and drops most of a squad's real threat into MID - Thuram wears 9,
// Bellingham 10, Saka 7 - so the shirt cuts across the bucket and leads.
const ATTACKING_SHIRTS = [9, 10, 11, 7];

// An unplaceable position sorts with the midfield rather than the fold: showing
// one extra row beats burying a striker whose position never came through.
function positionRank(position: LineupPosition | undefined): number {
  return position ? POSITION_RANK[position] : POSITION_RANK.MID;
}

// No scorer odds are published for these fixtures and the provider has no goal
// counts for this season, so "most likely to score" is a convention rather than
// a model: attacking shirts first, then forwards, then the rest by shirt.
function scorerRank(player: ScorerPoolPlayer): number {
  const position = positionRank(player.position);

  if (position >= POSITION_RANK.DEF) return 1000 + position;

  const shirt = player.shirtNumber ?? 99;
  const attacking = ATTACKING_SHIRTS.indexOf(shirt);

  return attacking >= 0
    ? attacking
    : 10 + position * 30 + Math.min(shirt, 99);
}

// Rows shown before the fan expands the board: the five likeliest names from
// each side, which is where nearly every pick lands.
const SCORER_FOLD = 10;

// The share of a team's goals a shirt tends to take. Same caveat as the board
// order: no scorer odds are published and the provider carries no goal counts
// for this season, so the split is a convention drawn from the shirt, not a
// measurement. It only has to rank sanely - a 9 outscores a centre-back.
const SCORER_SHIRT_WEIGHT: Record<number, number> = {
  7: 6,
  9: 10,
  10: 9,
  11: 6,
};

function scorerWeight(player: ScorerPoolPlayer): number {
  const position = positionRank(player.position);

  if (position === POSITION_RANK.GK) return 0.02;
  if (position === POSITION_RANK.DEF) return 0.8;

  const shirt = player.shirtNumber;
  const weight = shirt === undefined ? undefined : SCORER_SHIRT_WEIGHT[shirt];

  // The squad midfield has to sit on a slope down from the front four rather
  // than a cliff, or every name behind them prices at the cap and the fold
  // becomes one flat wall with nothing to choose between.
  return weight ?? (position === POSITION_RANK.FWD ? 5 : 3);
}

// Cards go the other way to goals: the holding midfielders and centre-backs
// collect them, the forwards mostly do not. TxLINE prices no card market, so
// this leans on the shirt again - 4 and 6 sit in front of the back four, 5 is
// the centre-back who has to stop things.
const BOOKING_SHIRT_WEIGHT: Record<number, number> = { 4: 1.9, 5: 1.7, 6: 1.9 };

const BOOKING_POSITION_WEIGHT: Record<LineupPosition, number> = {
  DEF: 1.2,
  FWD: 0.7,
  GK: 0.15,
  MID: 1.3,
};

function bookingWeight(player: ScorerPoolPlayer): number {
  const position = player.position ?? "MID";

  if (position === "GK") return BOOKING_POSITION_WEIGHT.GK;

  const shirt = player.shirtNumber;
  const weight = shirt === undefined ? undefined : BOOKING_SHIRT_WEIGHT[shirt];

  return weight ?? BOOKING_POSITION_WEIGHT[position];
}

type ScorerPrice = { anytime: number; first: number };

type BookingPrice = { booked: number; sentOff: number };

// Roughly a red every four matches across both sides, against the card line the
// totals market already quotes. Neither is a TxLINE price - no card market is
// published - so both are house numbers.
const REDS_PER_TEAM = 0.12;

function buildBookingPrices(
  teams: ScorerPoolTeam[],
): Map<number, BookingPrice> {
  const cardsPerTeam = PREDICTION_LINES.cards / 2;
  const prices = new Map<number, BookingPrice>();

  for (const team of teams) {
    const weights = team.players.map(bookingWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (!totalWeight) continue;

    team.players.forEach((player, index) => {
      const share = (weights[index] ?? 0) / totalWeight;

      if (share <= 0) return;

      prices.set(player.playerId, {
        booked: 1 / (1 - Math.exp(-cardsPerTeam * share)),
        sentOff: 1 / (1 - Math.exp(-REDS_PER_TEAM * share)),
      });
    });
  }

  return prices;
}

// Prices every player off the same Poisson the scoreline board runs on: the
// team's expected goals split by shirt weight gives one player's expected
// goals, which is all three calls.
function buildScorerPrices(
  teams: ScorerPoolTeam[],
  homeLambda: number,
  awayLambda: number,
): Map<number, ScorerPrice> {
  const totalLambda = homeLambda + awayLambda;
  const anyGoal = 1 - Math.exp(-totalLambda);
  const prices = new Map<number, ScorerPrice>();

  for (const team of teams) {
    const teamLambda = team.isHome ? homeLambda : awayLambda;
    const weights = team.players.map(scorerWeight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (!totalWeight) continue;

    team.players.forEach((player, index) => {
      const lambda = teamLambda * ((weights[index] ?? 0) / totalWeight);

      if (lambda <= 0) return;

      // Anytime: this player scores at least once.
      // First and last: this player takes the goal, given the match has one.
      // The two ends are symmetric, so they carry the same price.
      const ordered = (lambda / totalLambda) * anyGoal;

      prices.set(player.playerId, {
        anytime: 1 / (1 - Math.exp(-lambda)),
        first: ordered > 0 ? 1 / ordered : Infinity,
      });
    });
  }

  return prices;
}

function roundedOdds(odds: number | undefined): number | undefined {
  return odds !== undefined && Number.isFinite(odds)
    ? Math.round(odds * 100) / 100
    : undefined;
}

type ScorerEntry = {
  iso: string | undefined;
  player: ScorerPoolPlayer;
  rank: number;
  teamName: string;
};

// A player-props board: a row per player, a column per market, so one pass down
// the likeliest names settles every call. The long tail folds away behind the
// same quiet row the Match result card uses for its scorelines, and a picked
// player from that tail stays on screen so collapsing never hides a call.
// Goal scorers and bookings are the same board on different odds and ordering.
function PlayerPropBoard({
  draft,
  folded,
  label,
  markets,
  oddsFor,
  onPick,
  players,
  provisional,
}: {
  draft: MatchPrediction;
  folded: number;
  label: string;
  markets: readonly PlayerMarket[];
  oddsFor: (entry: ScorerEntry, field: PlayerMarketField) => number | undefined;
  onPick: (field: PlayerMarketField, pick: PlayerPick | null) => void;
  players: ScorerEntry[];
  provisional: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pickedIds = markets.map((market) => {
    const pick = draft[market.field];

    return pick && pick !== "none" ? pick.playerId : null;
  });
  const visible = players.filter(
    (entry, index) =>
      expanded ||
      index < SCORER_FOLD ||
      pickedIds.includes(entry.player.playerId),
  );
  const marketCell = (entry: ScorerEntry, market: PlayerMarket) => {
    const pick = draft[market.field] ?? null;
    const pressed =
      pick !== null &&
      pick !== "none" &&
      pick.playerId === entry.player.playerId;
    const price = oddsFor(entry, market.field);
    const points = scorerPoints(market.field, price);

    return (
      <Toggle
        aria-label={`${formatPlayerDisplayName(entry.player.name)}, ${market.title.toLowerCase()}, pays ${points} points`}
        className="mp2-scorer-cell aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground"
        key={market.field}
        onPressedChange={(next: boolean) => {
          if (!next) {
            onPick(market.field, null);
            return;
          }

          const picked: PlayerPick = {
            name: entry.player.name,
            playerId: entry.player.playerId,
            ...(price === undefined ? {} : { odds: price }),
            ...(provisional ? { provisional: true } : {}),
          };

          onPick(market.field, picked);
        }}
        pressed={pressed}
        variant="outline"
      >
        +{points}
      </Toggle>
    );
  };

  return (
    <div
      className="mt-3.5 overflow-hidden rounded-[18px] bg-black/25"
      style={{ "--mp2-scorer-cols": markets.length } as CSSProperties}
    >
      <div className="mp2-scorer-row mp2-scorer-head">
        <span>Player</span>
        {markets.map((market) => (
          <span key={market.field}>{market.short}</span>
        ))}
      </div>
      <div aria-label={label} className="p-3.5" role="group">
        {visible.map((entry) => (
          <div className="mp2-scorer-row" key={entry.player.playerId}>
            <span className="mp2-scorer-player">
              {/* Between the preset's sm and default sizes: sm reads as an
                  afterthought against the point chips, default crowds them. */}
              <Avatar className="size-7">
                {entry.player.imageUrl ? (
                  <AvatarImage alt="" src={entry.player.imageUrl} />
                ) : null}
                <AvatarFallback>{entry.player.name[0]}</AvatarFallback>
              </Avatar>
              {entry.iso ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="size-[18px] shrink-0 rounded-full object-cover ring-1 ring-white/15"
                  src={`https://flagcdn.com/w40/${entry.iso}.png`}
                  title={entry.teamName}
                />
              ) : null}
              <span className="mp2-scorer-name">
                {shortPlayerName(entry.player.name)}
              </span>
            </span>
            {markets.map((market) => marketCell(entry, market))}
          </div>
        ))}
        {folded ? (
          <button
            aria-label={
              expanded ? "Show fewer players" : "Show more players"
            }
            className="text-muted-foreground hover:text-foreground mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-2xl bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span className="text-xs leading-4 font-medium">
              {expanded ? "Fewer players" : `More players (${folded})`}
            </span>
            <HugeiconsIcon
              icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
              size={12}
              strokeWidth={2.5}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Pre-kickoff market cards, kept to the shadcn preset: outline ToggleGroups
// for every market (pressed = primary, the commitment colour), plain Inputs
// for the exact score, an AvatarGroup for the league tally, and an Accordion
// holding the long tail. Points carry the live TxLINE odds.
function MarketCards({
  board,
  draft,
  fixture,
  odds1x2,
  patchDraft,
  scorerPool,
  sideMarkets,
}: {
  board: OddsBoard | undefined;
  draft: MatchPrediction;
  fixture: WorldCupFixture;
  odds1x2: { away: number; draw: number; home: number } | null;
  patchDraft: (recipe: (previous: MatchPrediction) => MatchPrediction) => void;
  scorerPool: ScorerPool | null;
  sideMarkets: SideMarkets | null;
}) {
  const draftSidePicks = draft.sidePicks ?? [];
  // Double chance panels into the Match result card, derived from the 1X2.
  const doubleChanceOffers = buildSideOffers(board, fixture);
  // The rest of the side markets come straight off the TxLINE feed: first-half
  // 1X2 and goals, the goals line, and the +/-1.5 handicap. Every offer bakes
  // in the price it was taken at; keys must come from the sidePick helpers so
  // the toggle groups can match a saved pick back to its offer.
  const pctOdds = (pct: number) => roundOdds(100 / Math.max(pct, 0.1));
  const sideOffer = (pick: SidePick, label: string): SideOffer => ({
    key: sidePickKey(pick),
    label,
    marketKey: sidePickMarketKey(pick),
    pick,
  });
  const halfResult = sideMarkets?.halfResult ?? null;
  const halfResultOffers = halfResult
    ? [
        sideOffer(
          { kind: "half_result", odds: pctOdds(halfResult.homePct), pick: "home" },
          fixture.homeTeam,
        ),
        sideOffer(
          { kind: "half_result", odds: pctOdds(halfResult.drawPct), pick: "draw" },
          "Draw",
        ),
        sideOffer(
          { kind: "half_result", odds: pctOdds(halfResult.awayPct), pick: "away" },
          fixture.awayTeam,
        ),
      ]
    : null;
  const halfGoalLine = sideMarkets?.halfGoalLine ?? null;
  const halfGoalsOffers = halfGoalLine
    ? (["over", "under"] as const).map((pick) =>
        sideOffer(
          {
            kind: "half_goals_line",
            line: halfGoalLine.line,
            odds: pctOdds(
              pick === "over" ? halfGoalLine.overPct : halfGoalLine.underPct,
            ),
            pick,
          },
          `${pick === "over" ? "Over" : "Under"} ${halfGoalLine.line}`,
        ),
      )
    : null;
  const handicap = sideMarkets?.handicap ?? null;
  const marginOffers = handicap
    ? [
        sideOffer(
          {
            kind: "handicap",
            line: handicap.line,
            odds: pctOdds(handicap.homePct),
            pick: "home",
          },
          `${fixture.homeTeam} ${handicapLineLabel(handicap.line)}`,
        ),
        sideOffer(
          {
            kind: "handicap",
            line: handicap.line,
            odds: pctOdds(handicap.awayPct),
            pick: "away",
          },
          `${fixture.awayTeam} ${handicapLineLabel(-handicap.line)}`,
        ),
      ]
    : null;
  // The goals line pays the real market price per side once TxLINE quotes it.
  const goalsLineOdds = sideMarkets?.goalLine
    ? {
        over: pctOdds(sideMarkets.goalLine.overPct),
        under: pctOdds(sideMarkets.goalLine.underPct),
      }
    : null;
  // One outcome per market; an empty group value means the pick was
  // toggled off.
  const sideGroupValue = (marketKey: string) => {
    const active = draftSidePicks.find(
      (pick) => sidePickMarketKey(pick) === marketKey,
    );

    return active ? [sidePickKey(active)] : [];
  };
  const onSideGroupChange =
    (marketKey: string, offers: SideOffer[]) => (groupValue: unknown[]) => {
      const offer = offers.find((candidate) => candidate.key === groupValue[0]);

      patchDraft((previous) => {
        const cleared = (previous.sidePicks ?? []).filter(
          (pick) => sidePickMarketKey(pick) !== marketKey,
        );

        if (!offer) {
          return { ...previous, sidePicks: cleared };
        }

        if (cleared.length >= MAX_SIDE_PICKS) {
          return previous;
        }

        return { ...previous, sidePicks: [...cleared, offer.pick] };
      });
    };
  const totalsRows: Array<{
    field: "totalCards" | "totalCorners" | "totalGoals";
    label: string;
    line: number;
  }> = [
    { field: "totalGoals", label: "Goals", line: PREDICTION_LINES.goals },
    { field: "totalCorners", label: "Corners", line: PREDICTION_LINES.corners },
    { field: "totalCards", label: "Cards", line: PREDICTION_LINES.cards },
  ];
  // Both squads ranked into one list rather than a block per team: the question
  // the board answers is who scores, and the likeliest names from either side
  // belong side by side at the top. The flag on each row carries the team.
  const scorerPlayers = (scorerPool?.teams ?? [])
    .flatMap((team) =>
      team.players.map((player) => ({
        iso: teamFlag(team.teamName),
        player,
        rank: scorerRank(player),
        teamName: team.teamName,
      })),
    )
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.teamName.localeCompare(b.teamName) ||
        a.player.name.localeCompare(b.player.name),
    );
  const foldedScorers = Math.max(0, scorerPlayers.length - SCORER_FOLD);
  // The same squads, reordered: bookings live in midfield and defence, so the
  // scorer board's ranking would bury exactly the names worth picking here.
  const bookingPlayers = [...scorerPlayers].sort(
    (a, b) =>
      bookingWeight(b.player) - bookingWeight(a.player) ||
      (a.player.shirtNumber ?? 99) - (b.player.shirtNumber ?? 99) ||
      a.teamName.localeCompare(b.teamName),
  );
  const foldedBookings = Math.max(0, bookingPlayers.length - SCORER_FOLD);
  const bookingPrices = buildBookingPrices(scorerPool?.teams ?? []);
  const resultShares = impliedShares([
    odds1x2?.home,
    odds1x2?.draw,
    odds1x2?.away,
  ]);
  const pct = (share: number | null) =>
    share === null ? null : `${Math.round(share)}%`;
  // Win-chance bar segments: each team in its glow colour, draw neutral.
  const homeIso = teamFlag(fixture.homeTeam);
  const awayIso = teamFlag(fixture.awayTeam);
  const shareSegments = [
    {
      color: (homeIso && teamGlow[homeIso]) || "#8b8b96",
      label: fixture.homeTeam,
      share: resultShares[0] ?? 0,
    },
    { color: "#3f3f46", label: "Draw", share: resultShares[1] ?? 0 },
    {
      color: (awayIso && teamGlow[awayIso]) || "#8b8b96",
      label: fixture.awayTeam,
      share: resultShares[2] ?? 0,
    },
  ];
  // Six most likely scorelines from the Poisson fit; hidden when the board
  // has no goals line to anchor the model.
  const goalsBoardLine = board?.overUnder?.find(
    (entry) =>
      entry.line === PREDICTION_LINES.goals && entry.prices.length >= 2,
  );
  const scoreModel = (() => {
    const overShare = impliedShares([
      goalsBoardLine?.prices[0],
      goalsBoardLine?.prices[1],
    ])[0];
    const [homeShare, drawShare, awayShare] = resultShares;

    if (
      overShare === null ||
      homeShare === null ||
      drawShare === null ||
      awayShare === null
    ) {
      return null;
    }

    const lambda = solveTotalLambda(overShare / 100);
    const homeWeight = (homeShare + drawShare / 2) / 100;
    const homeLambda = Math.max(0.15, lambda * homeWeight);
    const awayLambda = Math.max(0.15, lambda - homeLambda);
    const cells: Array<{ away: number; home: number; prob: number }> = [];

    // The full realistic universe up to 8-8, most likely first; the pill
    // board folds it to three rows until the fan asks for more.
    for (let homeGoals = 0; homeGoals <= 8; homeGoals += 1) {
      for (let awayGoals = 0; awayGoals <= 8; awayGoals += 1) {
        cells.push({
          away: awayGoals,
          home: homeGoals,
          prob:
            poissonPmf(homeGoals, homeLambda) *
            poissonPmf(awayGoals, awayLambda),
        });
      }
    }

    cells.sort((left, right) => right.prob - left.prob);

    const price = (home: number, away: number) =>
      Math.round(
        100 / (poissonPmf(home, homeLambda) * poissonPmf(away, awayLambda)),
      ) / 100;

    return {
      awayLambda,
      board: cells.map((cell) => ({
        ...cell,
        odds: price(cell.home, cell.away),
      })),
      homeLambda,
      price,
    };
  })();
  const scorelines = scoreModel?.board ?? null;
  // The same Poisson that prices the scoreline board prices the scorers: no
  // separate model, and the two always agree about how many goals are coming.
  const scorerPrices = scoreModel
    ? buildScorerPrices(
        scorerPool?.teams ?? [],
        scoreModel.homeLambda,
        scoreModel.awayLambda,
      )
    : new Map<number, ScorerPrice>();
  // Keep the frozen scoreline odds in step with the draft score: the model
  // prices whatever score is currently picked (board pill or custom call),
  // so the ticket and the pills always agree. Runs after every render with
  // an equality guard - the model odds drift with the live prices, so a
  // deps array would fight the board updates.
  const hasScorePick = draft.homeGoals != null && draft.awayGoals != null;
  const draftScoreOdds =
    scoreModel && draft.homeGoals != null && draft.awayGoals != null
      ? scoreModel.price(draft.homeGoals, draft.awayGoals)
      : null;

  useEffect(() => {
    if ((draft.exactScoreOdds ?? null) !== draftScoreOdds) {
      patchDraft((previous) => ({
        ...previous,
        exactScoreOdds: draftScoreOdds,
      }));
    }
  });

  // Freeze the goals-line prices into the draft the same way, so settlement
  // pays what the board showed at save time, not what the market drifted to.
  const draftGoalsOdds = draft.totalGoals != null ? goalsLineOdds : null;

  useEffect(() => {
    const current = draft.totalGoalsOdds ?? null;
    const unchanged =
      current === draftGoalsOdds ||
      (current !== null &&
        draftGoalsOdds !== null &&
        current.over === draftGoalsOdds.over &&
        current.under === draftGoalsOdds.under);

    if (!unchanged) {
      patchDraft((previous) => ({
        ...previous,
        totalGoalsOdds: draftGoalsOdds,
      }));
    }
  });

  // Specials TxLINE publishes no odds for, priced off this page's own model:
  // both-teams-to-score from the Poisson lambdas, penalty and own goal from
  // their base rates at recent World Cups. Settlement reads the game_finalised
  // player record, and voids if that record never arrives.
  const PENALTY_PROB = 0.3;
  const OWN_GOAL_PROB = 0.1;
  const yesNoOffers = (
    kind: "btts" | "own_goal" | "penalty",
    probability: number | null,
  ) =>
    probability === null
      ? null
      : (["yes", "no"] as const).map((pick) =>
          sideOffer(
            {
              kind,
              odds: roundOdds(
                1 / Math.max(pick === "yes" ? probability : 1 - probability, 0.01),
              ),
              pick,
            },
            pick === "yes" ? "Yes" : "No",
          ),
        );
  const bttsOffers = yesNoOffers(
    "btts",
    scoreModel
      ? (1 - Math.exp(-scoreModel.homeLambda)) *
          (1 - Math.exp(-scoreModel.awayLambda))
      : null,
  );
  const penaltyOffers = yesNoOffers("penalty", PENALTY_PROB);
  const ownGoalOffers = yesNoOffers("own_goal", OWN_GOAL_PROB);
  const specialsRows = [
    ...(halfGoalsOffers
      ? [{ key: "hg", label: "1st-half goals", offers: halfGoalsOffers }]
      : []),
    ...(marginOffers ? [{ key: "ah", label: "Margin", offers: marginOffers }] : []),
    ...(bttsOffers
      ? [{ key: "btts", label: "Both score", offers: bttsOffers }]
      : []),
    ...(penaltyOffers
      ? [{ key: "pen", label: "Penalty", offers: penaltyOffers }]
      : []),
    ...(ownGoalOffers
      ? [{ key: "og", label: "Own goal", offers: ownGoalOffers }]
      : []),
  ];

  const [scoresExpanded, setScoresExpanded] = useState(false);
  // The picked score never leaves the visible board: it swaps in for the
  // last collapsed pill, and a legacy score beyond 8-8 gets a synthetic
  // pill (priced by the model) that disappears once the pick changes.
  const pickedCell = (() => {
    const home = draft.homeGoals;
    const away = draft.awayGoals;

    if (!scoreModel || home == null || away == null) {
      return null;
    }

    return (
      scoreModel.board.find(
        (cell) => cell.home === home && cell.away === away,
      ) ?? { away, home, odds: scoreModel.price(home, away), prob: 0 }
    );
  })();
  const visibleScorelines = (() => {
    if (!scorelines) {
      return null;
    }

    const base = scoresExpanded
      ? scorelines
      : scorelines.slice(0, SCORE_FOLD);

    if (
      !pickedCell ||
      base.some(
        (cell) =>
          cell.home === pickedCell.home && cell.away === pickedCell.away,
      )
    ) {
      return base;
    }

    return scoresExpanded
      ? [...base, pickedCell]
      : [...base.slice(0, SCORE_FOLD - 1), pickedCell];
  })();

  const itemClass =
    "flex-1 justify-between gap-2 aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground";
  const ptsClass =
    "text-muted-foreground text-xs font-semibold group-aria-pressed/toggle:text-primary-foreground/70";
  const rowClass = "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3";
  const rowLabelClass = "text-muted-foreground text-xs font-medium";

  return (
    <>
      <section aria-labelledby="market-result-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-result-heading">Match result</h2>
          <span
            className="text-muted-foreground cursor-help"
            title="Bold winner calls pay more - points scale with the live TxLINE odds, up to 30."
          >
            <HugeiconsIcon
              aria-label="How winner points work"
              icon={InformationCircleIcon}
              size={16}
              strokeWidth={2.5}
            />
          </span>
        </div>
        <div className="mt-3.5 flex flex-col gap-3">
          <ToggleGroup
            aria-label="Match result"
            className="w-full"
            onValueChange={(groupValue: unknown[]) => {
              const pick = (groupValue[0] as WinnerPick | undefined) ?? null;

              patchDraft((previous) => ({ ...previous, winner: pick }));
            }}
            value={draft.winner ? [draft.winner] : []}
          >
            {(
              [
                { iso: teamFlag(fixture.homeTeam), label: fixture.homeTeam, value: "home" },
                { iso: null, label: "Draw", value: "draw" },
                { iso: teamFlag(fixture.awayTeam), label: fixture.awayTeam, value: "away" },
              ] as const
            ).map((option) => (
              <ToggleGroupItem
                aria-label={`${option.label}, pays ${winnerPoints(odds1x2?.[option.value])} points`}
                className="h-10 flex-1 justify-between gap-2 px-3 aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground"
                key={option.value}
                value={option.value}
                variant="outline"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {option.iso ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="size-5 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                      src={`https://flagcdn.com/w40/${option.iso}.png`}
                    />
                  ) : (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3f3f46] text-white/85 ring-1 ring-white/10">
                      <HugeiconsIcon
                        aria-hidden
                        icon={EqualSignIcon}
                        size={12}
                        strokeWidth={2.5}
                      />
                    </span>
                  )}
                  <span className="truncate text-[13.5px] leading-5 font-medium">
                    {option.label}
                  </span>
                </span>
                <span className="text-muted-foreground translate-y-[0.5px] text-[12.5px] leading-5 font-semibold group-aria-pressed/toggle:text-primary-foreground/70">
                  +{winnerPoints(odds1x2?.[option.value])}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {resultShares[0] !== null ? (
            <div
              className="flex flex-col gap-1.5"
              title="Implied by the live TxLINE prices"
            >
              <TooltipProvider delay={80}>
                <div
                  aria-label={`Market chance: ${fixture.homeTeam} ${pct(resultShares[0])}, draw ${pct(resultShares[1])}, ${fixture.awayTeam} ${pct(resultShares[2])}`}
                  className="flex h-2 gap-[3px] overflow-hidden rounded-full"
                  role="img"
                >
                  {shareSegments.map((segment) => (
                    <Tooltip key={segment.label}>
                      <TooltipTrigger
                        render={
                          <span
                            className="h-full rounded-full"
                            style={{
                              background: segment.color,
                              width: `${segment.share}%`,
                            }}
                          />
                        }
                      />
                      <TooltipContent>
                        {segment.label} · {pct(segment.share)}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          ) : null}
          {scorelines ? (
            <div className="mt-2 overflow-hidden rounded-[18px] bg-black/25">
              <h3 className="mp2-subhead">
                Exact score
                <span
                  className="text-muted-foreground cursor-help"
                  title="Rarer scorelines pay more - points follow the fair odds from the live TxLINE prices, from 5 up to 30."
                >
                  <HugeiconsIcon
                    aria-label="How exact-score points work"
                    icon={InformationCircleIcon}
                    size={16}
                    strokeWidth={2.5}
                  />
                </span>
              </h3>
              <div className="p-3.5">
                <ToggleGroup
                  aria-label="Exact score"
                  className="grid w-full grid-cols-4 gap-2"
                  onValueChange={(groupValue: unknown[]) => {
                    const picked = scorelines.find(
                      (cell) => `${cell.home}-${cell.away}` === groupValue[0],
                    );

                    // Re-clicking the pressed pill empties the group: the
                    // score market is skipped, not reassigned.
                    patchDraft((previous) => ({
                      ...previous,
                      awayGoals: picked ? picked.away : null,
                      exactScoreOdds: picked ? picked.odds : null,
                      homeGoals: picked ? picked.home : null,
                    }));
                  }}
                  value={
                    hasScorePick
                      ? [`${draft.homeGoals}-${draft.awayGoals}`]
                      : []
                  }
                >
                  {(visibleScorelines ?? []).map((cell) => (
                    <ToggleGroupItem
                      aria-label={`${cell.home} - ${cell.away}, pays ${exactScorePoints(cell.odds)} points`}
                      className="h-10 flex-1 justify-between gap-2 px-3 aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground"
                      key={`${cell.home}-${cell.away}`}
                      value={`${cell.home}-${cell.away}`}
                      variant="outline"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {homeIso ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={fixture.homeTeam}
                            className="size-4 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                            src={`https://flagcdn.com/w40/${homeIso}.png`}
                          />
                        ) : null}
                        <span className="text-[13.5px] leading-5 font-medium">
                          {cell.home} - {cell.away}
                        </span>
                        {awayIso ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={fixture.awayTeam}
                            className="size-4 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                            src={`https://flagcdn.com/w40/${awayIso}.png`}
                          />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground translate-y-[0.5px] text-[12.5px] leading-5 font-semibold group-aria-pressed/toggle:text-primary-foreground/70">
                        +{exactScorePoints(cell.odds)}
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <button
                  aria-label={
                    scoresExpanded
                      ? "Show fewer scorelines"
                      : "Show more scorelines"
                  }
                  className="text-muted-foreground hover:text-foreground mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-2xl bg-white/[0.03] transition-colors hover:bg-white/[0.06]"
                  onClick={() => setScoresExpanded((value) => !value)}
                  type="button"
                >
                  <span className="text-xs leading-4 font-medium">
                    {scoresExpanded
                      ? "Fewer scores"
                      : `More scores (${scorelines.length - SCORE_FOLD})`}
                  </span>
                  <HugeiconsIcon
                    icon={scoresExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                    size={12}
                    strokeWidth={2.5}
                  />
                </button>
              </div>
            </div>
          ) : null}
          {doubleChanceOffers ? (
            <div className="mt-2 overflow-hidden rounded-[18px] bg-black/25">
              <h3 className="mp2-subhead">
                Double chance
                <span
                  className="text-muted-foreground cursor-help"
                  title="Cover two results with one pick - points pay double the TxLINE odds, up to 20."
                >
                  <HugeiconsIcon
                    aria-label="How double-chance points work"
                    icon={InformationCircleIcon}
                    size={16}
                    strokeWidth={2.5}
                  />
                </span>
              </h3>
              <div className="p-3.5">
                <ToggleGroup
                  aria-label="Double chance"
                  className="w-full flex-col items-stretch"
                  onValueChange={onSideGroupChange(
                    "dc",
                    doubleChanceOffers,
                  )}
                  value={sideGroupValue("dc")}
                >
                  {doubleChanceOffers.map((offer) => {
                    const cover =
                      offer.pick.kind === "double_chance"
                        ? offer.pick.pick
                        : null;
                    const icons =
                      cover === "home_draw"
                        ? [homeIso, null]
                        : cover === "home_away"
                          ? [homeIso, awayIso]
                          : [null, awayIso];
                    const label =
                      cover === "home_draw"
                        ? `${fixture.homeTeam} or Draw`
                        : cover === "home_away"
                          ? `${fixture.homeTeam} or ${fixture.awayTeam}`
                          : `Draw or ${fixture.awayTeam}`;

                    return (
                      <ToggleGroupItem
                        aria-label={`${label}, pays ${sidePickPoints(offer.pick.odds)} points`}
                        className="h-10 justify-between gap-2 px-3 aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground"
                        key={offer.key}
                        value={offer.key}
                        variant="outline"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex shrink-0 items-center">
                            <OutcomeCircle iso={icons[0]} />
                            <span className="-ml-2 flex">
                              <OutcomeCircle iso={icons[1]} />
                            </span>
                          </span>
                          <span
                            className="truncate text-[13.5px] leading-5 font-medium"
                            title={label}
                          >
                            {label}
                          </span>
                        </span>
                        <span className="text-muted-foreground translate-y-[0.5px] text-[12.5px] leading-5 font-semibold group-aria-pressed/toggle:text-primary-foreground/70">
                          +{sidePickPoints(offer.pick.odds)}
                        </span>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            </div>
          ) : null}
          {halfResultOffers ? (
            <div className="mt-2 overflow-hidden rounded-[18px] bg-black/25">
              <h3 className="mp2-subhead">
                First-half result
                <span
                  className="text-muted-foreground cursor-help"
                  title="Call the score line at half-time - points pay double the TxLINE first-half odds, up to 20."
                >
                  <HugeiconsIcon
                    aria-label="How first-half points work"
                    icon={InformationCircleIcon}
                    size={16}
                    strokeWidth={2.5}
                  />
                </span>
              </h3>
              <div className="p-3.5">
                <ToggleGroup
                  aria-label="First-half result"
                  className="w-full flex-col items-stretch"
                  onValueChange={onSideGroupChange("hr", halfResultOffers)}
                  value={sideGroupValue("hr")}
                >
                  {halfResultOffers.map((offer) => {
                    const side =
                      offer.pick.kind === "half_result" ? offer.pick.pick : null;

                    return (
                      <ToggleGroupItem
                        aria-label={`${offer.label} at half-time, pays ${sidePickPoints(offer.pick.odds)} points`}
                        className="h-10 justify-between gap-2 px-3 aria-pressed:bg-primary/85 aria-pressed:text-primary-foreground"
                        key={offer.key}
                        value={offer.key}
                        variant="outline"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <OutcomeCircle
                            iso={
                              side === "home"
                                ? homeIso
                                : side === "away"
                                  ? awayIso
                                  : null
                            }
                          />
                          <span
                            className="truncate text-[13.5px] leading-5 font-medium"
                            title={offer.label}
                          >
                            {offer.label}
                          </span>
                        </span>
                        <span className="text-muted-foreground translate-y-[0.5px] text-[12.5px] leading-5 font-semibold group-aria-pressed/toggle:text-primary-foreground/70">
                          +{sidePickPoints(offer.pick.odds)}
                        </span>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="market-totals-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-totals-heading">Markets</h2>
          <span
            className="text-muted-foreground cursor-help"
            title="Totals pay a flat +2 each. The extra lines follow the live TxLINE odds - the bolder the call, the more it pays, up to 20."
          >
            <HugeiconsIcon
              aria-label="How market points work"
              icon={InformationCircleIcon}
              size={16}
              strokeWidth={2.5}
            />
          </span>
        </div>
        <div className="mt-3.5 flex flex-col gap-3">
          <div className="overflow-hidden rounded-[18px] bg-black/25">
            <h3 className="mp2-subhead">
              Totals
              <span className="mp2-card-hint">
                {goalsLineOdds
                  ? "Goals follow the market; corners & cards +2"
                  : `+${PREDICTION_POINTS.line} pts each`}
              </span>
            </h3>
            <div className="flex flex-col gap-2.5 p-3.5">
              {totalsRows.map((row) => {
                const rowPts = (pick: "over" | "under") =>
                  row.field === "totalGoals" && goalsLineOdds
                    ? sidePickPoints(goalsLineOdds[pick])
                    : PREDICTION_POINTS.line;

                return (
            <div className={rowClass} key={row.field}>
              <span className={rowLabelClass}>{row.label}</span>
              <ToggleGroup
                aria-label={`${row.label} over/under ${row.line}`}
                className="w-full"
                onValueChange={(groupValue: unknown[]) => {
                  const pick = groupValue[0] as "over" | "under" | undefined;

                  patchDraft((previous) => ({
                    ...previous,
                    [row.field]: pick ?? null,
                  }));
                }}
                value={draft[row.field] ? [draft[row.field] as string] : []}
              >
                <ToggleGroupItem
                  aria-label={`Over ${row.line}, pays ${rowPts("over")} points`}
                  className={itemClass}
                  value="over"
                  variant="outline"
                >
                  <span>Over {row.line}</span>
                  <span className={ptsClass}>+{rowPts("over")}</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label={`Under ${row.line}, pays ${rowPts("under")} points`}
                  className={itemClass}
                  value="under"
                  variant="outline"
                >
                  <span>Under {row.line}</span>
                  <span className={ptsClass}>+{rowPts("under")}</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
                );
              })}
            </div>
          </div>
          {specialsRows.length > 0 ? (
            <div className="overflow-hidden rounded-[18px] bg-black/25">
              <h3 className="mp2-subhead">
                Specials
                <span className="mp2-card-hint">Points follow the odds</span>
              </h3>
              <div className="flex flex-col gap-2.5 p-3.5">
                {specialsRows.map((row) => (
                  <div className={rowClass} key={row.key}>
                    <span className={rowLabelClass}>{row.label}</span>
                    <ToggleGroup
                      aria-label={row.label}
                      className="w-full"
                      onValueChange={onSideGroupChange(row.key, row.offers)}
                      value={sideGroupValue(row.key)}
                    >
                      {row.offers.map((offer) => (
                        <ToggleGroupItem
                          aria-label={`${row.label}: ${offer.label}, pays ${sidePickPoints(offer.pick.odds)} points`}
                          className={itemClass}
                          key={offer.key}
                          value={offer.key}
                          variant="outline"
                        >
                          <span className="truncate" title={offer.label}>
                            {offer.label}
                          </span>
                          <span className={ptsClass}>
                            +{sidePickPoints(offer.pick.odds)}
                          </span>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="market-scorer-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-scorer-heading">Goal scorers</h2>
          <span
            className="text-muted-foreground cursor-help"
            title="Settled from the TxLINE goal feed. Points scale with how likely the player is to score, so the long shots pay the most."
          >
            <HugeiconsIcon
              aria-label="How scorer points work"
              icon={InformationCircleIcon}
              size={16}
              strokeWidth={2.5}
            />
          </span>
        </div>
        {scorerPlayers.length ? (
          <PlayerPropBoard
            draft={draft}
            folded={foldedScorers}
            label="Goal scorers"
            markets={SCORER_MARKETS}
            oddsFor={(entry, field) => {
              const price = scorerPrices.get(entry.player.playerId);

              // First and last are symmetric ends of the same match, so they
              // share a price.
              return roundedOdds(
                field === "anytimeScorer" ? price?.anytime : price?.first,
              );
            }}
            onPick={(field, pick) =>
              patchDraft((previous) => ({ ...previous, [field]: pick }))
            }
            players={scorerPlayers}
            provisional={scorerPool?.provisional ?? false}
          />
        ) : (
          <p className="muted">
            Scorer picks unavailable: no squad is published for this fixture
            yet.
          </p>
        )}
      </section>

      <section aria-labelledby="market-booking-heading" className="card">
        <div className="mp2-card-heading">
          <h2 id="market-booking-heading">Bookings</h2>
          <span
            className="text-muted-foreground cursor-help"
            title="Settled at full time from the TxLINE per-player card record. Points scale with how likely the player is to be carded, so a striker pays more than a holding midfielder."
          >
            <HugeiconsIcon
              aria-label="How booking points work"
              icon={InformationCircleIcon}
              size={16}
              strokeWidth={2.5}
            />
          </span>
        </div>
        {bookingPlayers.length ? (
          <PlayerPropBoard
            draft={draft}
            folded={foldedBookings}
            label="Bookings"
            markets={BOOKING_MARKETS}
            oddsFor={(entry, field) => {
              const price = bookingPrices.get(entry.player.playerId);

              return roundedOdds(
                field === "bookedPlayer" ? price?.booked : price?.sentOff,
              );
            }}
            onPick={(field, pick) =>
              patchDraft((previous) => ({ ...previous, [field]: pick }))
            }
            players={bookingPlayers}
            provisional={scorerPool?.provisional ?? false}
          />
        ) : (
          <p className="muted">
            Booking picks unavailable: no squad is published for this fixture
            yet.
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

    // Reduced motion snaps via a zero-duration tween (still async, so no
    // cascading synchronous state updates inside the effect).
    const controls = animate(from, points, {
      duration: reducedMotion ? 0 : 0.5,
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

// The little picture that leads each slip row, matching what the boards show:
// flags for team outcomes, the player's face for player markets, an arrow for
// a line.
type TicketVisual =
  | { kind: "circles"; isos: Array<string | null> }
  | { kind: "player"; imageUrl?: string; initial: string }
  | { kind: "updown"; pick: LinePick };

function TicketCard({
  draft,
  fixture,
  odds1x2,
  onSave,
  saved,
  scorerPool,
}: {
  draft: MatchPrediction;
  fixture: WorldCupFixture;
  odds1x2: { away: number; draw: number; home: number } | null;
  onSave: (odds1x2: { away: number; draw: number; home: number } | null) => void;
  saved: boolean;
  scorerPool: ScorerPool | null;
}) {
  const draftSidePicks = draft.sidePicks ?? [];
  const winnerNames = {
    away: fixture.awayTeam,
    draw: "Draw",
    home: fixture.homeTeam,
  } as const;
  const homeIso = teamFlag(fixture.homeTeam) ?? null;
  const awayIso = teamFlag(fixture.awayTeam) ?? null;
  const sideIso = (side: "away" | "draw" | "home") =>
    side === "home" ? homeIso : side === "away" ? awayIso : null;
  const playerVisual = (pick: PlayerPick | "none"): TicketVisual => {
    if (pick === "none") {
      return { kind: "circles", isos: [null] };
    }

    for (const team of scorerPool?.teams ?? []) {
      const found = team.players.find(
        (player) => player.playerId === pick.playerId,
      );

      if (found) {
        return {
          imageUrl: found.imageUrl,
          initial: pick.name[0] ?? "?",
          kind: "player",
        };
      }
    }

    return { initial: pick.name[0] ?? "?", kind: "player" };
  };
  const sideVisual = (pick: SidePick): TicketVisual => {
    switch (pick.kind) {
      case "double_chance":
        return {
          isos:
            pick.pick === "home_draw"
              ? [homeIso, null]
              : pick.pick === "home_away"
                ? [homeIso, awayIso]
                : [null, awayIso],
          kind: "circles",
        };
      case "goals_line":
      case "half_goals_line":
        return { kind: "updown", pick: pick.pick };
      case "half_result":
        return { isos: [sideIso(pick.pick)], kind: "circles" };
      case "handicap":
        return { isos: [sideIso(pick.pick)], kind: "circles" };
      default:
        return { isos: [null], kind: "circles" };
    }
  };
  // Only played markets appear on the ticket; skipped ones cost nothing and
  // pay nothing.
  const ticketRows: Array<{
    market: string;
    pick: string;
    pts: number;
    visual: TicketVisual;
  }> = [
    ...(draft.winner != null
      ? [
          {
            market: "Winner",
            pick: winnerNames[draft.winner],
            pts: winnerPoints(odds1x2?.[draft.winner]),
            visual: { isos: [sideIso(draft.winner)], kind: "circles" as const },
          },
        ]
      : []),
    ...(draft.homeGoals != null && draft.awayGoals != null
      ? [
          {
            market: "Exact score",
            pick: `${draft.homeGoals} - ${draft.awayGoals}`,
            pts: exactScorePoints(draft.exactScoreOdds),
            visual: { isos: [homeIso, awayIso], kind: "circles" as const },
          },
        ]
      : []),
    ...(draft.totalGoals != null
      ? [
          {
            market: "Goals",
            pick: linePickLabel(draft.totalGoals, PREDICTION_LINES.goals),
            pts: draft.totalGoalsOdds
              ? sidePickPoints(draft.totalGoalsOdds[draft.totalGoals])
              : PREDICTION_POINTS.line,
            visual: { kind: "updown" as const, pick: draft.totalGoals },
          },
        ]
      : []),
    ...(draft.totalCorners != null
      ? [
          {
            market: "Corners",
            pick: linePickLabel(draft.totalCorners, PREDICTION_LINES.corners),
            pts: PREDICTION_POINTS.line,
            visual: { kind: "updown" as const, pick: draft.totalCorners },
          },
        ]
      : []),
    ...(draft.totalCards != null
      ? [
          {
            market: "Cards",
            pick: linePickLabel(draft.totalCards, PREDICTION_LINES.cards),
            pts: PREDICTION_POINTS.line,
            visual: { kind: "updown" as const, pick: draft.totalCards },
          },
        ]
      : []),
    ...(draft.firstScorer
      ? [
          {
            market: "First scorer",
            pick:
              draft.firstScorer === "none"
                ? "No goal scorer"
                : shortPlayerName(draft.firstScorer.name),
            pts: scorerPoints(
              "firstScorer",
              draft.firstScorer === "none" ? undefined : draft.firstScorer.odds,
            ),
            visual: playerVisual(draft.firstScorer),
          },
        ]
      : []),
    ...(draft.anytimeScorer
      ? [
          {
            market: "Anytime scorer",
            pick:
              draft.anytimeScorer === "none"
                ? "No goal scorer"
                : shortPlayerName(draft.anytimeScorer.name),
            pts: scorerPoints(
              "anytimeScorer",
              draft.anytimeScorer === "none"
                ? undefined
                : draft.anytimeScorer.odds,
            ),
            visual: playerVisual(draft.anytimeScorer),
          },
        ]
      : []),
    ...(draft.lastScorer
      ? [
          {
            market: "Last scorer",
            pick:
              draft.lastScorer === "none"
                ? "No goal scorer"
                : shortPlayerName(draft.lastScorer.name),
            pts: scorerPoints(
              "lastScorer",
              draft.lastScorer === "none" ? undefined : draft.lastScorer.odds,
            ),
            visual: playerVisual(draft.lastScorer),
          },
        ]
      : []),
    ...(draft.bookedPlayer
      ? [
          {
            market: "Booked",
            pick: shortPlayerName(draft.bookedPlayer.name),
            pts: scorerPoints("bookedPlayer", draft.bookedPlayer.odds),
            visual: playerVisual(draft.bookedPlayer),
          },
        ]
      : []),
    ...(draft.sentOffPlayer
      ? [
          {
            market: "Sent off",
            pick: shortPlayerName(draft.sentOffPlayer.name),
            pts: scorerPoints("sentOffPlayer", draft.sentOffPlayer.odds),
            visual: playerVisual(draft.sentOffPlayer),
          },
        ]
      : []),
    ...draftSidePicks.map((pick) => ({
      ...sidePickSummary(pick, fixture),
      pts: sidePickPoints(pick.odds),
      visual: sideVisual(pick),
    })),
  ];
  const potentialPoints = ticketRows.reduce((total, row) => total + row.pts, 0);

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
      {ticketRows.length > 0 ? (
        <ul className="mp2-ticket-list">
          {ticketRows.map((row, index) => (
            <li key={`${row.market}-${index}`}>
              <span aria-hidden className="mp2-ticket-visual">
                {row.visual.kind === "player" ? (
                  <Avatar className="size-6">
                    {row.visual.imageUrl ? (
                      <AvatarImage alt="" src={row.visual.imageUrl} />
                    ) : null}
                    <AvatarFallback>{row.visual.initial}</AvatarFallback>
                  </Avatar>
                ) : row.visual.kind === "updown" ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3f3f46] text-white/85 ring-1 ring-white/10">
                    <HugeiconsIcon
                      aria-hidden
                      icon={
                        row.visual.pick === "over"
                          ? ArrowUp01Icon
                          : ArrowDown01Icon
                      }
                      size={12}
                      strokeWidth={2.5}
                    />
                  </span>
                ) : (
                  <span className="flex items-center">
                    <OutcomeCircle iso={row.visual.isos[0]} />
                    {row.visual.isos.length > 1 ? (
                      <span className="-ml-2 flex">
                        <OutcomeCircle iso={row.visual.isos[1]} />
                      </span>
                    ) : null}
                  </span>
                )}
              </span>
              <span className="mp2-ticket-market">{row.market}</span>
              <span className="mp2-ticket-pts">+{row.pts}</span>
              <span className="mp2-ticket-pick">{row.pick}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mp2-ticket-empty">
          {/* A blank slip: ghost rows in the shape the real picks will take,
              receding like unprinted lines on the counterfoil. */}
          <div aria-hidden className="mp2-ticket-ghosts">
            {[0, 1, 2].map((row) => (
              <span className="mp2-ticket-ghost" key={row}>
                <i className="mp2-ghost-circle" />
                <span className="mp2-ghost-lines">
                  <i className="mp2-ghost-label" />
                  <i className="mp2-ghost-pick" />
                </span>
                <i className="mp2-ghost-chip" />
              </span>
            ))}
          </div>
          <p className="sr-only">No picks yet.</p>
        </div>
      )}
      <div aria-hidden className="mp2-ticket-tear" />
      <PotentialPoints points={potentialPoints} />
      <Button
        className="mp2-ticket-save"
        disabled={ticketRows.length === 0}
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
          Picks locked at kickoff ({formatDate(fixture.kickoffUtc)}). None
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
        Locked at kickoff ({formatDate(fixture.kickoffUtc)}). Saved{" "}
        {saved.savedAt ? formatDate(saved.savedAt) : "before kickoff"}.
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

type SideOffer = {
  key: string;
  label: string;
  marketKey: string;
  pick: SidePick;
};

function sidePickKey(pick: SidePick): string {
  switch (pick.kind) {
    case "btts":
      return `btts:${pick.pick}`;
    case "double_chance":
      return `dc:${pick.pick}`;
    case "goals_line":
      return `gl:${pick.line}:${pick.pick}`;
    case "half_goals_line":
      return `hg:${pick.pick}`;
    case "half_result":
      return `hr:${pick.pick}`;
    case "handicap":
      return `ah:${pick.pick}`;
    case "own_goal":
      return `og:${pick.pick}`;
    default:
      return `pen:${pick.pick}`;
  }
}

function sidePickMarketKey(pick: SidePick): string {
  switch (pick.kind) {
    case "btts":
      return "btts";
    case "double_chance":
      return "dc";
    case "goals_line":
      return `gl:${pick.line}`;
    case "half_goals_line":
      return "hg";
    case "half_result":
      return "hr";
    case "handicap":
      return "ah";
    case "own_goal":
      return "og";
    default:
      return "pen";
  }
}

function roundOdds(value: number): number {
  return Math.round(value * 100) / 100;
}

// Fair double-chance price from the two covered 1X2 outcomes.
function doubleChanceOdds(first: number, second: number): number {
  return roundOdds(1 / (1 / first + 1 / second));
}

// The one side market on offer: double chance, derived from the live TxLINE
// 1X2 prices. (Goals lines and half-goal handicaps were dropped as
// duplicates of the exact-score board, the 1X2, and these covers.)
function buildSideOffers(
  board: OddsBoard | undefined,
  fixture: WorldCupFixture,
): SideOffer[] | null {
  if (!board?.result) {
    return null;
  }

  const { away, draw, home } = board.result;
  const covers: Array<[DoubleChancePick, string, number]> = [
    ["home_draw", `${fixture.homeTeam} or Draw`, doubleChanceOdds(home, draw)],
    [
      "home_away",
      `${fixture.homeTeam} or ${fixture.awayTeam}`,
      doubleChanceOdds(home, away),
    ],
    ["draw_away", `Draw or ${fixture.awayTeam}`, doubleChanceOdds(draw, away)],
  ];

  return covers.map(([pick, label, odds]) => ({
    key: `dc:${pick}`,
    label,
    marketKey: "dc",
    pick: { kind: "double_chance", odds, pick },
  }));
}


// Commentary feed replicated from Google's match timeline (inspected on the
// real Argentina v Switzerland page): bordered #202124 cards with an
// uppercase tracked header and minute, a blue celebration card for goals
// with the updated scoreline band and the scorer's headshot, card and
// substitution blocks with player rows, and stopwatch dividers for kickoff,
// halftime and full time. Everything else is a plain COMMENTARY card.
type CommentaryPlayer = {
  imageUrl?: string;
  name: string;
  number?: string;
  position?: string;
  teamName: string;
};

const POSITION_LABELS: Record<string, string> = {
  DEF: "Defender",
  FWD: "Striker",
  GK: "Goalkeeper",
  MID: "Midfielder",
};

function HeadsetIcon() {
  return (
    <svg aria-hidden="true" className="cf-headset" fill="currentColor" height="15" viewBox="0 0 24 24" width="15">
      <path d="M12 3a8 8 0 0 0-8 8v6a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H6v-2a6 6 0 1 1 12 0v2h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-6a8 8 0 0 0-8-8Z" />
    </svg>
  );
}

function StopwatchIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 24 24" width="16">
      <path d="M9 1h6v2H9V1Zm10.03 5.39 1.42-1.42 1.41 1.41-1.42 1.42a9 9 0 1 1-1.41-1.41ZM12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm1-11v4.59l2.7 2.7-1.41 1.42L11 15.4V10h2Z" />
    </svg>
  );
}

function CommentaryPlayerRow({
  player,
  ringColor,
}: {
  player: CommentaryPlayer;
  ringColor: string;
}) {
  const iso = teamFlag(player.teamName);
  const position = player.position ? POSITION_LABELS[player.position] : null;

  return (
    <div className="cf-player">
      <div className="cf-player-info">
        <span className="cf-player-name">
          {formatPlayerDisplayName(player.name)}
        </span>
        <span className="cf-player-sub">
          {iso ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={`https://flagcdn.com/w40/${iso}.png`} />
          ) : null}
          {player.teamName}
          {position ? ` · ${position}` : ""}
          {player.number ? ` #${player.number}` : ""}
        </span>
      </div>
      <span className="cf-player-photo" style={{ borderColor: ringColor }}>
        {player.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={player.imageUrl} />
        ) : (
          <span>{player.name[0]}</span>
        )}
      </span>
    </div>
  );
}

function CommentaryFeed({
  entries,
  fixture,
  lineups,
}: {
  entries: DisplayUpdate[];
  fixture: WorldCupFixture;
  lineups: NormalizedLineups | null;
}) {
  const findPlayer = (playerId?: number): CommentaryPlayer | null => {
    if (playerId === undefined) {
      return null;
    }

    for (const team of lineups?.teams ?? []) {
      const player = team.players.find(
        (candidate) => candidate.playerId === playerId,
      );

      if (player) {
        return {
          imageUrl: player.imageUrl,
          name: player.name,
          number: player.number,
          position: player.position,
          teamName: team.teamName,
        };
      }
    }

    return null;
  };
  const ringFor = (teamName?: string) => {
    const iso = teamName ? teamFlag(teamName) : undefined;

    return (iso && teamGlow[iso]) || "#5f6368";
  };
  return (
    <ol className="cf-list" reversed>
      <AnimatePresence initial={false}>
        {[...entries].reverse().map((entry) => {
          const body =
            entry.minute && entry.text.startsWith(`${entry.minute} `)
              ? entry.text.slice(entry.minute.length + 1)
              : entry.text;
          const [homeGoals, awayGoals] = entry.score.split("-");
          let block: ReactNode = null;

          if (
            entry.action === "kickoff" ||
            entry.action === "halftime_finalised" ||
            entry.action === "game_finalised"
          ) {
            const label =
              entry.action === "kickoff"
                ? "Kick-off"
                : entry.action === "halftime_finalised"
                  ? "Half time"
                  : "End of match";

            block = (
              <div className="cf-divider">
                <span className="cf-divider-line" />
                <span className="cf-divider-copy">
                  <StopwatchIcon />
                  <span className="cf-divider-label">{label}</span>
                  <span className="cf-divider-min">
                    {entry.action === "kickoff"
                      ? entry.minute
                      : `${homeGoals} - ${awayGoals}`}
                  </span>
                </span>
                <span className="cf-divider-line" />
              </div>
            );
          } else if (entry.action === "goal") {
            const scorer = findPlayer(entry.playerId);
            const goalBody = body.replace(/\s*Score \d+-\d+\.$/, "");
            const scoringSide =
              scorer && scorer.teamName === fixture.awayTeam ? "away" : "home";
            const teamColor = ringFor(
              scoringSide === "home" ? fixture.homeTeam : fixture.awayTeam,
            );

            block = (
              <div
                className="cf-card cf-goal"
                style={{ "--cf-team": teamColor } as CSSProperties}
              >
                <div className="cf-goal-head">
                  <span className="cf-goal-ball">
                    <LineupGoalIcon />
                  </span>
                  <span className="cf-goal-title">GOOOAAALLL!!!</span>
                  <span className="cf-goal-min">{entry.minute}</span>
                </div>
                <div className="cf-goal-score">
                  <span>{fixture.homeTeam}</span>
                  <strong>{homeGoals}</strong>
                  <span>-</span>
                  <strong>{awayGoals}</strong>
                  <span>{fixture.awayTeam}</span>
                </div>
                {scorer ? (
                  <CommentaryPlayerRow
                    player={scorer}
                    ringColor={ringFor(
                      scoringSide === "home"
                        ? fixture.homeTeam
                        : fixture.awayTeam,
                    )}
                  />
                ) : null}
                <div className="cf-card-body">{goalBody}</div>
              </div>
            );
          } else if (
            entry.action === "yellow_card" ||
            entry.action === "red_card"
          ) {
            const booked = findPlayer(entry.playerId);
            const isRed = entry.action === "red_card";

            block = (
              <div className="cf-card">
                <div className="cf-card-head">
                  <LineupCardIcon color={isRed ? "red" : "yellow"} />
                  <span className="cf-head-title">
                    {isRed ? "Red card" : "Yellow card"}
                  </span>
                  <span className="cf-head-min">{entry.minute}</span>
                </div>
                {booked ? (
                  <CommentaryPlayerRow
                    player={booked}
                    ringColor={ringFor(booked.teamName)}
                  />
                ) : null}
                <div className="cf-card-body">{body}</div>
              </div>
            );
          } else if (entry.action === "substitution") {
            const playerIn = findPlayer(entry.playerInId);
            const playerOut = findPlayer(entry.playerOutId);

            block = (
              <div className="cf-card">
                <div className="cf-card-head">
                  <span className="cf-icon-subs">
                    <LineupSubstitutionIcon direction="in" />
                    <LineupSubstitutionIcon direction="out" />
                  </span>
                  <span className="cf-head-title">Substitution</span>
                  <span className="cf-head-min">{entry.minute}</span>
                </div>
                {playerIn ? (
                  <>
                    <span className="cf-sub-tag cf-sub-in">In</span>
                    <CommentaryPlayerRow
                      player={playerIn}
                      ringColor={ringFor(playerIn.teamName)}
                    />
                  </>
                ) : null}
                {playerOut ? (
                  <>
                    <span className="cf-sub-tag cf-sub-out">Out</span>
                    <CommentaryPlayerRow
                      player={playerOut}
                      ringColor={ringFor(playerOut.teamName)}
                    />
                  </>
                ) : null}
                <div className="cf-card-body">{body}</div>
              </div>
            );
          } else {
            block = (
              <div className="cf-card">
                <div className="cf-card-head">
                  <HeadsetIcon />
                  <span className="cf-head-title">Commentary</span>
                  <span className="cf-head-min">{entry.minute}</span>
                </div>
                <div className="cf-card-body">{body}</div>
              </div>
            );
          }

          return (
            <motion.li
              animate={{ opacity: 1, y: 0 }}
              className="cf-item"
              initial={{ opacity: 0, y: -14 }}
              key={entry.id}
              transition={{ duration: 0.35 }}
            >
              {block}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

function UpdatesSection({
  fixture,
  lineups,
  players,
  updates,
}: {
  fixture: WorldCupFixture;
  lineups: NormalizedLineups | null;
  players?: PlayerDirectory;
  updates: ApiResult<TxlineUpdateData[]> | null;
}) {
  const displayUpdates = getDisplayUpdates(updates?.data, fixture, players);

  return (
    <section className="card" aria-labelledby="updates-heading">
      <h2 id="updates-heading">Commentary</h2>
      {displayUpdates.length ? (
        <div className="feed-scroll">
          <CommentaryFeed
            entries={displayUpdates}
            fixture={fixture}
            lineups={lineups}
          />
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
            Fixture #{fixture.fixtureId} · Kickoff {formatDate(fixture.kickoffUtc)}
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
