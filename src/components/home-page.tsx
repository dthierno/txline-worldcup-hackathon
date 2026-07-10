"use client";

import Link from "next/link";

import { Hero } from "@/components/hero";
import { useEffect, useMemo, useState } from "react";

import {
  fetchJson,
  formatDate,
  isPastFixture,
  mergeFixtures,
  useIsMounted,
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

      <GameList
        heading="Past games"
        emptyText="No past World Cup games found."
        games={pastGames}
      />
      <GameList
        heading="Upcoming games"
        emptyText="No upcoming World Cup games found."
        games={upcomingGames}
      />
      <MyPredictionsSection fixtures={fixtures} />
      <KnockoutBracket />
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

  const entries = [...featuredStories, ...stories.map((story) => ({
    id: story.id,
    iso: isoFromTitle(story.title),
    label: story.title,
    link: story.link,
  }))];

  return (
    <section aria-labelledby="stories-heading">
      <h2 id="stories-heading">Stories</h2>
      <div className="stories-rail">
        {entries.map((entry) => (
          <a
            className="story-circle"
            href={entry.link}
            key={entry.id}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="story-ring">
              {entry.iso ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={`https://flagcdn.com/w80/${entry.iso}.png`} />
              ) : (
                <span className="story-fallback">26</span>
              )}
            </span>
            <span className="story-label">{entry.label}</span>
          </a>
        ))}
      </div>
      <p className="muted">
        Via Google News RSS; each circle opens the original story on FIFA.com.
      </p>
    </section>
  );
}

// Hand-picked story deep links (public URLs; linking out only).
const featuredStories = [
  {
    id: "featured-fr-goals",
    iso: "fr",
    label: "France Goals",
    link: "https://www.fifa.com/#stories/37c02e44-68dd-604e-fc30-3a21a4c80e4a",
  },
];

const titleIso: Array<[string, string]> = [
  ["france", "fr"], ["morocco", "ma"], ["spain", "es"], ["belgium", "be"],
  ["england", "gb-eng"], ["norway", "no"], ["argentina", "ar"],
  ["switzerland", "ch"], ["egypt", "eg"], ["colombia", "co"],
  ["mexico", "mx"], ["canada", "ca"], ["brazil", "br"], ["portugal", "pt"],
];

function isoFromTitle(title: string): string | undefined {
  const lower = title.toLowerCase();

  return titleIso.find(([name]) => lower.includes(name))?.[1];
}

function GameList({
  emptyText,
  games,
  heading,
}: {
  emptyText: string;
  games: WorldCupFixture[];
  heading: string;
}) {
  return (
    <section aria-labelledby={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <h2 id={`${heading.toLowerCase().replaceAll(" ", "-")}-heading`}>
        {heading}
      </h2>
      {games.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul className="game-list">
          {games.map((fixture) => (
            <li key={fixture.fixtureId}>
              <Link className="game-link" href={`/match/${fixture.fixtureId}`}>
                {fixture.homeTeam} vs {fixture.awayTeam}
              </Link>{" "}
              <span className="muted">
                {formatDate(fixture.kickoffUtc)} UTC - {fixture.stage}
              </span>
            </li>
          ))}
        </ul>
      )}
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
