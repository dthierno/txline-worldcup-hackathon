"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";

import { api } from "@/../convex/_generated/api";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  CalendarAddIcon,
  ChampionIcon,
  Download04Icon,
  FootballIcon,
  GoogleIcon,
  MicrosoftIcon,
  RankingIcon,
  StarIcon,
  TargetIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { GroupTables } from "@/components/group-tables";
import { Hero } from "@/components/hero";
import { LeagueActions } from "@/components/league-actions";
import { CALENDAR_MONTHS, MatchCalendar } from "@/components/match-calendar";
import { PointsBadge } from "@/components/points-badge";
import { Skiper107 } from "@/components/skiper107";
import { UserProfileDialog } from "@/components/user-profile";

// PointsBadge moved to its own module to avoid an import cycle with the profile
// popup; re-export it so existing importers (match page, tests) keep working.
export { PointsBadge };
import { pastWorldCupFixtures } from "@/lib/past-world-cup-fixtures";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  downloadIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEvent,
} from "@/lib/calendar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  buildOutcome,
  fetchJson,
  fillUnknownStats,
  formatDate,
  isPastFixture,
  isPotentiallyLive,
  mergeFixtures,
  useIsMounted,
  useNow,
  type ApiResult,
  type TxlineStatus,
  type TxlineUpdateData,
} from "@/lib/match-shared";
import {
  PREDICTION_LINES,
  settlePrediction,
  type MatchPrediction,
} from "@/lib/prediction-engine";
import {
  applyScoutCorrections,
  extractGoals,
  extractSettleableCalls,
  formatLiveMinute,
  type NormalizedLineups,
  type NormalizedTxlineScore,
} from "@/lib/txline-normalize";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isPredictionLocked,
  cacheFixtures,
  GAMESTATE_HYDRATED_EVENT,
  LEAGUES_CHANGED_EVENT,
  loadCachedFixtures,
  loadGoalCalls,
  loadPrediction,
  loadSelectedBoard,
  loadStoredResults,
  saveSelectedBoard,
  saveStoredResult,
  loadPredictions,
  loadSettlements,
  savePrediction,
  saveSettlement,
  settleGoalCallPoints,
  type StoredSettlement,
} from "@/lib/prediction-store";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";
import { botStandings, gradeBotCalls } from "@/lib/prediction-bots";
import { worldCupResults } from "@/lib/world-cup-results";

// Confirmed live score folded from the TxLINE updates feed.
type LiveScore = {
  awayGoals: number;
  clockSeconds?: number;
  homeGoals: number;
  statusId?: number;
};

// TxLINE StatusIds: 2/4 halves, 3 HT, 6-9 extra-time phases (all in play);
// 5 = full time, 10+ = over after ET / finalised.
const IN_PLAY_STATUS_IDS = new Set([2, 3, 4, 6, 7, 8, 9]);

function statusInPlay(statusId?: number) {
  return statusId !== undefined && IN_PLAY_STATUS_IDS.has(statusId);
}

function statusEnded(statusId?: number) {
  return statusId !== undefined && (statusId === 5 || statusId >= 10);
}

// Real final scores of already-played fixtures (home-away), recovered from
// TxLINE's windowed history endpoints; settlements and the live-score fold
// take precedence when present.
const KNOWN_FINALS: Record<number, [number, number]> = Object.fromEntries(
  worldCupResults.map((result) => [result.fixtureId, result.score]),
);

const HOME_TAB_KEY = "fan-forecast.home-tab.v1";
const HOME_TAB_EVENT = "fan-forecast:home-tab";
type HomeTab = "predictions" | "matches" | "groups" | "bracket";

function isHomeTab(value: string | null): value is HomeTab {
  return ["predictions", "matches", "groups", "bracket"].includes(value ?? "");
}

function readHomeTab(): HomeTab {
  try {
    const stored = window.localStorage.getItem(HOME_TAB_KEY);

    return isHomeTab(stored) ? stored : "predictions";
  } catch {
    return "predictions";
  }
}

function subscribeHomeTab(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === HOME_TAB_KEY) onChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(HOME_TAB_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HOME_TAB_EVENT, onChange);
  };
}

function saveHomeTab(value: HomeTab) {
  try {
    window.localStorage.setItem(HOME_TAB_KEY, value);
    window.dispatchEvent(new Event(HOME_TAB_EVENT));
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

// Solid trophy for day headers (the free icon set only ships outlines).
function TrophyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pred-day-ic"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6 2h12v6a6 6 0 0 1-4.5 5.81V16.5H16a2 2 0 0 1 2 2V21H6v-2.5a2 2 0 0 1 2-2h2.5v-2.69A6 6 0 0 1 6 8V2z" />
      <path d="M5 4v4c0 .72.13 1.4.36 2.04A4.5 4.5 0 0 1 1.5 5.5V4H5z" />
      <path d="M19 4v4c0 .72-.13 1.4-.36 2.04A4.5 4.5 0 0 0 22.5 5.5V4H19z" />
    </svg>
  );
}

export function HomePage() {
  const activeTab = useSyncExternalStore(
    subscribeHomeTab,
    readHomeTab,
    () => "predictions",
  );
  const [fixtures, setFixtures] = useState<WorldCupFixture[]>(
    txlineWorldCupFixtures,
  );
  const [fixtureSource, setFixtureSource] = useState("TxLINE docs schedule seed");
  const [fixtureValidation, setFixtureValidation] =
    useState<ApiResult<unknown> | null>(null);
  const [status, setStatus] = useState<TxlineStatus | null>(null);
  const mounted = useIsMounted();
  const [predictions, setPredictions] = useState<
    Record<string, MatchPrediction>
  >(() => loadPredictions());
  const [finals, setFinals] = useState<Record<string, StoredSettlement>>(() =>
    loadSettlements(),
  );
  const [calendarMonth, setCalendarMonth] = useState(6);

  // When the sign-in sync pulls the fan's gameplay onto this device, re-read
  // it so predictions and points show without a reload.
  useEffect(() => {
    const rehydrate = () => {
      setPredictions(loadPredictions());
      setFinals(loadSettlements());
    };

    window.addEventListener(GAMESTATE_HYDRATED_EVENT, rehydrate);

    return () => window.removeEventListener(GAMESTATE_HYDRATED_EVENT, rehydrate);
  }, []);
  // Seeded with the final scores this device already saw, so ended matches
  // render as finished immediately instead of flashing LIVE until the first
  // feed poll returns.
  const [scores, setScores] = useState<Record<number, LiveScore>>(() => {
    const stored: Record<number, LiveScore> = {};

    for (const [id, result] of Object.entries(loadStoredResults())) {
      stored[Number(id)] = result;
    }

    return stored;
  });
  // Highest event seq already folded per fixture, so each poll only pulls new
  // events (see the `since` cursor on the updates route).
  const lastSeqRef = useRef<Record<number, number>>({});
  // Latest folded scores, readable from the poll interval without re-arming it.
  const scoresRef = useRef<Record<number, LiveScore>>({});
  // Fixtures that have left the live polling window but are being recovered
  // from TXLine's historical feed for the bracket.
  const recoveringResultsRef = useRef<Set<number>>(new Set());
  const now = useNow();

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  // Live scores from TxLINE for any in-play fixture, polled while the match is
  // inside its live window. We read the *updates* feed (not the snapshot):
  // the snapshot's aggregate keeps disallowed goals, whereas folding the event
  // stream — skipping `action_discarded` records — yields the confirmed score.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      // Poll while inside the kickoff window OR while the feed still says
      // in play (delayed matches outlive the 4h heuristic).
      const liveFixtures = fixtures.filter(
        (fixture) =>
          isPotentiallyLive(fixture, Date.now()) ||
          statusInPlay(scoresRef.current[fixture.fixtureId]?.statusId),
      );

      liveFixtures.forEach((fixture) => {
        const id = fixture.fixtureId;
        const since = lastSeqRef.current[id] ?? 0;

        fetchJson<NormalizedTxlineScore[]>(
          `/api/txline/scores/${id}/updates?since=${since}`,
        ).then((result) => {
          const updates = result.data;

          if (cancelled || !Array.isArray(updates) || updates.length === 0) {
            return;
          }

          lastSeqRef.current[id] = updates.reduce(
            (max, update) => Math.max(max, update.seq ?? max),
            since,
          );

          setScores((prev) => {
            const base: LiveScore = prev[id] ?? { awayGoals: 0, homeGoals: 0 };
            // Each record carries the running total, so the latest non-discard
            // record wins; a disallowed goal (`action_discarded`) is skipped.
            const folded = updates.reduce<LiveScore>(
              (acc, update) => ({
                awayGoals:
                  update.action === "action_discarded"
                    ? acc.awayGoals
                    : update.awayGoals,
                clockSeconds: update.clockSeconds ?? acc.clockSeconds,
                homeGoals:
                  update.action === "action_discarded"
                    ? acc.homeGoals
                    : update.homeGoals,
                statusId: update.statusId ?? acc.statusId,
              }),
              base,
            );

            // Remember ended results so the next page load renders the card
            // as finished immediately (idempotent localStorage write).
            if (statusEnded(folded.statusId)) {
              saveStoredResult(id, folded);
            }

            return { ...prev, [id]: folded };
          });
        });
      });
    };

    load();
    const timer = setInterval(load, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fixtures]);

  // A visitor may first open the app after a knockout match has disappeared
  // from the fixtures snapshot and its live polling window. Recover those
  // final scores from TXLine history so the bracket still advances without
  // requiring that this device was open during the match.
  useEffect(() => {
    const candidates = fixtures
      .filter((fixture) => {
        const id = fixture.fixtureId;

        return (
          new Date(fixture.kickoffUtc).getTime() < Date.now() &&
          !isPotentiallyLive(fixture, Date.now()) &&
          KNOWN_FINALS[id] === undefined &&
          scores[id] === undefined &&
          !recoveringResultsRef.current.has(id)
        );
      })
      .slice(0, 4);

    for (const fixture of candidates) {
      const id = fixture.fixtureId;

      recoveringResultsRef.current.add(id);
      void fetchJson<TxlineUpdateData[]>(
        `/api/txline/scores/${id}/historical`,
      ).then((result) => {
        const updates = applyScoutCorrections(
          fillUnknownStats(result.data ?? []),
        );
        const final = updates
          .filter((update) => update.action === "game_finalised")
          .sort((left, right) => (right.seq ?? 0) - (left.seq ?? 0))[0];

        if (final) {
          const recovered: LiveScore = {
            awayGoals: final.awayGoals,
            clockSeconds: final.clockSeconds,
            homeGoals: final.homeGoals,
            statusId: final.statusId ?? 100,
          };

          saveStoredResult(id, recovered);
          setScores((previous) => ({ ...previous, [id]: recovered }));
        } else {
          // Allow the five-minute fixture refresh to try again if the match
          // had not yet finalised when this request ran.
          recoveringResultsRef.current.delete(id);
        }
      });
    }
  }, [fixtures, scores]);

  // Auto-settle finished predictions right here on the home page: fans should
  // not have to revisit each match page to collect their points. Uses the
  // same corrected feed + settlement engine as the match page.
  const settlingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const candidates = fixtures
      .filter((fixture) => {
        const id = fixture.fixtureId;

        return (
          predictions[String(id)] !== undefined &&
          finals[String(id)] === undefined &&
          KNOWN_FINALS[id] !== undefined &&
          !settlingRef.current.has(id)
        );
      })
      .slice(0, 4);

    for (const fixture of candidates) {
      const id = fixture.fixtureId;

      settlingRef.current.add(id);
      void (async () => {
        const [historical, lineups] = await Promise.all([
          fetchJson<TxlineUpdateData[]>(`/api/txline/scores/${id}/historical`),
          fetchJson<NormalizedLineups>(`/api/txline/scores/${id}/lineups`),
        ]);
        let raw = historical.data ?? [];

        if (!raw.length) {
          raw =
            (await fetchJson<TxlineUpdateData[]>(
              `/api/txline/scores/${id}/updates`,
            ).then((result) => result.data)) ?? [];
        }

        const updates = applyScoutCorrections(fillUnknownStats(raw));

        if (!updates.some((update) => update.action === "game_finalised")) {
          return;
        }

        const latest = [...updates].sort(
          (left, right) => (right.seq ?? 0) - (left.seq ?? 0),
        )[0];
        const firstGoal = extractGoals(updates)[0];
        const scorerName =
          firstGoal?.playerId !== undefined
            ? lineups.data?.teams
                .flatMap((team) => team.players)
                .find((player) => player.playerId === firstGoal.playerId)?.name
            : undefined;
        const outcome = buildOutcome(
          latest,
          true,
          firstGoal
            ? { playerId: firstGoal.playerId, scorerName }
            : null,
        );
        const prediction = predictions[String(id)];

        if (!outcome || !prediction) {
          return;
        }

        const settlement = settlePrediction(prediction, outcome, {
          awayTeam: fixture.awayTeam,
          homeTeam: fixture.homeTeam,
        });
        // Points earned on live calls during the match count too - grade the
        // stored answers against the same corrected feed. The bots answer those
        // same calls and are graded alongside, frozen onto the settlement.
        const calls = extractSettleableCalls(updates);
        const answers = loadGoalCalls(id);
        const callPoints = settleGoalCallPoints(calls, answers);
        const stored: StoredSettlement = {
          botCallPoints: gradeBotCalls(calls, answers),
          finalScore: `${outcome.homeGoals}-${outcome.awayGoals}`,
          fixtureId: id,
          settledAt: new Date().toISOString(),
          totalPoints: settlement.totalPoints + callPoints,
        };

        saveSettlement(stored);
        setFinals((previous) => ({ ...previous, [String(id)]: stored }));
      })();
    }
  }, [fixtures, predictions, finals]);

  useEffect(() => {
    let cancelled = false;

    async function loadFixtures() {
      const [statusResult, fixturesResult, fixtureValidationResult] =
        await Promise.all([
          fetchJson<TxlineStatus>("/api/txline/status"),
          fetchJson<WorldCupFixture[]>("/api/txline/fixtures"),
          fetchJson<unknown>("/api/txline/fixtures/validation"),
        ]);

      if (cancelled) {
        return;
      }

      if (statusResult.data) {
        setStatus(statusResult.data);
      }

      setFixtureValidation(fixtureValidationResult);

      const liveFixtures = Array.isArray(fixturesResult.data)
        ? fixturesResult.data
        : [];

      // Merge the on-device fixture cache under the seed (seed labels win),
      // then cache the result: TxLINE drops finished fixtures from its
      // snapshot within hours, and cached ones must not vanish. pastWorldCupFixtures
      // carries the group stage and early knockouts, which left the snapshot
      // long ago and would otherwise never appear here.
      const merged = mergeFixtures(
        [
          ...loadCachedFixtures(),
          ...pastWorldCupFixtures,
          ...txlineWorldCupFixtures,
        ],
        liveFixtures,
      );

      cacheFixtures(merged);
      setFixtures(merged);
      setFixtureSource(
        liveFixtures.length > 0
          ? `${fixturesResult.source ?? "TxLINE fixtures snapshot API"} + docs seed`
          : fixturesResult.source ??
              fixturesResult.error ??
              "TxLINE docs schedule seed",
      );
    }

    void loadFixtures();

    // New fixtures (e.g. the next knockout round) appear without a manual
    // refresh: re-check every 5 minutes and whenever the tab regains focus.
    const timer = setInterval(() => void loadFixtures(), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadFixtures();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const { pastGames, upcomingGames } = useMemo(() => {
    return {
      pastGames: fixtures.filter(isPastFixture),
      upcomingGames: fixtures.filter((fixture) => !isPastFixture(fixture)),
    };
  }, [fixtures]);

  return (
    <main>
      <Hero />

      <LeagueActions />

      {/* Hidden per request — kept for later.
      <h1>World Cup games</h1>
      <p>
        Past and upcoming World Cup fixtures. Click a game to view TxLINE details.
      </p>
      <p>
        Fixture source: {fixtureSource}
        {status ? ` (${status.mode}, ${status.network})` : ""}
      </p>
      <p>
        Fixture validation:{" "}
        {fixtureValidation?.source ?? fixtureValidation?.error ?? "Pending"}
      </p>

      <StoriesRail />
      */}

      <Tabs
        className="home-tabs"
        onValueChange={(value) => {
          if (isHomeTab(value)) saveHomeTab(value);
        }}
        value={activeTab}
      >
        <TabsList className="w-full">
          <TabsTrigger value="predictions">
            <HugeiconsIcon icon={TargetIcon} strokeWidth={2} />
            Predictions
          </TabsTrigger>
          <TabsTrigger value="matches">
            <HugeiconsIcon icon={FootballIcon} strokeWidth={2} />
            Matches
          </TabsTrigger>
          <TabsTrigger value="groups">
            <HugeiconsIcon icon={RankingIcon} strokeWidth={2} />
            Groups
          </TabsTrigger>
          <TabsTrigger value="bracket">
            <HugeiconsIcon icon={ChampionIcon} strokeWidth={2} />
            Bracket
          </TabsTrigger>
        </TabsList>
        <TabsContent value="matches">
          <div className="matches-viewbar">
            <h2 className="sr-only">Matches</h2>
            <div
              aria-label="Month"
              className="matches-segmented"
              role="tablist"
            >
              {CALENDAR_MONTHS.map((entry) => (
                <button
                  aria-selected={calendarMonth === entry.month}
                  className={calendarMonth === entry.month ? "is-active" : ""}
                  key={entry.month}
                  onClick={() => setCalendarMonth(entry.month)}
                  role="tab"
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          <MatchCalendar
            fixtures={[...pastGames, ...upcomingGames]}
            month={calendarMonth}
            now={now}
            scores={mounted ? scores : {}}
          />
        </TabsContent>
        <TabsContent value="predictions">
          <PredictionsFeed
            finals={mounted ? finals : {}}
            fixtures={[...pastGames, ...upcomingGames]}
            now={now}
            predictions={mounted ? predictions : {}}
            scores={mounted ? scores : {}}
          />
        </TabsContent>
        <TabsContent value="groups">
          <GroupTables />
        </TabsContent>
        <TabsContent value="bracket">
          <div className="flex w-full justify-center">
            <Skiper107
              fixtures={fixtures}
              now={now}
              scores={mounted ? scores : {}}
            />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}


type Story = {
  id: string;
  link: string;
  publishedAt: string | null;
  title: string;
};

function StoriesRail() {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchJson<Story[]>("/api/stories").then((result) => {
        if (!cancelled && Array.isArray(result.data) && result.data.length) {
          setStories(result.data);
        }
      });
    }

    load();

    // Matches the server-side cache TTL, so an open tab stays current.
    const timer = setInterval(load, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (stories.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="stories-heading">
      <h2 id="stories-heading">Stories</h2>
      <div className="stories-rail">
        {stories.map((story) => (
          <a
            className="story-card"
            href={story.link}
            key={story.id}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="story-source">FIFA</span>
            <span className="story-title">{story.title}</span>
          </a>
        ))}
      </div>
      <p className="muted">
        Headlines via Google News RSS; each card opens the original story.
      </p>
    </section>
  );
}

// Team name (substring, lower-cased) → ISO code for flagcdn images. Covers all
// 48 nations at the 2026 World Cup (same set as the group tables).
const titleIso: Array<[string, string]> = [
  ["france", "fr"], ["morocco", "ma"], ["spain", "es"], ["belgium", "be"],
  ["england", "gb-eng"], ["norway", "no"], ["argentina", "ar"],
  ["switzerland", "ch"], ["egypt", "eg"], ["colombia", "co"],
  ["mexico", "mx"], ["canada", "ca"], ["brazil", "br"], ["portugal", "pt"],
  ["paraguay", "py"], ["usa", "us"],
  ["south africa", "za"], ["korea", "kr"], ["czech", "cz"], ["bosnia", "ba"],
  ["qatar", "qa"], ["scotland", "gb-sct"], ["haiti", "ht"],
  ["australia", "au"], ["türkiye", "tr"], ["turkey", "tr"], ["germany", "de"],
  ["ivory", "ci"], ["ecuador", "ec"], ["cura", "cw"], ["netherlands", "nl"],
  ["japan", "jp"], ["sweden", "se"], ["tunisia", "tn"], ["iran", "ir"],
  ["zealand", "nz"], ["cape verde", "cv"], ["uruguay", "uy"], ["saudi", "sa"],
  ["senegal", "sn"], ["iraq", "iq"], ["austria", "at"], ["algeria", "dz"],
  ["jordan", "jo"], ["congo", "cd"], ["uzbekistan", "uz"], ["croatia", "hr"],
  ["ghana", "gh"], ["panama", "pa"],
];

function isoFromTitle(title: string): string | undefined {
  const lower = title.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

function teamFlag(team: string): string | undefined {
  const lower = team.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

// Each nation's recognised primary (kit/flag) colour, used for the per-team
// side glow on the prediction cards. One entry per 2026 World Cup team; any
// team not listed falls back to a neutral grey.
const teamGlow: Record<string, string> = {
  ar: "#38bdf8", at: "#dc2626", au: "#eab308", ba: "#2563eb",
  be: "#ef4444", br: "#facc15", ca: "#dc2626", cd: "#ef4444",
  ch: "#dc2626", ci: "#f97316", co: "#facc15", cv: "#2563eb",
  cw: "#2563eb", cz: "#dc2626", de: "#d4d4d8", dz: "#16a34a",
  ec: "#eab308", eg: "#dc2626", es: "#dc2626", fr: "#3b82f6",
  "gb-eng": "#e5e7eb", "gb-sct": "#1e40af", gh: "#dc2626", hr: "#dc2626",
  ht: "#2563eb", iq: "#16a34a", ir: "#16a34a", jo: "#dc2626",
  jp: "#2563eb", kr: "#ef4444", ma: "#dc2626", mx: "#16a34a",
  nl: "#f97316", no: "#ef4444", nz: "#d4d4d8", pa: "#dc2626",
  pt: "#dc2626", py: "#ef4444", qa: "#9f1239", sa: "#16a34a",
  se: "#eab308", sn: "#16a34a", tn: "#dc2626", tr: "#dc2626",
  us: "#3b82f6", uy: "#38bdf8", uz: "#2563eb", za: "#eab308",
};

function dayLabel(kickoffUtc: string, now: number | null): string {
  const kickoff = new Date(kickoffUtc);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const reference = now === null ? null : new Date(now);
  const label = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(kickoff);

  if (reference === null) {
    return label;
  }

  const diff =
    (Date.UTC(kickoff.getUTCFullYear(), kickoff.getUTCMonth(), kickoff.getUTCDate()) -
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())) /
    86_400_000;

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  return label;
}

function formatKickoffTime(kickoffUtc: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
  }).format(new Date(kickoffUtc));
}


// Round labels adapted from the fixture `stage` field to friendlier text.
const STAGE_LABEL: Record<string, string> = {
  "8th Finals": "Round of 16",
  "Quarter-finals": "Quarter-final",
  "Semi-finals": "Semi-final",
  "3rd Place": "Third place",
  Final: "Final",
};

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

// The live TxLINE feed tags these knockout fixtures with a generic
// "World Cup" stage, so we derive the real round from this app's bracket
// (see leftQuarterFinals / rightQuarterFinals / semiFinal1 above).
const FIXTURE_STAGE_OVERRIDE: Record<number, string> = {
  18213979: "Quarter-final", // Norway vs England
  18222446: "Quarter-final", // Argentina vs Switzerland
  18237038: "Semi-final", // France vs Spain
};

function fixtureStage(fixture: WorldCupFixture): string {
  return FIXTURE_STAGE_OVERRIDE[fixture.fixtureId] ?? stageLabel(fixture.stage);
}

type FormResult = "d" | "l" | "w";

// Real tournament form: the recovered results dataset (back to the group
// stage) plus any ended result this device saw live. Draws stay draws even
// when decided on penalties (standard form notation).
function buildTeamForm(
  fixtures: WorldCupFixture[],
  scores: Record<number, LiveScore>,
): Record<string, FormResult[]> {
  const games = new Map<
    number,
    { away: string; home: string; kickoffUtc: string; score: [number, number] }
  >();

  for (const result of worldCupResults) {
    games.set(result.fixtureId, result);
  }

  for (const [id, score] of Object.entries(scores)) {
    const fixture = fixtures.find(
      (candidate) => candidate.fixtureId === Number(id),
    );

    if (fixture && statusEnded(score.statusId) && !games.has(Number(id))) {
      games.set(Number(id), {
        away: fixture.awayTeam,
        home: fixture.homeTeam,
        kickoffUtc: fixture.kickoffUtc,
        score: [score.homeGoals, score.awayGoals],
      });
    }
  }

  const form: Record<string, FormResult[]> = {};
  const played = [...games.values()].sort(
    (left, right) =>
      new Date(left.kickoffUtc).getTime() -
      new Date(right.kickoffUtc).getTime(),
  );

  for (const game of played) {
    const [home, away] = game.score;

    (form[game.home] ??= []).push(home > away ? "w" : home < away ? "l" : "d");
    (form[game.away] ??= []).push(away > home ? "w" : away < home ? "l" : "d");
  }

  for (const team of Object.keys(form)) {
    form[team] = form[team].slice(-5);
  }

  return form;
}

function FormStrip({ results }: { results: FormResult[] }) {
  // Always five slots (oldest first); unknown history pads as muted dots.
  const slots: Array<FormResult | "u"> = [
    ...Array<"u">(Math.max(0, 5 - results.length)).fill("u"),
    ...results.slice(-5),
  ];

  return (
    <span className="pc-form" aria-hidden="true">
      {slots.map((result, index) => (
        <span className={`pc-dot pc-${result}`} key={index} />
      ))}
    </span>
  );
}

function TeamSide({
  form,
  href,
  iso,
  name,
}: {
  form?: FormResult[];
  href: string;
  iso?: string;
  name: string;
}) {
  return (
    <Link className="pc-team" href={href}>
      {iso ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="pc-flag" src={`https://flagcdn.com/w80/${iso}.png`} />
      ) : (
        <span className="pc-flag pc-flag-tbd" aria-hidden="true" />
      )}
      <span className="pc-name">{name}</span>
      <FormStrip results={form ?? []} />
    </Link>
  );
}

// Clamp free typing to a plausible goal count (0–19), digits only.
function cleanGoals(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 2);

  if (digits === "") {
    return "";
  }

  return String(Math.min(19, Number(digits)));
}

function StepPlusIcon() {
  return (
    <svg fill="currentColor" height="14" viewBox="0 0 16 16" width="14">
      <path d="M3 8.01082C3 7.40476 3.42208 6.98268 4.02814 6.98268H6.99351V4.01732C6.99351 3.41126 7.40476 3 7.98918 3C8.59524 3 9.01732 3.41126 9.01732 4.01732V6.98268H11.9935C12.5887 6.98268 13 7.40476 13 8.01082C13 8.59524 12.5887 9.00649 11.9935 9.00649H9.01732V11.9827C9.01732 12.5779 8.59524 13 7.98918 13C7.40476 13 6.99351 12.5779 6.99351 11.9827V9.00649H4.02814C3.42208 9.00649 3 8.59524 3 8.01082Z" />
    </svg>
  );
}

function StepMinusIcon() {
  return (
    <svg fill="currentColor" height="14" viewBox="0 0 16 16" width="14">
      <path d="M3.94633 9C3.30462 9 2.84473 8.62567 2.84473 8.00535C2.84473 7.38503 3.28323 7 3.94633 7H12.064C12.7271 7 13.1549 7.38503 13.1549 8.00535C13.1549 8.62567 12.7057 9 12.064 9H3.94633Z" />
    </svg>
  );
}

// Green tick shown between the two steppers once a full scoreline is set.
function CheckBadge() {
  return (
    <span className="pc-check" aria-hidden="true">
      <svg height="22" viewBox="0 0 24 24" width="22">
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id="pcCheckGrad"
            x1="0"
            x2="20"
            y1="24"
            y2="2"
          >
            <stop offset="0.39" stopColor="#5FFF94" />
            <stop offset="1" stopColor="#E9F420" />
          </linearGradient>
        </defs>
        <circle
          cx="12"
          cy="12"
          fill="none"
          r="11"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" fill="url(#pcCheckGrad)" r="9" />
        <path
          d="M8 12.3l2.5 2.5L16 9.2"
          fill="none"
          stroke="#0d0d13"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
      </svg>
    </span>
  );
}

function ScoreStepper({
  ariaLabel,
  onChange,
  onStep,
  value,
}: {
  ariaLabel: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStep: (delta: number) => void;
  value: string;
}) {
  return (
    <div className="pc-stepper">
      <button
        aria-label={`Increase ${ariaLabel}`}
        className="pc-step pc-step-up"
        onClick={() => onStep(1)}
        tabIndex={-1}
        type="button"
      >
        <StepPlusIcon />
      </button>
      <input
        aria-label={ariaLabel}
        className="pc-score-box"
        inputMode="numeric"
        onChange={onChange}
        placeholder="?"
        value={value}
      />
      <button
        aria-label={`Decrease ${ariaLabel}`}
        className="pc-step pc-step-down"
        disabled={value === "" || value === "0"}
        onClick={() => onStep(-1)}
        tabIndex={-1}
        type="button"
      >
        <StepMinusIcon />
      </button>
    </div>
  );
}

// Rounded-hexagon points badge: green only for points actually earned, grey
// for any zero - whether the fan skipped the pick (muted) or made it and
// scored nothing. Shared with the match page's live-calls rows so points read
// the same everywhere.
// PointsBadge now lives in @/components/points-badge (imported + re-exported
// above) to break the import cycle with the profile popup.

function PredictionCard({
  final,
  fixture,
  form,
  now,
  prediction,
  onPredictedChange,
  score,
}: {
  final?: StoredSettlement;
  fixture: WorldCupFixture;
  form?: Record<string, FormResult[]>;
  now: number | null;
  prediction?: MatchPrediction;
  onPredictedChange: (fixtureId: number, predicted: boolean) => void;
  score?: LiveScore;
}) {
  const [favourite, setFavourite] = useState(false);
  const [home, setHome] = useState(
    prediction ? String(prediction.homeGoals) : "",
  );
  const [away, setAway] = useState(
    prediction ? String(prediction.awayGoals) : "",
  );
  const [justSaved, setJustSaved] = useState(false);
  // Prefer TxLINE's match phase when present (halves, HT and extra-time
  // phases all count as in play); otherwise the kickoff-window heuristic.
  const inPlay =
    score?.statusId != null
      ? statusInPlay(score.statusId)
      : now !== null && isPotentiallyLive(fixture, now);
  const live = inPlay;
  const locked = now !== null && isPredictionLocked(fixture, now);
  // Match over: feed status, a stored settlement, or a past fixture that the
  // feed no longer reports as in play. A feed that says "in play" vetoes
  // everything - a settlement cannot exist for an unfinished match.
  const ended = statusInPlay(score?.statusId)
    ? false
    : statusEnded(score?.statusId) ||
      Boolean(final) ||
      (isPastFixture(fixture) && !inPlay);
  const ftScore: [number, number] | null = (() => {
    const fromSettlement = final?.finalScore?.match(/^(\d+)-(\d+)$/);

    if (fromSettlement) {
      return [Number(fromSettlement[1]), Number(fromSettlement[2])];
    }

    if (statusEnded(score?.statusId) && score) {
      return [score.homeGoals, score.awayGoals];
    }

    return KNOWN_FINALS[fixture.fixtureId] ?? null;
  })();
  const exactHit =
    prediction &&
    ftScore &&
    prediction.homeGoals === ftScore[0] &&
    prediction.awayGoals === ftScore[1];
  const winnerHit =
    prediction &&
    ftScore &&
    prediction.homeGoals != null &&
    prediction.awayGoals != null &&
    Math.sign(prediction.homeGoals - prediction.awayGoals) ===
      Math.sign(ftScore[0] - ftScore[1]);
  // Real live score from TxLINE; 0–0 until the feed reports goals.
  const liveHome = score?.homeGoals ?? 0;
  const liveAway = score?.awayGoals ?? 0;
  // Match minute: TxLINE clock when it's ticking, else elapsed since kickoff.
  const clockMin =
    typeof score?.clockSeconds === "number"
      ? Math.floor(score.clockSeconds / 60)
      : now === null
        ? 0
        : Math.floor((now - new Date(fixture.kickoffUtc).getTime()) / 60_000);
  // Breaks show a label with no pulsing dot; the dot means the clock runs.
  const atBreak =
    score?.statusId === 3 || score?.statusId === 6 || score?.statusId === 8;
  const matchMinute =
    score?.statusId === 3
      ? "Halftime"
      : score?.statusId === 6 || score?.statusId === 8
        ? "Extra time break"
      : typeof score?.clockSeconds === "number"
        ? formatLiveMinute(score.clockSeconds, score.statusId)
        : clockMin >= 90
          ? "90+'"
          : `${Math.max(1, clockMin)}'`;
  const homeIso = teamFlag(fixture.homeTeam);
  const awayIso = teamFlag(fixture.awayTeam);
  const glowHome = (homeIso && teamGlow[homeIso]) || "#3b3b44";
  const glowAway = (awayIso && teamGlow[awayIso]) || "#3b3b44";
  const kickoff = new Date(fixture.kickoffUtc);
  const stage = fixtureStage(fixture);
  const hasStage = stage !== "World Cup";

  // Persist the scoreline as a MatchPrediction, keeping any richer fields the
  // full match page may have already saved. A blank box clears the pick.
  const commit = (nextHome: string, nextAway: string) => {
    if (nextHome === "" || nextAway === "") {
      onPredictedChange(fixture.fixtureId, false);
      setJustSaved(false);

      return;
    }

    const homeGoals = Number(nextHome);
    const awayGoals = Number(nextAway);
    const existing = loadPrediction(fixture.fixtureId);

    savePrediction({
      ...existing,
      fixtureId: fixture.fixtureId,
      homeGoals,
      awayGoals,
      winner:
        homeGoals > awayGoals
          ? "home"
          : homeGoals < awayGoals
            ? "away"
            : "draw",
      totalGoals: homeGoals + awayGoals > PREDICTION_LINES.goals ? "over" : "under",
      totalCards: existing?.totalCards ?? "under",
      totalCorners: existing?.totalCorners ?? "under",
      savedAt: new Date().toISOString(),
    });
    onPredictedChange(fixture.fixtureId, true);
    setJustSaved(true);
  };

  const onGoalsChange =
    (side: "home" | "away") => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = cleanGoals(event.target.value);

      if (side === "home") {
        setHome(value);
        commit(value, away);
      } else {
        setAway(value);
        commit(home, value);
      }
    };

  // + / − stepper buttons on either side of each goal box.
  const step = (side: "home" | "away", delta: number) => {
    const current = side === "home" ? home : away;
    const value = String(
      Math.max(0, Math.min(19, (current === "" ? 0 : Number(current)) + delta)),
    );

    if (side === "home") {
      setHome(value);
      commit(value, away);
    } else {
      setAway(value);
      commit(home, value);
    }
  };

  const bothFilled = home !== "" && away !== "";

  // Calendar event for kickoff (a 2h slot), offered to Google / Outlook web or
  // as a downloadable .ics for Apple Calendar and everything else.
  const calendarEvent: CalendarEvent = {
    description: "World Cup 2026",
    end: new Date(kickoff.getTime() + 7_200_000),
    start: kickoff,
    title: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    uid: `fixture-${fixture.fixtureId}@fan-forecast`,
    url:
      typeof window === "undefined"
        ? undefined
        : `${window.location.origin}/match/${fixture.fixtureId}`,
  };
  const calendarFileName = `${fixture.homeTeam}-vs-${fixture.awayTeam}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div
      className="pc-card"
      style={
        {
          "--glow-home": glowHome,
          "--glow-away": glowAway,
        } as React.CSSProperties
      }
    >
      <div className="pc-head">
        <span className="pc-head-ic" aria-hidden="true">
          <HugeiconsIcon className="pc-ball" icon={FootballIcon} strokeWidth={2} />
        </span>
        <span className="pc-comp">World Cup 2026</span>
        <span className="pc-head-actions">
          <Menu>
            <MenuTrigger aria-label="Add to calendar" className="pc-head-btn">
              <HugeiconsIcon icon={CalendarAddIcon} strokeWidth={2} />
            </MenuTrigger>
            <MenuContent>
              <MenuLinkItem
                href={googleCalendarUrl(calendarEvent)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <HugeiconsIcon icon={GoogleIcon} strokeWidth={2} />
                Google Calendar
              </MenuLinkItem>
              <MenuLinkItem
                href={outlookCalendarUrl(calendarEvent)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <HugeiconsIcon icon={MicrosoftIcon} strokeWidth={2} />
                Outlook
              </MenuLinkItem>
              <MenuItem
                onClick={() => downloadIcs(calendarEvent, calendarFileName)}
              >
                <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                Apple Calendar / .ics
              </MenuItem>
            </MenuContent>
          </Menu>
          <button
            aria-label="Favourite"
            aria-pressed={favourite}
            className={`pc-head-btn${favourite ? " is-fav" : ""}`}
            onClick={() => setFavourite((value) => !value)}
            type="button"
          >
            <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
          </button>
        </span>
      </div>
      <div className="pc-panel">
        <div className="pc-teams" data-saved={justSaved ? "true" : undefined}>
          <TeamSide
            form={form?.[fixture.homeTeam]}
            href={`/match/${fixture.fixtureId}`}
            iso={homeIso}
            name={fixture.homeTeam}
          />

          {/* Stage + kick-off time — hidden for now, kept for later.
          <Link className="pc-when" href={`/match/${fixture.fixtureId}`}>
            {live ? (
              <span className="pc-live">LIVE</span>
            ) : (
              <>
                {hasStage ? <span className="pc-day">{stage}</span> : null}
                <span className="pc-time">
                  {formatKickoffTime(fixture.kickoffUtc)}
                </span>
              </>
            )}
          </Link>
          */}

          <div
            className={`pc-scores${ended || live ? " pc-scores-ended" : ""}`}
          >
            {ended ? (
              <>
                <span className="pc-livebox pc-box-home pc-final-box">
                  {prediction ? prediction.homeGoals : "-"}
                </span>
                {(prediction && final) || !prediction ? (
                  // No prediction made: the badge still shows, greyed with
                  // 0 - points left on the table. Predicted-but-unsettled
                  // stays blank until settlement (a match-page visit).
                  <PointsBadge
                    muted={!prediction}
                    points={final?.totalPoints ?? 0}
                  />
                ) : null}
                <span className="pc-livebox pc-box-away pc-final-box">
                  {prediction ? prediction.awayGoals : "-"}
                </span>
                {ftScore ? (
                  <span className="pc-ftline">
                    <span className="pc-ft-tag">FT</span>
                    <span className="pc-ft-score">{ftScore[0]}</span>
                    <span className="pc-ft-dash">-</span>
                    <span className="pc-ft-score">{ftScore[1]}</span>
                  </span>
                ) : null}
                {prediction && final && (exactHit || winnerHit || final.totalPoints > 0) ? (
                  <span className="pc-why">
                    {exactHit
                      ? "Exact score!"
                      : winnerHit
                        ? "Right winner"
                        : "Good calls!"}
                  </span>
                ) : null}
              </>
            ) : live ? (
              <>
                <span className="pc-livebox pc-box-home">
                  {prediction ? prediction.homeGoals : "–"}
                </span>
                <span className="pc-livebox pc-box-away">
                  {prediction ? prediction.awayGoals : "–"}
                </span>
                <span className="pc-ftline pc-live-stack">
                  <span className="pc-live-row">
                    <span className="pc-ft-score">{liveHome}</span>
                    <span className="pc-ft-dash">-</span>
                    <span className="pc-ft-score">{liveAway}</span>
                  </span>
                  <span className="pc-live-row">
                    {atBreak ? null : (
                      <span className="pc-live-dot" aria-hidden="true" />
                    )}
                    <span className="pc-livebar-min">{matchMinute}</span>
                  </span>
                </span>
              </>
            ) : locked ? (
              <>
                <span className="pc-score-final">
                  {prediction ? prediction.homeGoals : "–"}
                </span>
                <span className="pc-score-final">
                  {prediction ? prediction.awayGoals : "–"}
                </span>
              </>
            ) : (
              <>
                <ScoreStepper
                  ariaLabel={`${fixture.homeTeam} goals`}
                  onChange={onGoalsChange("home")}
                  onStep={(delta) => step("home", delta)}
                  value={home}
                />
                <ScoreStepper
                  ariaLabel={`${fixture.awayTeam} goals`}
                  onChange={onGoalsChange("away")}
                  onStep={(delta) => step("away", delta)}
                  value={away}
                />
                {bothFilled ? <CheckBadge /> : null}
              </>
            )}
          </div>

          <TeamSide
            form={form?.[fixture.awayTeam]}
            href={`/match/${fixture.fixtureId}`}
            iso={awayIso}
            name={fixture.awayTeam}
          />
        </div>

      </div>
    </div>
  );
}

// The global board pits the fan against three prediction bots (see
// prediction-bots): each bot makes its own call on every match the fan has
// played and is scored by the same engine, so it can finish above or below
// them. Not a real cross-device league - those come from Convex.
function globalLeaderboard(
  settledPoints: number,
  bots: Array<{ name: string; points: number }>,
): Array<{ bot: boolean; mine: boolean; name: string; points: number }> {
  return [
    { bot: false, mine: true, name: "You", points: settledPoints },
    ...bots.map((entry) => ({
      bot: true,
      mine: false,
      name: entry.name,
      points: entry.points,
    })),
  ].sort((left, right) => right.points - left.points);
}

function PredictionsFeed({
  finals,
  fixtures,
  now,
  predictions,
  scores,
}: {
  finals: Record<string, StoredSettlement>;
  fixtures: WorldCupFixture[];
  now: number | null;
  predictions: Record<string, MatchPrediction>;
  scores: Record<number, LiveScore>;
}) {
  const [showPast, setShowPast] = useState(false);
  const formByTeam = useMemo(
    () => buildTeamForm(fixtures, scores),
    [fixtures, scores],
  );

  // Fixture ids with a saved scoreline: the predictions prop (localStorage,
  // lands after mount) is the base; live edits from a card's score boxes are
  // overrides. Deriving during render avoids syncing props into state.
  const [predictedOverrides, setPredictedOverrides] = useState<
    Map<string, boolean>
  >(new Map());

  const handlePredictedChange = (fixtureId: number, predicted: boolean) => {
    setPredictedOverrides((prev) =>
      new Map(prev).set(String(fixtureId), predicted),
    );
  };

  const isPredicted = (fixture: WorldCupFixture) => {
    const id = String(fixture.fixtureId);

    return predictedOverrides.get(id) ?? id in predictions;
  };

  const isLive = (fixture: WorldCupFixture) =>
    now !== null && isPotentiallyLive(fixture, now);

  // Freshly settled games keep their card in the main feed for ~a day (the
  // payoff moment), then retire into the compact history below.
  const RECENT_WINDOW_MS = 27 * 60 * 60 * 1000;
  const isRecent = (fixture: WorldCupFixture) =>
    now !== null &&
    now - new Date(fixture.kickoffUtc).getTime() < RECENT_WINDOW_MS;

  // Main = live + upcoming + recently finished. Older finished games drop
  // into the collapsed history, newest first.
  const mainGames = fixtures.filter(
    (fixture) =>
      !isPastFixture(fixture) || isLive(fixture) || isRecent(fixture),
  );
  const pastGames = fixtures
    .filter(
      (fixture) =>
        isPastFixture(fixture) && !isLive(fixture) && !isRecent(fixture),
    )
    .sort(
      (left, right) =>
        new Date(right.kickoffUtc).getTime() -
        new Date(left.kickoffUtc).getTime(),
    );

  const toGroups = (list: WorldCupFixture[]) => {
    const groups: Array<{ label: string; matches: WorldCupFixture[] }> = [];
    // Same-day fixtures must be adjacent to fold into one dated group.
    const ordered = [...list].sort((left, right) =>
      left.kickoffUtc.localeCompare(right.kickoffUtc),
    );

    for (const fixture of ordered) {
      const label = dayLabel(fixture.kickoffUtc, now);
      const group = groups[groups.length - 1];

      if (group?.label === label) {
        group.matches.push(fixture);
      } else {
        groups.push({ label, matches: [fixture] });
      }
    }

    return groups;
  };

  const renderGroup = (
    group: {
      label: string;
      matches: WorldCupFixture[];
    },
    { collapsible = false }: { collapsible?: boolean } = {},
  ) => {
    const predicted = group.matches.filter(isPredicted).length;
    const header = (
      <>
        <TrophyIcon />
        <span className="pred-day-name">{group.label}</span>
        <span className="pred-day-pill">
          {predicted}/{group.matches.length} predicted
        </span>
        {collapsible ? (
          <HugeiconsIcon
            className="pred-day-chevron"
            icon={ArrowDown01Icon}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
    const grid = (
      <div className="pred-grid">
        {group.matches.map((fixture) => (
          <PredictionCard
            final={finals[String(fixture.fixtureId)]}
            fixture={fixture}
            form={formByTeam}
            key={fixture.fixtureId}
            now={now}
            onPredictedChange={handlePredictedChange}
            prediction={predictions[String(fixture.fixtureId)]}
            score={scores[fixture.fixtureId]}
          />
        ))}
      </div>
    );

    return (
      <div className="pred-day-block" key={group.matches[0].fixtureId}>
        {collapsible ? (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="pred-day pred-day-toggle">
              {header}
            </CollapsibleTrigger>
            <CollapsibleContent>{grid}</CollapsibleContent>
          </Collapsible>
        ) : (
          <>
            <div className="pred-day">{header}</div>
            {grid}
          </>
        )}
      </div>
    );
  };

  const settledPoints = Object.values(finals).reduce(
    (total, settlement) => total + (settlement.totalPoints ?? 0),
    0,
  );

  // The bots play the exact matches the fan has settled, so their board is a
  // fair head-to-head that fills in as the fan predicts more.
  const botRows = useMemo(
    () => botStandings(finals, fixtures),
    [finals, fixtures],
  );

  // Leagues and their standings are real and cross-device (Convex); only which
  // board is on show is a local preference, announced by the league dialogs.
  const { user } = useUser();
  // Convex auth (not Clerk's isSignedIn) so syncProfile only fires once Convex
  // has validated the token - firing earlier would throw "not signed in".
  const { isAuthenticated } = useConvexAuth();
  const myLeagues = useQuery(api.leagues.myLeagues) ?? [];
  const [board, setBoard] = useState("global");

  useEffect(() => {
    const refresh = () => setBoard(loadSelectedBoard());
    const timer = setTimeout(refresh, 0);

    window.addEventListener(LEAGUES_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      clearTimeout(timer);
      window.removeEventListener(LEAGUES_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const selectedLeague =
    myLeagues.find((league) => league.code === board) ?? null;

  // Keep every board this fan sits on current with the points their device has
  // latest Clerk name (points are derived server-side from settlements now).
  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "You";
  const syncProfile = useMutation(api.leagues.syncProfile);
  // The league member whose picks popup is open, if any.
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      void syncProfile({ displayName });
    }
  }, [displayName, isAuthenticated, syncProfile]);

  // A selected league shows its live members; the global board is a friendly
  // simulated benchmark so a brand-new fan still sees where they'd sit.
  const leagueBoard = useQuery(
    api.leagues.leaderboard,
    selectedLeague ? { leagueId: selectedLeague.id } : "skip",
  );
  const rows = selectedLeague
    ? (leagueBoard ?? []).map((member) => ({
        mine: member.isMe,
        // Your own row reads "You" so you can spot it even when a friend shares
        // your display name.
        name: member.isMe ? "You" : member.name,
        points: member.points,
        simulated: false,
        userId: member.userId as string | null,
      }))
    : globalLeaderboard(settledPoints, botRows).map((player) => ({
        mine: player.mine,
        name: player.name,
        points: player.points,
        simulated: player.bot,
        userId: null as string | null,
      }));

  // Roster management: owners only, tucked behind one ghost affordance.
  const [manageOpen, setManageOpen] = useState(false);
  const removeMember = useMutation(api.leagues.removeMember);
  const roster = (leagueBoard ?? []).filter((member) => !member.isMe);

  return (
    <div className="pred-layout">
      <div className="pred-col-main">
        {mainGames.length > 0 ? (
          toGroups(mainGames).map((group) =>
            renderGroup(group, { collapsible: true }),
          )
        ) : (
          <p className="muted">No upcoming matches right now.</p>
        )}

        {pastGames.length > 0 ? (
          <div className="pred-past">
            <button
              aria-expanded={showPast}
              className="pred-past-toggle"
              onClick={() => setShowPast((value) => !value)}
              type="button"
            >
              <span>Past results</span>
              <span className="pred-past-count">{pastGames.length}</span>
              <HugeiconsIcon
                icon={showPast ? ArrowUp01Icon : ArrowDown01Icon}
                strokeWidth={2}
              />
            </button>
            {showPast
            ? toGroups(pastGames).map((group) => renderGroup(group))
            : null}
          </div>
        ) : null}
      </div>

      <aside className="pred-col-side">
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
            {selectedLeague?.role === "owner" ? (
              <button
                className="pred-manage"
                onClick={() => setManageOpen(true)}
                type="button"
              >
                Manage
              </button>
            ) : null}
          </div>
        ) : null}
        {selectedLeague ? (
          <Dialog open={manageOpen} onOpenChange={setManageOpen}>
            <DialogContent className="lc-prompt league-modal">
              <DialogTitle className="league-modal-title">
                Manage {selectedLeague.name}
              </DialogTitle>
              <DialogDescription className="league-modal-desc">
                You run this league - remove anyone who shouldn&apos;t be on
                the board. Friends join with code{" "}
                <strong className="pred-code">{selectedLeague.code}</strong>.
              </DialogDescription>
              {roster.length > 0 ? (
                <ul className="league-roster">
                  {roster.map((member) => (
                    <li className="league-roster-row" key={member.userId}>
                      <span>{member.name}</span>
                      <button
                        aria-label={`Remove ${member.name} from ${selectedLeague.name}`}
                        className="league-roster-remove"
                        onClick={() =>
                          void removeMember({
                            leagueId: selectedLeague.id,
                            userId: member.userId,
                          })
                        }
                        type="button"
                      >
                        <svg
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeWidth={2.2}
                          viewBox="0 0 24 24"
                        >
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="league-roster-empty">
                  Just you in here now. Share the code to fill the board back
                  up.
                </p>
              )}
              <div className="lc-prompt-actions lc-prompt-actions-single">
                <button
                  className="lc-prompt-btn lc-prompt-btn-main"
                  onClick={() => setManageOpen(false)}
                  type="button"
                >
                  <span>Done</span>
                </button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
        <ol className="pred-board">
          {rows.map((player, index) => {
            const content = (
              <>
                <span
                  className={`pred-rank${index === 0 ? " pred-rank-first" : ""}`}
                >
                  {index + 1}
                </span>
                <span aria-hidden className="pred-avatar">
                  {player.name[0]}
                </span>
                <span className="pred-player">
                  {player.name}
                  {player.simulated ? (
                    <em className="pred-sim" title="Prediction bot">
                      bot
                    </em>
                  ) : null}
                </span>
                <span className="pred-points">{player.points} pts</span>
              </>
            );

            return (
              <li
                className={`pred-row${player.mine ? " pred-you" : ""}`}
                key={player.userId ?? player.name}
              >
                {player.userId ? (
                  // Real league members open a picks popup; bots don't.
                  <button
                    className="pred-row-link"
                    onClick={() => setProfileUserId(player.userId)}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
        {selectedLeague ? (
          <p className="muted">
            {selectedLeague.name} · invite code{" "}
            <strong className="pred-code">{selectedLeague.code}</strong> -
            share it and friends join from the card above. Everyone&apos;s
            points settle live from their own TxLINE picks.
          </p>
        ) : (
          <p className="muted">
            The global board pits you against three prediction bots - each makes
            its own call on every match you&apos;ve played, scored on the same
            rules from TxLINE results. Create or join a league for real
            leaderboards against friends.
          </p>
        )}
        <UserProfileDialog
          onOpenChange={(open) => {
            if (!open) {
              setProfileUserId(null);
            }
          }}
          userId={profileUserId}
        />
      </aside>
    </div>
  );
}
