"use client";

import { useEffect, useMemo, useState } from "react";

import { demoEvents, form, leagues, players } from "@/lib/demo-data";
import {
  applyPredictionUpdate,
  buildLeaderboard,
  calculateScoreBreakdown,
  defaultPrediction,
  formatLiveRoundPick,
  formatTotalCardsPick,
  formatTotalCornersPick,
  formatTotalGoalsPick,
  formatWinnerPick,
} from "@/lib/prediction-engine";
import type {
  DemoEvent,
  MatchSnapshot,
  Prediction,
  ScoreBreakdown,
  WinnerPick,
} from "@/lib/types";
import {
  featuredFixture,
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";

type MainTab = "Predictions" | "Live rounds" | "Knockout";
type TxlineStatus = {
  apiOrigin?: string;
  configured: boolean;
  mode: "txline" | "demo" | "fallback";
  network: "mainnet" | "devnet";
};
type FeedCheck = {
  fixtureCount: number;
  fixtureSource: string;
  oddsSource: string;
  scoreSummary: string;
  scoreSource: string;
  scoreStatus: "checking" | "ready" | "fallback" | "error";
  updatesCount: number;
  updatesSource: string;
};
type TxlineScoreData = {
  action?: string;
  awayCorners: number;
  awayGoals: number;
  awayRedCards: number;
  awayYellowCards: number;
  gameState?: string;
  homeCorners: number;
  homeGoals: number;
  homeRedCards: number;
  homeYellowCards: number;
  seq?: number;
  ts?: number;
};
type TxlineUpdateData = TxlineScoreData & {
  id: string;
};
type TxlineOddsData = {
  awayWinProbability: number | null;
  drawProbability: number | null;
  homeWinProbability: number | null;
  marketNote: string;
  markets: Array<{
    marketParameters: string | null;
    priceNames: string[];
    probabilities: number[];
    type: string;
  }>;
};
type LiveFeed = {
  odds: TxlineOddsData | null;
  score: TxlineScoreData | null;
  updates: TxlineUpdateData[];
};

const filters = ["Live", "My picks", "Closing soon", "Bonus rounds"];
const matchTabs = ["Ongoing", "By time", "My league", "TxLINE events"];
const homeTeam = featuredFixture.homeTeam;
const awayTeam = featuredFixture.awayTeam;
const fixtureLabel = `${homeTeam} vs ${awayTeam}`;

function formatScoreSummary(scoreData: unknown): string {
  if (!scoreData || typeof scoreData !== "object") {
    return "No score snapshot yet";
  }

  const score = scoreData as {
    awayCorners?: number;
    awayGoals?: number;
    awayRedCards?: number;
    awayYellowCards?: number;
    homeCorners?: number;
    homeGoals?: number;
    homeRedCards?: number;
    homeYellowCards?: number;
  };

  return `${score.homeGoals ?? 0}-${score.awayGoals ?? 0} goals, ${
    (score.homeCorners ?? 0) + (score.awayCorners ?? 0)
  } corners, ${
    (score.homeYellowCards ?? 0) + (score.awayYellowCards ?? 0)
  } yellow, ${(score.homeRedCards ?? 0) + (score.awayRedCards ?? 0)} red`;
}

function buildTxlineSnapshot(
  score: TxlineScoreData | null,
  odds: TxlineOddsData | null,
): MatchSnapshot {
  const gameState = score?.gameState ?? "scheduled";
  const status = getSnapshotStatus(gameState);

  return {
    awayScore: score?.awayGoals ?? 0,
    awayWinProbability: roundProbability(odds?.awayWinProbability, 29),
    drawProbability: roundProbability(odds?.drawProbability, 29),
    homeScore: score?.homeGoals ?? 0,
    homeWinProbability: roundProbability(odds?.homeWinProbability, 42),
    marketNote:
      odds?.marketNote ??
      `TxLINE score state: ${formatGameState(gameState)}. Odds snapshot pending.`,
    minute: 0,
    status,
    statusLabel: status === "pre" ? "NS" : status === "finished" ? "FT" : "LIVE",
    totalCards:
      (score?.homeYellowCards ?? 0) +
      (score?.awayYellowCards ?? 0) +
      (score?.homeRedCards ?? 0) +
      (score?.awayRedCards ?? 0),
    totalCorners: (score?.homeCorners ?? 0) + (score?.awayCorners ?? 0),
  };
}

function buildTxlineEvents(
  updates: TxlineUpdateData[],
  snapshot: MatchSnapshot,
): DemoEvent[] {
  if (updates.length === 0) {
    return [
      {
        description:
          "TxLINE score snapshot is loaded. No score update events are available yet for this fixture.",
        id: "txline-snapshot",
        minute: snapshot.minute,
        scoringHint: "Leaderboard is settled from the current TxLINE score stats.",
        snapshot,
        title: "TxLINE snapshot ready",
        type: snapshot.status === "finished" ? "full-time" : "round",
      },
    ];
  }

  return updates.slice(-8).map((update) => {
    const updateSnapshot = buildTxlineSnapshot(update, null);
    const action = update.action ?? "score update";
    const title = `${formatGameState(update.gameState)} ${formatAction(action)}`;

    return {
      description: `TxLINE ${action} event received with sequence ${
        update.seq ?? update.id
      }. Current stats: ${formatScoreSummary(update)}.`,
      id: `txline-${update.id}`,
      minute: 0,
      scoringHint: "Predictions and leaderboard recalculate from TxLINE score stats.",
      snapshot: {
        ...snapshot,
        awayScore: update.awayGoals,
        homeScore: update.homeGoals,
        status: updateSnapshot.status,
        statusLabel: updateSnapshot.statusLabel,
        totalCards: updateSnapshot.totalCards,
        totalCorners: updateSnapshot.totalCorners,
      },
      title,
      type: getEventType(action, updateSnapshot.status),
    };
  });
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatGameState(gameState?: string): string {
  const labels: Record<string, string> = {
    ended: "FT",
    finished: "FT",
    first_half: "H1",
    halftime: "HT",
    scheduled: "NS",
    second_half: "H2",
  };

  return labels[gameState ?? ""] ?? gameState?.toUpperCase() ?? "TXLINE";
}

function getEventType(
  action: string,
  status: MatchSnapshot["status"],
): DemoEvent["type"] {
  if (status === "finished") {
    return "full-time";
  }
  if (action.includes("goal")) {
    return "goal";
  }
  if (action.includes("card")) {
    return "card";
  }
  if (action.includes("corner")) {
    return "corner";
  }

  return "round";
}

function getSnapshotStatus(gameState: string): MatchSnapshot["status"] {
  if (["ended", "finished", "f", "fet", "fpe"].includes(gameState.toLowerCase())) {
    return "finished";
  }
  if (["scheduled", "not_started", "ns"].includes(gameState.toLowerCase())) {
    return "pre";
  }

  return "live";
}

function roundProbability(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

function mergeFixtures(
  seedFixtures: WorldCupFixture[],
  liveFixtures: WorldCupFixture[],
): WorldCupFixture[] {
  const fixturesById = new Map<number, WorldCupFixture>();

  for (const fixture of seedFixtures) {
    fixturesById.set(fixture.fixtureId, fixture);
  }

  for (const fixture of liveFixtures) {
    fixturesById.set(fixture.fixtureId, fixture);
  }

  return Array.from(fixturesById.values()).sort(
    (left, right) =>
      new Date(left.kickoffUtc).getTime() - new Date(right.kickoffUtc).getTime(),
  );
}

async function fetchFeedJson(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return { error: `Request failed: ${response.status}` };
    }

    return response.json();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Fetch failed" };
  }
}

export function FanForecastApp() {
  const [eventIndex, setEventIndex] = useState(1);
  const [prediction, setPrediction] = useState<Prediction>(defaultPrediction);
  const [activeTab, setActiveTab] = useState<MainTab>("Predictions");
  const [activeFilter, setActiveFilter] = useState("Live");
  const [isPlaying, setIsPlaying] = useState(false);
  const [txlineStatus, setTxlineStatus] = useState<TxlineStatus>({
    configured: false,
    mode: "demo",
    network: "devnet",
  });
  const [feedCheck, setFeedCheck] = useState<FeedCheck>({
    fixtureCount: txlineWorldCupFixtures.length,
    fixtureSource: "TxLINE docs schedule seed",
    oddsSource: "Waiting for odds snapshot",
    scoreSummary: "Waiting for snapshot",
    scoreSource: "Waiting for API check",
    scoreStatus: "checking",
    updatesCount: 0,
    updatesSource: "Waiting for score updates",
  });
  const [fixtures, setFixtures] = useState<WorldCupFixture[]>(
    txlineWorldCupFixtures,
  );
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [liveFeed, setLiveFeed] = useState<LiveFeed>({
    odds: null,
    score: null,
    updates: [],
  });

  useEffect(() => {
    const savedPrediction = window.localStorage.getItem("fan-forecast-prediction");

    if (savedPrediction) {
      queueMicrotask(() => {
        try {
          const parsed = JSON.parse(savedPrediction) as Partial<Prediction>;
          setPrediction({ ...defaultPrediction, ...parsed });
        } catch {
          window.localStorage.removeItem("fan-forecast-prediction");
        }
      });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "fan-forecast-prediction",
      JSON.stringify(prediction),
    );
  }, [prediction]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/txline/status")
      .then((response) => response.json())
      .then((status: TxlineStatus) => {
        if (!cancelled) {
          setTxlineStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTxlineStatus({ configured: false, mode: "fallback", network: "devnet" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTxlineFeed() {
      try {
        const [fixturesResult, scoreResult, updatesResult, oddsResult] =
          await Promise.all([
            fetchFeedJson("/api/txline/fixtures"),
            fetchFeedJson(`/api/txline/scores/${featuredFixture.fixtureId}`),
            fetchFeedJson(
              `/api/txline/scores/${featuredFixture.fixtureId}/updates`,
            ),
            fetchFeedJson(`/api/txline/odds/${featuredFixture.fixtureId}`),
          ]);

        if (cancelled) {
          return;
        }

        const liveFixtures = Array.isArray(fixturesResult.data)
          ? (fixturesResult.data as WorldCupFixture[])
          : [];
        const mergedFixtures =
          liveFixtures.length > 0
            ? mergeFixtures(txlineWorldCupFixtures, liveFixtures)
            : txlineWorldCupFixtures;

        setFixtures(mergedFixtures);

        setLiveFeed({
          odds: oddsResult.data ?? null,
          score: scoreResult.data ?? null,
          updates: Array.isArray(updatesResult.data) ? updatesResult.data : [],
        });

        setFeedCheck({
          fixtureCount: mergedFixtures.length,
          fixtureSource:
            liveFixtures.length > 0
              ? `${fixturesResult.source ?? "TxLINE fixtures snapshot API"} + docs seed`
              : fixturesResult.source ??
                fixturesResult.error ??
                fixturesResult.mode ??
                "TxLINE docs schedule seed",
          oddsSource:
            oddsResult.source ??
            oddsResult.error ??
            oddsResult.mode ??
            "Unknown",
          scoreSummary: formatScoreSummary(scoreResult.data),
          scoreSource:
            scoreResult.source ??
            scoreResult.error ??
            scoreResult.mode ??
            "Unknown",
          scoreStatus:
            scoreResult.mode === "txline"
              ? "ready"
              : scoreResult.mode === "fallback"
                ? "fallback"
                : scoreResult.error
                  ? "error"
                  : "fallback",
          updatesCount: Array.isArray(updatesResult.data)
            ? updatesResult.data.length
            : 0,
          updatesSource:
            updatesResult.source ??
            updatesResult.error ??
            updatesResult.mode ??
            "Unknown",
        });
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }

        setFeedCheck((current) => ({
          ...current,
          oddsSource: "Odds snapshot unavailable",
          scoreSummary: "Snapshot unavailable",
          scoreSource: error instanceof Error ? error.message : "API check failed",
          scoreStatus: "error",
          updatesSource: "Score updates unavailable",
        }));
      }
    }

    void loadTxlineFeed();
    const interval = window.setInterval(loadTxlineFeed, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const txlineSnapshot = useMemo(
    () => buildTxlineSnapshot(liveFeed.score, liveFeed.odds),
    [liveFeed.odds, liveFeed.score],
  );
  const txlineEvents = useMemo(
    () => buildTxlineEvents(liveFeed.updates, txlineSnapshot),
    [liveFeed.updates, txlineSnapshot],
  );
  const usingTxlineLive = feedCheck.scoreStatus === "ready" && !isDemoMode;
  const eventHistory = usingTxlineLive
    ? txlineEvents
    : demoEvents.slice(0, eventIndex + 1);
  const activeEvent = eventHistory.at(-1) ?? demoEvents[eventIndex];
  const snapshot = activeEvent.snapshot;
  const scoreBreakdown = useMemo(
    () => calculateScoreBreakdown(prediction, snapshot, eventHistory),
    [eventHistory, prediction, snapshot],
  );
  const leaderboard = useMemo(
    () => buildLeaderboard(players, scoreBreakdown),
    [scoreBreakdown],
  );

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setTimeout(() => {
      setEventIndex((current) => {
        if (current >= demoEvents.length - 1) {
          setIsPlaying(false);
          return current;
        }

        return current + 1;
      });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [eventIndex, isPlaying]);

  function updateScorePick(key: "homeScore" | "awayScore", value: string) {
    setPrediction((current) =>
      applyPredictionUpdate(current, key, Number.parseInt(value || "0", 10)),
    );
  }

  function resetDemo() {
    setIsPlaying(false);
    setEventIndex(0);
    setIsDemoMode(false);
    setPrediction(defaultPrediction);
  }

  function playDemoReplay() {
    setIsDemoMode(true);
    setIsPlaying((current) => !current);
  }

  function showNextDemoEvent() {
    setIsDemoMode(true);
    setEventIndex((current) => Math.min(current + 1, demoEvents.length - 1));
  }

  return (
    <main className="min-h-screen bg-black text-[#f5f5f0]">
      <TopNav />

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)_300px] lg:px-8">
        <LeagueRail activeFilter={activeFilter} onFilterChange={setActiveFilter} />

        <section className="space-y-4">
          <MatchControls />
          <MatchList
            activeEventTitle={activeEvent.title}
            activeTab={activeFilter}
            fixtures={fixtures}
            snapshot={snapshot}
          />

          <section
            id="predictions"
            className="overflow-hidden rounded-xl bg-[#1d1d1d] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          >
            <MatchHeader
              activeEventTitle={activeEvent.title}
              isPlaying={isPlaying}
              isTxlineLive={usingTxlineLive}
              onNextEvent={showNextDemoEvent}
              onPlay={playDemoReplay}
              onReset={resetDemo}
              snapshot={snapshot}
            />

            <div className="border-b border-white/10 px-4">
              <div className="flex gap-6 overflow-x-auto text-sm font-black">
                {(["Predictions", "Live rounds", "Knockout"] as MainTab[]).map(
                  (tab) => (
                    <button
                      className={`border-b-2 pb-3 pt-4 ${
                        activeTab === tab
                          ? "border-[#35d07f] text-white"
                          : "border-transparent text-[#8a8a8a]"
                      }`}
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}
                    </button>
                  ),
                )}
              </div>
            </div>

            {activeTab === "Predictions" ? (
              <PredictionPanel
                prediction={prediction}
                scoreBreakdown={scoreBreakdown}
                setPrediction={setPrediction}
                updateScorePick={updateScorePick}
              />
            ) : activeTab === "Live rounds" ? (
              <LiveRoundsPanel
                activeEventTitle={activeEvent.title}
                odds={liveFeed.odds}
                score={liveFeed.score}
                usingTxlineLive={usingTxlineLive}
              />
            ) : (
              <KnockoutPanel />
            )}
          </section>

          <TeamForm />
        </section>

        <RightRail
          activeEvent={activeEvent}
          eventHistory={eventHistory}
          feedCheck={feedCheck}
          leaderboard={leaderboard}
          scoreBreakdown={scoreBreakdown}
          txlineStatus={txlineStatus}
        />
      </div>
    </main>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#111111]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <h1 className="text-xl font-black tracking-tight">Fan Forecast</h1>
        <label className="hidden min-w-0 flex-1 md:block">
          <span className="sr-only">Search matches</span>
          <input
            className="h-10 w-full max-w-sm rounded-full border border-white/10 bg-[#242424] px-4 text-sm text-white outline-none placeholder:text-[#8a8a8a] focus:border-[#35d07f]"
            placeholder="Search matches, leagues, friends"
          />
        </label>
        <nav className="ml-auto hidden items-center gap-6 text-sm font-bold text-[#d7d7d1] sm:flex">
          <a href="#matches">Matches</a>
          <a href="#predictions">Predictions</a>
          <a href="#league">League</a>
        </nav>
        <button className="rounded-full bg-[#35d07f] px-4 py-2 text-sm font-black text-black">
          Create League
        </button>
      </div>
    </header>
  );
}

function LeagueRail({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}) {
  return (
    <aside className="hidden space-y-4 lg:block">
      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <h2 className="text-sm font-black">Top leagues</h2>
        <div className="mt-3 space-y-1">
          {leagues.map((league) => (
            <button
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#d7d7d1] hover:bg-white/5"
              key={league}
            >
              <span className="h-2 w-2 rounded-full bg-[#35d07f]" />
              {league}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <h2 className="text-sm font-black">Quick filters</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              className={`rounded-full px-3 py-2 text-xs font-bold ${
                activeFilter === filter
                  ? "bg-[#35d07f] text-black"
                  : "bg-[#2a2a2a] text-[#d7d7d1]"
              }`}
              key={filter}
              onClick={() => onFilterChange(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function MatchControls() {
  return (
    <section
      aria-label="Match controls"
      className="rounded-xl bg-[#1d1d1d] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
    >
      <div className="flex items-center justify-between gap-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a2a2a] text-lg font-black">
          <span aria-hidden="true">‹</span>
          <span className="sr-only">Previous day</span>
        </button>
        <button className="rounded-full bg-[#2a2a2a] px-4 py-2 text-sm font-black">
          Today
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a2a2a] text-lg font-black">
          <span aria-hidden="true">›</span>
          <span className="sr-only">Next day</span>
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {matchTabs.map((item, index) => (
          <button
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              index === 0
                ? "bg-[#35d07f] text-black"
                : "bg-[#2a2a2a] text-[#d7d7d1]"
            }`}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function MatchList({
  activeEventTitle,
  activeTab,
  fixtures,
  snapshot,
}: {
  activeEventTitle: string;
  activeTab: string;
  fixtures: WorldCupFixture[];
  snapshot: { homeScore: number; awayScore: number; statusLabel: string };
}) {
  const matches = fixtures.map((fixture) => {
    const isFeatured = fixture.fixtureId === featuredFixture.fixtureId;

    return {
      away: fixture.awayTeam,
      home: fixture.homeTeam,
      id: String(fixture.fixtureId),
      score: isFeatured
        ? `${snapshot.homeScore} - ${snapshot.awayScore}`
        : fixture.stage,
      signal: isFeatured
        ? activeEventTitle
        : `${fixture.fixtureGroup} • TxLINE fixture ${fixture.fixtureId}`,
      status: isFeatured ? snapshot.statusLabel : getFixtureStatus(fixture),
    };
  });

  return (
    <section
      id="matches"
      className="overflow-hidden rounded-xl bg-[#1d1d1d] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-black">TxLINE Fixtures</h2>
          <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
            Showing: {activeTab} • past and upcoming
          </p>
        </div>
        <span className="rounded-full bg-[#2a2a2a] px-3 py-1 text-xs font-bold text-[#9a9a94]">
          {matches.length} matches
        </span>
      </div>
      <div className="divide-y divide-white/8">
        {matches.map((match) => (
          <article
            className="grid grid-cols-[48px_1fr_auto_1fr] items-center gap-3 px-4 py-4 text-sm"
            key={match.id}
          >
            <span
              className={`rounded-full px-2 py-1 text-center text-xs font-black ${
                match.id === String(featuredFixture.fixtureId)
                  ? "bg-[#35d07f] text-black"
                  : "bg-[#2a2a2a] text-[#d7d7d1]"
              }`}
            >
              {match.status}
            </span>
            <div className="truncate text-right font-bold">{match.home}</div>
            <div className="rounded-lg bg-[#252525] px-4 py-2 text-center text-base font-black">
              {match.score}
            </div>
            <div>
              <p className="truncate font-bold">{match.away}</p>
              <p className="mt-1 truncate text-xs font-semibold text-[#8a8a8a]">
                {match.signal}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function getFixtureStatus(fixture: WorldCupFixture): string {
  const kickoffTime = new Date(fixture.kickoffUtc).getTime();

  if (Number.isFinite(kickoffTime) && kickoffTime < Date.now()) {
    return "Past";
  }

  return formatKickoff(fixture.kickoffUtc);
}

function MatchHeader({
  activeEventTitle,
  isPlaying,
  isTxlineLive,
  onNextEvent,
  onPlay,
  onReset,
  snapshot,
}: {
  activeEventTitle: string;
  isPlaying: boolean;
  isTxlineLive: boolean;
  onNextEvent: () => void;
  onPlay: () => void;
  onReset: () => void;
  snapshot: {
    awayScore: number;
    awayWinProbability: number;
    drawProbability: number;
    homeScore: number;
    homeWinProbability: number;
    marketNote: string;
    status: string;
  };
}) {
  return (
    <div className="border-b border-white/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
            Featured Match
          </p>
          <h2 className="mt-1 text-2xl font-black">{fixtureLabel}</h2>
          <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
            TxLINE fixture {featuredFixture.fixtureId} •{" "}
            {formatKickoff(featuredFixture.kickoffUtc)} UTC
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#2a2a2a] px-4 py-2 text-sm font-black text-[#d7d7d1]">
            {isTxlineLive ? "TxLINE Live" : "Replay Mode"}
          </span>
          <button
            className="rounded-full bg-[#35d07f] px-4 py-2 text-sm font-black text-black"
            onClick={onPlay}
          >
            {isPlaying ? "Pause Replay" : "Run Demo Replay"}
          </button>
          <button
            className="rounded-full bg-[#2a2a2a] px-4 py-2 text-sm font-black text-white"
            onClick={onNextEvent}
          >
            Next event
          </button>
          <button
            className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
            onClick={onReset}
          >
            Back to TxLINE
          </button>
        </div>
      </div>

      <div className="mt-4 grid items-center gap-4 rounded-xl bg-[#242424] px-4 py-6 sm:grid-cols-[1fr_auto_1fr]">
        <div className="text-center sm:text-right">
          <p className="text-xl font-black">{homeTeam}</p>
          <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
            Win chance {snapshot.homeWinProbability}%
          </p>
        </div>
        <div className="text-center">
          <span className="rounded-md bg-[#35d07f] px-2 py-1 text-xs font-black text-black">
            {snapshot.status === "finished"
              ? "SETTLED"
              : snapshot.status === "pre"
                ? "SCHEDULED"
                : "LIVE"}
          </span>
          <p className="mt-2 text-4xl font-black">
            {snapshot.homeScore} - {snapshot.awayScore}
          </p>
          <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
            {activeEventTitle}
          </p>
        </div>
        <div className="text-center sm:text-left">
          <p className="text-xl font-black">{awayTeam}</p>
          <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
            Win chance {snapshot.awayWinProbability}%
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs font-bold text-[#d7d7d1] sm:grid-cols-3">
        <p>Market note: {snapshot.marketNote}</p>
        <p>Draw chance: {snapshot.drawProbability}%</p>
        <p>Predictions lock at kickoff, then settle from TxLINE events.</p>
      </div>
    </div>
  );
}

function PredictionPanel({
  prediction,
  scoreBreakdown,
  setPrediction,
  updateScorePick,
}: {
  prediction: Prediction;
  scoreBreakdown: ScoreBreakdown;
  setPrediction: React.Dispatch<React.SetStateAction<Prediction>>;
  updateScorePick: (key: "homeScore" | "awayScore", value: string) => void;
}) {
  const markets = [
    {
      label: "Exact score",
      value: `${prediction.homeScore}-${prediction.awayScore}`,
      points: `${scoreBreakdown.exactScore}/8 pts`,
      confidence: "Final score",
    },
    {
      label: "Winner",
      value: formatWinnerPick(prediction.winner),
      points: `${scoreBreakdown.winner}/3 pts`,
      confidence: "1X2 market",
    },
    {
      label: "Total goals",
      value: formatTotalGoalsPick(prediction.totalGoals),
      points: `${scoreBreakdown.totalGoals}/2 pts`,
      confidence: "Goal line",
    },
    {
      label: "Next live round",
      value: formatLiveRoundPick(prediction.nextGoal),
      points: `${scoreBreakdown.nextGoal}/4 pts`,
      confidence: "First goal",
    },
    {
      label: "Corners",
      value: formatTotalCornersPick(prediction.totalCorners),
      points: `${scoreBreakdown.totalCorners}/2 pts`,
      confidence: "TxLINE corner stats",
    },
    {
      label: "Cards",
      value: formatTotalCardsPick(prediction.totalCards),
      points: `${scoreBreakdown.totalCards}/2 pts`,
      confidence: "TxLINE card stats",
    },
  ];

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      <div className="rounded-xl bg-[#242424] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#d7d7d1]">
              Your Score Pick
            </p>
            <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
              {prediction.locked
                ? "Locked at kickoff for the current match"
                : "Editing mode before kickoff"}
            </p>
          </div>
          <span className="rounded-full bg-[#35d07f] px-3 py-1 text-xs font-black text-black">
            {scoreBreakdown.total} pts
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <label className="space-y-2">
            <span className="block text-xs font-bold text-[#8a8a8a]">
              {homeTeam}
            </span>
            <input
              aria-label={`${homeTeam} score`}
              className="w-full rounded-lg border border-white/10 bg-[#111111] px-3 py-3 text-center text-2xl font-black outline-none focus:border-[#35d07f] disabled:opacity-60"
              disabled={prediction.locked}
              inputMode="numeric"
              onChange={(event) => updateScorePick("homeScore", event.target.value)}
              value={prediction.homeScore}
            />
          </label>
          <span className="pt-6 text-xl font-black text-[#8a8a8a]">-</span>
          <label className="space-y-2">
            <span className="block text-xs font-bold text-[#8a8a8a]">
              {awayTeam}
            </span>
            <input
              aria-label={`${awayTeam} score`}
              className="w-full rounded-lg border border-white/10 bg-[#111111] px-3 py-3 text-center text-2xl font-black outline-none focus:border-[#35d07f] disabled:opacity-60"
              disabled={prediction.locked}
              inputMode="numeric"
              onChange={(event) => updateScorePick("awayScore", event.target.value)}
              value={prediction.awayScore}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            className="w-full rounded-lg bg-[#35d07f] px-4 py-3 text-sm font-black text-black disabled:bg-[#2f6548] disabled:text-[#b9d8c5]"
            disabled={prediction.locked}
            onClick={() =>
              setPrediction((current) => ({ ...current, locked: true }))
            }
          >
            Save Prediction
          </button>
          <button
            className="w-full rounded-lg bg-[#2a2a2a] px-4 py-3 text-sm font-black text-white"
            onClick={() =>
              setPrediction((current) => ({
                ...current,
                locked: !current.locked,
              }))
            }
          >
            {prediction.locked ? "Edit pick" : "Cancel edit"}
          </button>
        </div>
      </div>

      <PickButtons prediction={prediction} setPrediction={setPrediction} />

      {markets.map((market) => (
        <div className="rounded-xl bg-[#242424] p-4 text-left" key={market.label}>
          <span className="text-sm font-bold text-[#8a8a8a]">
            {market.label}
          </span>
          <span className="mt-2 block text-xl font-black">{market.value}</span>
          <span className="mt-4 flex items-center justify-between text-xs font-black">
            <span className="rounded-full bg-[#35d07f] px-3 py-1 text-black">
              {market.points}
            </span>
            <span className="text-[#8a8a8a]">{market.confidence}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function PickButtons({
  prediction,
  setPrediction,
}: {
  prediction: Prediction;
  setPrediction: React.Dispatch<React.SetStateAction<Prediction>>;
}) {
  const winnerOptions: WinnerPick[] = ["home", "draw", "away"];

  return (
    <div className="rounded-xl bg-[#242424] p-4">
      <p className="text-sm font-black text-[#d7d7d1]">Quick Picks</p>
      <p className="mt-1 text-xs font-bold text-[#8a8a8a]">
        Simple, judge-friendly controls inspired by live-score prediction cards.
      </p>

      <div className="mt-4 space-y-4">
        <SegmentedControl
          label="Who will win?"
          options={winnerOptions.map((value) => ({
            label: formatWinnerPick(value),
            value,
          }))}
          selected={prediction.winner}
          disabled={prediction.locked}
          onSelect={(winner) =>
            setPrediction((current) => ({ ...current, winner }))
          }
        />
        <SegmentedControl
          label="Total goals"
          options={[
            { label: "Over 2.5", value: "over" },
            { label: "Under 2.5", value: "under" },
          ]}
          selected={prediction.totalGoals}
          disabled={prediction.locked}
          onSelect={(totalGoals) =>
            setPrediction((current) => ({ ...current, totalGoals }))
          }
        />
        <SegmentedControl
          label="First live goal"
          options={[
            { label: homeTeam, value: "home" },
            { label: "No goal", value: "none" },
            { label: awayTeam, value: "away" },
          ]}
          selected={prediction.nextGoal}
          disabled={prediction.locked}
          onSelect={(nextGoal) =>
            setPrediction((current) => ({ ...current, nextGoal }))
          }
        />
        <SegmentedControl
          label="Total corners"
          options={[
            { label: "Over 8.5", value: "over" },
            { label: "Under 8.5", value: "under" },
          ]}
          selected={prediction.totalCorners}
          disabled={prediction.locked}
          onSelect={(totalCorners) =>
            setPrediction((current) => ({ ...current, totalCorners }))
          }
        />
        <SegmentedControl
          label="Total cards"
          options={[
            { label: "Over 3.5", value: "over" },
            { label: "Under 3.5", value: "under" },
          ]}
          selected={prediction.totalCards}
          disabled={prediction.locked}
          onSelect={(totalCards) =>
            setPrediction((current) => ({ ...current, totalCards }))
          }
        />
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  disabled,
  label,
  onSelect,
  options,
  selected,
}: {
  disabled: boolean;
  label: string;
  onSelect: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  selected: T;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
        {label}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            className={`rounded-full px-3 py-2 text-xs font-black ${
              selected === option.value
                ? "bg-[#35d07f] text-black"
                : "bg-[#111111] text-[#d7d7d1]"
            } disabled:opacity-60`}
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LiveRoundsPanel({
  activeEventTitle,
  odds,
  score,
  usingTxlineLive,
}: {
  activeEventTitle: string;
  odds: TxlineOddsData | null;
  score: TxlineScoreData | null;
  usingTxlineLive: boolean;
}) {
  const totalCards =
    (score?.homeYellowCards ?? 0) +
    (score?.awayYellowCards ?? 0) +
    (score?.homeRedCards ?? 0) +
    (score?.awayRedCards ?? 0);
  const totalCorners = (score?.homeCorners ?? 0) + (score?.awayCorners ?? 0);
  const roundCards = [
    ["Next goal", `${score?.homeGoals ?? 0}-${score?.awayGoals ?? 0}`, "TxLINE score watch"],
    ["Next card", `${totalCards} cards so far`, "TxLINE card stats"],
    ["Corners", `${totalCorners} corners so far`, "TxLINE corner stats"],
  ];

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-3">
      {roundCards.map(([label, value, meta]) => (
        <button className="rounded-xl bg-[#242424] p-4 text-left" key={label}>
          <span className="text-sm font-bold text-[#8a8a8a]">{label}</span>
          <span className="mt-2 block text-xl font-black">{value}</span>
          <span className="mt-4 block text-xs font-black text-[#35d07f]">
            {meta}
          </span>
        </button>
      ))}
      <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm font-semibold leading-6 text-[#d7d7d1] sm:col-span-3">
        Current trigger: {activeEventTitle}. Source:{" "}
        {usingTxlineLive ? "TxLINE scores and odds snapshots" : "demo replay"}.{" "}
        {odds?.marketNote ?? "Odds snapshot pending."}
      </p>
    </div>
  );
}

function formatKickoff(kickoffUtc: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    month: "short",
    timeZone: "UTC",
  }).format(new Date(kickoffUtc));
}

function KnockoutPanel() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {["Quarter-final", "Semi-final", "Final path", "Champion pick"].map(
        (label, index) => (
          <div className="rounded-xl bg-[#242424] p-4" key={label}>
            <p className="text-sm font-bold text-[#8a8a8a]">{label}</p>
            <p className="mt-2 text-xl font-black">
              {index < 2 ? `${awayTeam} advances` : "Pending bracket"}
            </p>
          </div>
        ),
      )}
    </div>
  );
}

function TeamForm() {
  return (
    <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
      <h2 className="text-sm font-black">Team form</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {form.map((team) => (
          <div key={team.team}>
            <p className="text-sm font-bold text-[#d7d7d1]">{team.team}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {team.scores.map((score, index) => (
                <span
                  className={`rounded px-3 py-2 text-xs font-black ${
                    index < 3
                      ? "bg-[#087f4a] text-white"
                      : "bg-[#737373] text-white"
                  }`}
                  key={`${team.team}-${score}-${index}`}
                >
                  {score}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RightRail({
  activeEvent,
  eventHistory,
  feedCheck,
  leaderboard,
  scoreBreakdown,
  txlineStatus,
}: {
  activeEvent: (typeof demoEvents)[number];
  eventHistory: typeof demoEvents;
  feedCheck: FeedCheck;
  leaderboard: Array<{
    baseScore: number;
    livePoints: number;
    name: string;
    score: number;
    trend: string;
  }>;
  scoreBreakdown: ScoreBreakdown;
  txlineStatus: TxlineStatus;
}) {
  return (
    <aside id="league" className="space-y-4">
      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
          Private League
        </p>
        <h2 className="mt-1 text-xl font-black">Weekend Crew</h2>
        <div className="mt-4 rounded-xl bg-[#242424] p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
            Invite Code
          </p>
          <p className="mt-1 text-2xl font-black tracking-[0.18em]">WC-742</p>
        </div>
      </section>

      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Live Leaderboard</h2>
          <span className="rounded-full bg-[#35d07f] px-3 py-1 text-xs font-black text-black">
            Auto-settled
          </span>
        </div>
        <div className="mt-4 divide-y divide-white/8">
          {leaderboard.map((player, index) => (
            <div
              className="grid grid-cols-[32px_1fr_auto] items-center gap-3 py-3"
              key={player.name}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#242424] text-sm font-black text-[#35d07f]">
                {index + 1}
              </span>
              <div>
                <p className="font-black">{player.name}</p>
                <p className="text-xs font-bold text-[#8a8a8a]">
                  {player.trend}
                </p>
              </div>
              <span className="text-lg font-black">{player.score}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <h2 className="text-lg font-black">Live Match Moments</h2>
        <div className="mt-4 rounded-xl border border-[#35d07f]/30 bg-[#123322] p-4">
          <p className="text-sm font-black text-[#35d07f]">{activeEvent.title}</p>
          <p className="mt-2 text-sm font-semibold leading-5 text-[#d7d7d1]">
            {activeEvent.description}
          </p>
          <p className="mt-3 text-xs font-black text-[#35d07f]">
            {activeEvent.scoringHint}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {eventHistory
            .slice()
            .reverse()
            .map((event) => (
              <div
                className="rounded-lg bg-[#242424] px-4 py-3 text-xs font-semibold leading-5 text-[#d7d7d1]"
                key={event.id}
              >
                <span className="font-black text-white">{event.snapshot.statusLabel}</span>{" "}
                {event.title}
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#1d1d1d] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <h2 className="text-lg font-black">TxLINE Status</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Fixture feed</dt>
            <dd className="font-black text-[#35d07f]">
              {txlineStatus.configured ? "API configured" : "Docs seed"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Fixtures loaded</dt>
            <dd className="font-black">{feedCheck.fixtureCount}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Settlement mode</dt>
            <dd className="font-black">{txlineStatus.mode}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Score check</dt>
            <dd
              className={`font-black ${
                feedCheck.scoreStatus === "ready"
                  ? "text-[#35d07f]"
                  : feedCheck.scoreStatus === "checking"
                    ? "text-[#d7d7d1]"
                    : "text-[#f0c15d]"
              }`}
            >
              {feedCheck.scoreStatus}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Updates loaded</dt>
            <dd className="font-black">{feedCheck.updatesCount}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Network</dt>
            <dd className="font-black">{txlineStatus.network}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8a8a8a]">Projected points</dt>
            <dd className="font-black">{scoreBreakdown.total}</dd>
          </div>
        </dl>
        <div className="mt-4 rounded-lg bg-[#242424] p-3 text-xs font-semibold leading-5 text-[#d7d7d1]">
          <p>
            Fixture source:{" "}
            <span className="font-black text-white">{feedCheck.fixtureSource}</span>
          </p>
          <p className="mt-2">
            Score source:{" "}
            <span className="font-black text-white">{feedCheck.scoreSource}</span>
          </p>
          <p className="mt-2">
            Updates source:{" "}
            <span className="font-black text-white">{feedCheck.updatesSource}</span>
          </p>
          <p className="mt-2">
            Odds source:{" "}
            <span className="font-black text-white">{feedCheck.oddsSource}</span>
          </p>
          <p className="mt-2">
            Snapshot:{" "}
            <span className="font-black text-white">{feedCheck.scoreSummary}</span>
          </p>
          {txlineStatus.apiOrigin ? (
            <p className="mt-2">
              API origin:{" "}
              <span className="font-black text-white">{txlineStatus.apiOrigin}</span>
            </p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}
