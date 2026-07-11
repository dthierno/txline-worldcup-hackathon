"use client";

import Link from "next/link";

import {
  ChampionIcon,
  FootballIcon,
  TargetIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
import type { MatchPrediction } from "@/lib/prediction-engine";
import {
  loadPredictions,
  loadSettlements,
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
  const now = useNow();

  // Decimal 1X2 odds chips for upcoming fixtures (from TxLINE win
  // probabilities; at most four fetches).
  useEffect(() => {
    const upcoming = fixtures.filter((f) => !isPastFixture(f)).slice(0, 4);

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

      <Tabs className="home-tabs" defaultValue="matches">
        <TabsList className="w-full">
          <TabsTrigger value="matches">
            <HugeiconsIcon icon={FootballIcon} strokeWidth={2} />
            Matches
          </TabsTrigger>
          <TabsTrigger value="predictions">
            <HugeiconsIcon icon={TargetIcon} strokeWidth={2} />
            Predictions
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
          <MyPredictionsSection fixtures={fixtures} />
        </TabsContent>
        <TabsContent value="knockout">
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

const titleIso: Array<[string, string]> = [
  ["france", "fr"], ["morocco", "ma"], ["spain", "es"], ["belgium", "be"],
  ["england", "gb-eng"], ["norway", "no"], ["argentina", "ar"],
  ["switzerland", "ch"], ["egypt", "eg"], ["colombia", "co"],
  ["mexico", "mx"], ["canada", "ca"], ["brazil", "br"], ["portugal", "pt"],
  ["paraguay", "py"], ["usa", "us"],
];

function isoFromTitle(title: string): string | undefined {
  const lower = title.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

function teamFlag(team: string): string | undefined {
  const lower = team.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

// Soft accent per nation for the card corner glows.
const teamGlow: Record<string, string> = {
  ar: "#38bdf8", be: "#facc15", br: "#16a34a", ca: "#dc2626",
  ch: "#dc2626", co: "#facc15", eg: "#dc2626", es: "#f59e0b",
  fr: "#3b82f6", "gb-eng": "#e11d48", ma: "#dc2626", mx: "#16a34a",
  no: "#ef4444", pt: "#dc2626", py: "#ef4444", us: "#3b82f6",
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



function MyPredictionsSection({ fixtures }: { fixtures: WorldCupFixture[] }) {
  // Lazy initializers instead of an effect: this page unmounts whenever a
  // match is opened, so returning home re-reads localStorage fresh.
  const mounted = useIsMounted();
  const [predictions] = useState<Record<string, MatchPrediction>>(() =>
    loadPredictions(),
  );
  const [settlements] = useState<Record<string, StoredSettlement>>(() =>
    loadSettlements(),
  );

  const entries = Object.values(predictions)
    .flatMap((prediction) => {
      const fixture = fixtures.find(
        (candidate) => candidate.fixtureId === prediction.fixtureId,
      );

      return fixture
        ? [
            {
              fixture,
              prediction,
              settlement: settlements[String(prediction.fixtureId)] as
                | StoredSettlement
                | undefined,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        new Date(left.fixture.kickoffUtc).getTime() -
        new Date(right.fixture.kickoffUtc).getTime(),
    );

  const settledPoints = entries.reduce(
    (total, entry) => total + (entry.settlement?.totalPoints ?? 0),
    0,
  );

  if (!mounted || entries.length === 0) {
    return (
      <section aria-labelledby="my-predictions-heading">
        <h2 id="my-predictions-heading">Your predictions</h2>
        <p>
          No predictions yet. Open an upcoming game to save one; it locks at
          kickoff and settles from TxLINE score data.
        </p>
      </section>
    );
  }

  const leaderboard = [
    { name: "You", points: settledPoints, simulated: false },
    { name: "Amina", points: Math.round(settledPoints * 0.75), simulated: true },
    { name: "Sam", points: Math.round(settledPoints * 0.5), simulated: true },
    { name: "Noah", points: Math.round(settledPoints * 0.25), simulated: true },
  ].sort((left, right) => right.points - left.points);

  return (
    <section aria-labelledby="my-predictions-heading">
      <h2 id="my-predictions-heading">Your predictions</h2>
      <ul className="game-list">
        {entries.map(({ fixture, prediction, settlement }) => (
          <li key={prediction.fixtureId}>
            <Link className="game-link" href={`/match/${fixture.fixtureId}`}>
              {fixture.homeTeam} vs {fixture.awayTeam}
            </Link>{" "}
            <span>
              Picked {prediction.homeGoals}-{prediction.awayGoals}.{" "}
              {settlement
                ? `Settled: ${settlement.totalPoints} point(s), final score ${settlement.finalScore}.`
                : "Not settled yet - open the match to settle from TxLINE data."}
            </span>
          </li>
        ))}
      </ul>
      <h3>Local league</h3>
      <ol>
        {leaderboard.map((player) => (
          <li key={player.name}>
            {player.name}
            {player.simulated ? " (simulated rival)" : ""}: {player.points}{" "}
            point(s)
          </li>
        ))}
      </ol>
      <p>
        Prototype league stored on this device. Rival scores are simulated for
        the demo; your points settle from TxLINE data only.
      </p>
    </section>
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
