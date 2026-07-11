"use client";

import Link from "next/link";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  CalendarAddIcon,
  ChampionIcon,
  FootballIcon,
  StarIcon,
  TargetIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { GroupTables } from "@/components/group-tables";
import { Hero } from "@/components/hero";
import { LeagueActions } from "@/components/league-actions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useEffect, useMemo, useState } from "react";

import {
  fetchJson,
  formatDate,
  isPastFixture,
  isPotentiallyLive,
  mergeFixtures,
  useIsMounted,
  useNow,
  type ApiResult,
  type TxlineStatus,
} from "@/lib/match-shared";
import { PREDICTION_LINES, type MatchPrediction } from "@/lib/prediction-engine";
import type { NormalizedTxlineScore } from "@/lib/txline-normalize";
import {
  isPredictionLocked,
  loadPrediction,
  loadPredictions,
  loadSettlements,
  savePrediction,
  type StoredSettlement,
} from "@/lib/prediction-store";
import {
  txlineWorldCupFixtures,
  type WorldCupFixture,
} from "@/lib/world-cup-fixtures";

type BracketTeam = {
  code: string;
  iso?: string;
};

type BracketMatch = {
  away: BracketTeam;
  badge?: "FINAL" | "BRONZE-FINAL";
  date?: string;
  home: BracketTeam;
  score?: string;
  winner?: "home" | "away";
};

// ISO codes for flagcdn.com images (free flag CDN; FotMob's own assets are
// proprietary).
const teamIso: Record<string, string> = {
  ALG: "dz", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BIH: "ba",
  BRA: "br", CAN: "ca", CIV: "ci", COD: "cd", COL: "co", CPV: "cv",
  CRO: "hr", ECU: "ec", EGY: "eg", ENG: "gb-eng", ESP: "es", FRA: "fr",
  GER: "de", GHA: "gh", JPN: "jp", MAR: "ma", MEX: "mx", NED: "nl",
  NOR: "no", PAR: "py", POR: "pt", RSA: "za", SEN: "sn", SUI: "ch",
  SWE: "se", USA: "us",
};

function team(code: string): BracketTeam {
  return { code, iso: teamIso[code] };
}

function match(
  home: string,
  away: string,
  rest: Omit<BracketMatch, "away" | "home"> = {},
): BracketMatch {
  return { away: team(away), home: team(home), ...rest };
}

const leftRound1: BracketMatch[] = [
  match("GER", "PAR", { score: "1 - 1", winner: "away" }),
  match("FRA", "SWE", { score: "3 - 0", winner: "home" }),
  match("RSA", "CAN", { score: "0 - 1", winner: "away" }),
  match("NED", "MAR", { score: "1 - 1", winner: "away" }),
  match("POR", "CRO", { score: "2 - 1", winner: "home" }),
  match("ESP", "AUT", { score: "3 - 0", winner: "home" }),
  match("USA", "BIH", { score: "2 - 0", winner: "home" }),
  match("BEL", "SEN", { score: "3 - 2", winner: "home" }),
];

const leftRound2: BracketMatch[] = [
  match("PAR", "FRA", { score: "0 - 1", winner: "away" }),
  match("CAN", "MAR", { score: "0 - 3", winner: "away" }),
  match("POR", "ESP", { score: "0 - 1", winner: "away" }),
  match("USA", "BEL", { score: "1 - 4", winner: "away" }),
];

const leftQuarterFinals: BracketMatch[] = [
  match("FRA", "MAR", { score: "2 - 0", winner: "home" }),
  match("ESP", "BEL", { date: "Tomorrow" }),
];

const rightQuarterFinals: BracketMatch[] = [
  match("NOR", "ENG", { date: "Jul 11" }),
  match("ARG", "SUI", { date: "Jul 11" }),
];

const rightRound2: BracketMatch[] = [
  match("BRA", "NOR", { score: "1 - 2", winner: "away" }),
  match("MEX", "ENG", { score: "2 - 3", winner: "away" }),
  match("ARG", "EGY", { score: "3 - 2", winner: "home" }),
  match("SUI", "COL", { score: "0 - 0", winner: "home" }),
];

const rightRound1: BracketMatch[] = [
  match("BRA", "JPN", { score: "2 - 1", winner: "home" }),
  match("CIV", "NOR", { score: "1 - 2", winner: "away" }),
  match("MEX", "ECU", { score: "2 - 0", winner: "home" }),
  match("ENG", "COD", { score: "2 - 1", winner: "home" }),
  match("ARG", "CPV", { score: "3 - 2", winner: "home" }),
  match("AUS", "EGY", { score: "1 - 1", winner: "away" }),
  match("SUI", "ALG", { score: "2 - 0", winner: "home" }),
  match("COL", "GHA", { score: "1 - 0", winner: "home" }),
];

const semiFinal1 = match("FRA", "TBD", { date: "Jul 14" });
const semiFinal2 = match("TBD", "TBD", { date: "Jul 15" });
const finalMatch = match("WS1", "WS2", { badge: "FINAL", date: "Jul 19" });
const bronzeFinal = match("LS1", "LS2", {
  badge: "BRONZE-FINAL",
  date: "Jul 18",
});

export function HomePage() {
  const [fixtures, setFixtures] = useState<WorldCupFixture[]>(
    txlineWorldCupFixtures,
  );
  const [fixtureSource, setFixtureSource] = useState("TxLINE docs schedule seed");
  const [fixtureValidation, setFixtureValidation] =
    useState<ApiResult<unknown> | null>(null);
  const [status, setStatus] = useState<TxlineStatus | null>(null);
  const mounted = useIsMounted();
  const [predictions] = useState<Record<string, MatchPrediction>>(() =>
    loadPredictions(),
  );
  const [finals] = useState<Record<string, StoredSettlement>>(() =>
    loadSettlements(),
  );
  const [odds, setOdds] = useState<Record<number, string[]>>({});
  const [scores, setScores] = useState<Record<number, NormalizedTxlineScore>>(
    {},
  );
  const now = useNow();

  // Live score snapshots from TxLINE for any in-play fixture; polled while the
  // match is inside its live window so the score and clock stay current.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      const liveFixtures = fixtures.filter((fixture) =>
        isPotentiallyLive(fixture, Date.now()),
      );

      liveFixtures.forEach((fixture) => {
        fetchJson<NormalizedTxlineScore>(
          `/api/txline/scores/${fixture.fixtureId}`,
        ).then((result) => {
          if (!cancelled && result.data) {
            setScores((prev) => ({
              ...prev,
              [fixture.fixtureId]: result.data as NormalizedTxlineScore,
            }));
          }
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

  // Decimal 1X2 odds chips for upcoming fixtures (from TxLINE win
  // probabilities; at most four fetches).
  useEffect(() => {
    const upcoming = fixtures.filter((f) => !isPastFixture(f)).slice(0, 10);

    upcoming.forEach((fixture) => {
      fetchJson<{
        awayWinProbability: number | null;
        drawProbability: number | null;
        homeWinProbability: number | null;
      }>(`/api/txline/odds/${fixture.fixtureId}`).then((result) => {
        const d = result.data;

        if (d?.homeWinProbability && d.drawProbability && d.awayWinProbability) {
          setOdds((prev) => ({
            ...prev,
            [fixture.fixtureId]: [
              (100 / d.homeWinProbability!).toFixed(2),
              (100 / d.drawProbability!).toFixed(2),
              (100 / d.awayWinProbability!).toFixed(2),
            ],
          }));
        }
      });
    });
  }, [fixtures]);

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

      setFixtures(mergeFixtures(txlineWorldCupFixtures, liveFixtures));
      setFixtureSource(
        liveFixtures.length > 0
          ? `${fixturesResult.source ?? "TxLINE fixtures snapshot API"} + docs seed`
          : fixturesResult.source ??
              fixturesResult.error ??
              "TxLINE docs schedule seed",
      );
    }

    void loadFixtures();

    return () => {
      cancelled = true;
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

      <Tabs className="home-tabs" defaultValue="predictions">
        <TabsList className="w-full">
          <TabsTrigger value="predictions">
            <HugeiconsIcon icon={TargetIcon} strokeWidth={2} />
            Predictions
          </TabsTrigger>
          <TabsTrigger value="matches">
            <HugeiconsIcon icon={FootballIcon} strokeWidth={2} />
            Matches
          </TabsTrigger>
          <TabsTrigger value="knockout">
            <HugeiconsIcon icon={ChampionIcon} strokeWidth={2} />
            Knockout
          </TabsTrigger>
        </TabsList>
        <TabsContent value="matches">
          <MatchDayList
            finals={mounted ? finals : {}}
            fixtures={[...pastGames, ...upcomingGames]}
            now={now}
            odds={odds}
            predictions={mounted ? predictions : {}}
          />
        </TabsContent>
        <TabsContent value="predictions">
          <PredictionsFeed
            finals={mounted ? finals : {}}
            fixtures={[...pastGames, ...upcomingGames]}
            now={now}
            predictions={mounted ? predictions : {}}
            scores={scores}
          />
        </TabsContent>
        <TabsContent value="knockout">
          <h3 className="gt-section-title">Group stage</h3>
          <GroupTables />
          <h3 className="gt-section-title">Bracket</h3>
          <KnockoutBracket />
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
    timeZone: "UTC",
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
    timeZone: "UTC",
  }).format(new Date(kickoffUtc));
}

function MatchDayList({
  finals,
  fixtures,
  now,
  odds,
  predictions,
}: {
  finals: Record<string, StoredSettlement>;
  fixtures: WorldCupFixture[];
  now: number | null;
  odds: Record<number, string[]>;
  predictions: Record<string, MatchPrediction>;
}) {
  const groups: Array<{ label: string; matches: WorldCupFixture[] }> = [];

  for (const fixture of fixtures) {
    const label = dayLabel(fixture.kickoffUtc, now);
    const group = groups[groups.length - 1];

    if (group?.label === label) {
      group.matches.push(fixture);
    } else {
      groups.push({ label, matches: [fixture] });
    }
  }

  return (
    <section aria-labelledby="matches-heading">
      <h2 id="matches-heading">Matches</h2>
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className={`day-label${group.label === "Today" ? " day-today" : ""}`}>
            {group.label}
          </h3>
          {group.matches.map((fixture) => {
            const past = isPastFixture(fixture);
            const live = now !== null && isPotentiallyLive(fixture, now);
            const homeIso = teamFlag(fixture.homeTeam);
            const awayIso = teamFlag(fixture.awayTeam);
            const prediction = predictions[String(fixture.fixtureId)];
            const final = finals[String(fixture.fixtureId)];
            const fixtureOdds = odds[fixture.fixtureId];

            return (
              <Link
                aria-label={`${fixture.homeTeam} vs ${fixture.awayTeam}`}
                className="match-card"
                href={`/match/${fixture.fixtureId}`}
                key={fixture.fixtureId}
                style={{
                  "--glow-home": (homeIso && teamGlow[homeIso]) || "#3b3b44",
                  "--glow-away": (awayIso && teamGlow[awayIso]) || "#3b3b44",
                } as React.CSSProperties}
              >
                <span className="mc-top">
                  <span className="mc-time">
                    {live ? <i className="mc-live" /> : null}
                    {live ? "LIVE" : formatKickoffTime(fixture.kickoffUtc)}
                  </span>
                  <span className="mc-open" aria-hidden="true">↗</span>
                </span>
                <span className="mc-teams">
                  <span className="mc-team">
                    {homeIso ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" src={`https://flagcdn.com/w80/${homeIso}.png`} />
                    ) : null}
                    <span>{fixture.homeTeam}</span>
                  </span>
                  <span className="mc-center">
                    {past || live ? (
                      <>
                        <small>{live ? "" : "FT"}</small>
                        <b>{final ? final.finalScore.replace("-", " - ") : "- : -"}</b>
                      </>
                    ) : prediction ? (
                      <>
                        <small>Your pick</small>
                        <b>{prediction.homeGoals} - {prediction.awayGoals}</b>
                      </>
                    ) : (
                      <>
                        <small>Predict</small>
                        <b className="mc-q">? - ?</b>
                      </>
                    )}
                  </span>
                  <span className="mc-team">
                    {awayIso ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" src={`https://flagcdn.com/w80/${awayIso}.png`} />
                    ) : null}
                    <span>{fixture.awayTeam}</span>
                  </span>
                </span>
                {!past && fixtureOdds ? (
                  <span className="mc-odds">
                    <span>1 <b>{fixtureOdds[0]}</b></span>
                    <span>X <b>{fixtureOdds[1]}</b></span>
                    <span>2 <b>{fixtureOdds[2]}</b></span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
      <p className="muted">
        Odds are TxLINE 1X2 win probabilities shown as decimals. Final scores
        appear once a match you predicted settles; open any match for the
        verified result.
      </p>
    </section>
  );
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

// Deterministic five-match form strip so each team shows a stable win/draw/loss
// history. Illustrative — the app has no real form feed.
function teamForm(team: string): ("w" | "d" | "l")[] {
  let hash = 2166136261;

  for (let index = 0; index < team.length; index += 1) {
    hash = (hash ^ team.charCodeAt(index)) >>> 0;
    hash = (hash * 16777619) >>> 0;
  }

  const results: ("w" | "d" | "l")[] = [];

  for (let index = 0; index < 5; index += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const bucket = (hash >>> 8) % 10;

    results.push(bucket < 5 ? "w" : bucket < 8 ? "d" : "l");
  }

  return results;
}

function FormStrip({ results }: { results: ("w" | "d" | "l")[] }) {
  return (
    <span className="pc-form" aria-hidden="true">
      {results.map((result, index) => (
        <span className={`pc-dot pc-${result}`} key={index} />
      ))}
    </span>
  );
}

function TeamSide({
  href,
  iso,
  name,
}: {
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
      <FormStrip results={teamForm(name)} />
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

function PredictionCard({
  fixture,
  now,
  prediction,
  onPredictedChange,
  score,
}: {
  fixture: WorldCupFixture;
  now: number | null;
  prediction?: MatchPrediction;
  onPredictedChange: (fixtureId: number, predicted: boolean) => void;
  score?: NormalizedTxlineScore;
}) {
  const [favourite, setFavourite] = useState(false);
  const [home, setHome] = useState(
    prediction ? String(prediction.homeGoals) : "",
  );
  const [away, setAway] = useState(
    prediction ? String(prediction.awayGoals) : "",
  );
  const [justSaved, setJustSaved] = useState(false);
  // Prefer TxLINE's match phase when present (2 first half, 3 half-time,
  // 4 second half); otherwise fall back to the kickoff-window heuristic.
  const inPlay =
    score?.statusId != null
      ? [2, 3, 4].includes(score.statusId)
      : now !== null && isPotentiallyLive(fixture, now);
  const live = inPlay;
  const locked = now !== null && isPredictionLocked(fixture, now);
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
  const matchMinute =
    score?.statusId === 3
      ? "HT"
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

  // Google Calendar "add event" link for kickoff (a 2h slot).
  const stamp = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const calendarUrl =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`${fixture.homeTeam} vs ${fixture.awayTeam}`)}` +
    `&dates=${stamp(kickoff)}/${stamp(new Date(kickoff.getTime() + 7_200_000))}`;

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
          <a
            aria-label="Add to calendar"
            className="pc-head-btn"
            href={calendarUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HugeiconsIcon icon={CalendarAddIcon} strokeWidth={2} />
          </a>
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

          <div className="pc-scores">
            {live ? (
              <>
                <span className="pc-livebox">
                  {prediction ? prediction.homeGoals : "–"}
                </span>
                <span className="pc-livebox">
                  {prediction ? prediction.awayGoals : "–"}
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
            href={`/match/${fixture.fixtureId}`}
            iso={awayIso}
            name={fixture.awayTeam}
          />
        </div>

        {live ? (
          <div className="pc-livebar">
            <span className="pc-live-dot" aria-hidden="true" />
            <span className="pc-livebar-min">{matchMinute}</span>
            <span className="pc-livebar-score">
              {liveHome}
              <span className="pc-livebar-dash">–</span>
              {liveAway}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
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
  scores: Record<number, NormalizedTxlineScore>;
}) {
  const [showPast, setShowPast] = useState(false);

  // Fixture ids with a saved scoreline. Seeded from predictions already on the
  // device and updated live as the fan types into a card's score boxes.
  const [predictedIds, setPredictedIds] = useState<Set<string>>(
    () => new Set(Object.keys(predictions)),
  );

  // Predictions load client-side (localStorage), so the prop is empty on the
  // first render and populated once mounted — fold those ids in when they land.
  useEffect(() => {
    setPredictedIds((prev) => {
      const next = new Set(prev);

      for (const id of Object.keys(predictions)) {
        next.add(id);
      }

      return next;
    });
  }, [predictions]);

  const handlePredictedChange = (fixtureId: number, predicted: boolean) => {
    setPredictedIds((prev) => {
      const next = new Set(prev);

      if (predicted) {
        next.add(String(fixtureId));
      } else {
        next.delete(String(fixtureId));
      }

      return next;
    });
  };

  const isPredicted = (fixture: WorldCupFixture) =>
    predictedIds.has(String(fixture.fixtureId));

  const isLive = (fixture: WorldCupFixture) =>
    now !== null && isPotentiallyLive(fixture, now);

  // Main = live + not-yet-kicked-off games (what the fan acts on now). Finished
  // games drop into a collapsed "Past results" section, newest first.
  const mainGames = fixtures.filter(
    (fixture) => !isPastFixture(fixture) || isLive(fixture),
  );
  const pastGames = fixtures
    .filter((fixture) => isPastFixture(fixture) && !isLive(fixture))
    .sort(
      (left, right) =>
        new Date(right.kickoffUtc).getTime() -
        new Date(left.kickoffUtc).getTime(),
    );

  const toGroups = (list: WorldCupFixture[]) => {
    const groups: Array<{ label: string; matches: WorldCupFixture[] }> = [];

    for (const fixture of list) {
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

  const renderGroup = (group: {
    label: string;
    matches: WorldCupFixture[];
  }) => {
    const predicted = group.matches.filter(isPredicted).length;

    return (
      <div className="pred-day-block" key={group.label}>
        <div className="pred-day">
          <HugeiconsIcon
            className="pred-day-ic"
            icon={ChampionIcon}
            strokeWidth={2}
          />
          <span className="pred-day-name">{group.label}</span>
          <span className="pred-day-count">
            {predicted} / {group.matches.length}
          </span>
        </div>
        <div className="pred-grid">
          {group.matches.map((fixture) => (
            <PredictionCard
              fixture={fixture}
              key={fixture.fixtureId}
              now={now}
              onPredictedChange={handlePredictedChange}
              prediction={predictions[String(fixture.fixtureId)]}
              score={scores[fixture.fixtureId]}
            />
          ))}
        </div>
      </div>
    );
  };

  const settledPoints = Object.values(finals).reduce(
    (total, settlement) => total + (settlement.totalPoints ?? 0),
    0,
  );

  const leaderboard = [
    { name: "You", points: settledPoints, you: true },
    { name: "Amina", points: Math.round(settledPoints * 0.75), you: false },
    { name: "Sam", points: Math.round(settledPoints * 0.5), you: false },
    { name: "Noah", points: Math.round(settledPoints * 0.25), you: false },
  ].sort((left, right) => right.points - left.points);

  return (
    <>
      {mainGames.length > 0 ? (
        toGroups(mainGames).map(renderGroup)
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
          {showPast ? toGroups(pastGames).map(renderGroup) : null}
        </div>
      ) : null}

      <h3 className="gt-section-title">Local league</h3>
      <ol className="pred-board">
        {leaderboard.map((player, index) => (
          <li
            className={`pred-row${player.you ? " pred-you" : ""}`}
            key={player.name}
          >
            <span className="pred-rank">{index + 1}</span>
            <span className="pred-player">
              {player.name}
              {player.you ? "" : " · sim"}
            </span>
            <span className="pred-points">{player.points} pts</span>
          </li>
        ))}
      </ol>
      <p className="muted">
        Prototype league stored on this device. Rival scores are simulated;
        your points and live scores come from TxLINE. Form strips are
        illustrative.
      </p>
    </>
  );
}

function BracketFlag({ team }: { team: BracketTeam }) {
  return team.iso ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="bk-flag-img"
      loading="lazy"
      src={`https://flagcdn.com/w40/${team.iso}.png`}
    />
  ) : (
    <span className="bk-flag-img bk-flag-tbd" aria-hidden="true">
      🛡️
    </span>
  );
}

function BracketCard({ match }: { match: BracketMatch }) {
  return (
    <div className="bk-match">
      <div className="bk-teams">
        <div className={`bk-team${match.winner === "away" ? " out" : ""}`}>
          <BracketFlag team={match.home} />
          <span className="bk-code">{match.home.code}</span>
        </div>
        <div className={`bk-team${match.winner === "home" ? " out" : ""}`}>
          <BracketFlag team={match.away} />
          <span className="bk-code">{match.away.code}</span>
        </div>
      </div>
      {match.score ? <div className="bk-score">{match.score}</div> : null}
      {match.date ? <div className="bk-date">{match.date}</div> : null}
      {match.badge ? (
        <div>
          <span
            className={`bk-badge ${match.badge === "FINAL" ? "final" : "bronze"}`}
          >
            {match.badge}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function BracketColumnList({
  matches,
  side,
}: {
  matches: BracketMatch[];
  side: "l" | "r";
}) {
  const pairs: BracketMatch[][] = [];

  for (let index = 0; index < matches.length; index += 2) {
    pairs.push(matches.slice(index, index + 2));
  }

  return (
    <div className={`bk-col bk-${side}`}>
      {pairs.map((pair, pairIndex) => (
        <div className="bk-pair" key={pairIndex}>
          {pair.map((entry, index) => (
            <BracketCard
              key={`${entry.home.code}-${entry.away.code}-${index}`}
              match={entry}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function KnockoutBracket() {
  return (
    <section className="card knockout-breakout" aria-labelledby="knockout-heading">
      <h2 id="knockout-heading">Knockout</h2>
      <div className="knockout-scroll" role="region" aria-label="Knockout bracket">
        <div className="bk-grid">
          <BracketColumnList matches={leftRound1} side="l" />
          <BracketColumnList matches={leftRound2} side="l" />
          <BracketColumnList matches={leftQuarterFinals} side="l" />
          <div className="bk-center">
            <div className="bk-trophy" aria-hidden="true">
              🏆<span>CHAMPION</span>
            </div>
            <div className="bk-final-row">
              <BracketCard match={semiFinal1} />
              <BracketCard match={finalMatch} />
              <BracketCard match={semiFinal2} />
            </div>
            <BracketCard match={bronzeFinal} />
          </div>
          <BracketColumnList matches={rightQuarterFinals} side="r" />
          <BracketColumnList matches={rightRound2} side="r" />
          <BracketColumnList matches={rightRound1} side="r" />
        </div>
      </div>
      <p className="muted">
        Static sample bracket (FotMob-style). Struck-through teams are
        eliminated; the France vs Morocco quarter-final score matches the
        TxLINE result. It is separate from the live TxLINE game data above.
      </p>
    </section>
  );
}
