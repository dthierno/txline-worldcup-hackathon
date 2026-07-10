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

  const entries = [...featuredStories, ...stories.slice(0, 6).map((story) => ({
    id: story.id,
    iso: isoFromTitle(story.title),
    label: story.title,
    link: story.link,
  }))];

  if (entries.length === 0) {
    return null;
  }

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
        Stories and headlines open on FIFA.com in a new tab.
      </p>
    </section>
  );
}

// FIFA's live stories rail, collected manually from the public homepage
// (labels + public share links only; videos stay on FIFA.com).
const featuredStories = [
  { id: "0906e472-7992-9b54-3b4e-3a21aae21752", iso: "fr", label: "FRA 2-0 MAR", link: "https://www.fifa.com/#stories/0906e472-7992-9b54-3b4e-3a21aae21752" },
  { id: "2c9734df-dd04-1e8d-3e77-3a21aae33663", iso: "es", label: "ESP V BEL", link: "https://www.fifa.com/#stories/2c9734df-dd04-1e8d-3e77-3a21aae33663" },
  { id: "ec38ff45-56a1-476a-724c-3a224faf7844", iso: undefined, label: "Slow Mo Moments 📹", link: "https://www.fifa.com/#stories/ec38ff45-56a1-476a-724c-3a224faf7844" },
  { id: "c2cda492-c646-ecee-60d6-3a21a430f5cc", iso: "ar", label: "Lionel Messi", link: "https://www.fifa.com/#stories/c2cda492-c646-ecee-60d6-3a21a430f5cc" },
  { id: "eae8a4b7-823e-b395-b03c-3a21a4317e8a", iso: "gb-eng", label: "Harry Kane", link: "https://www.fifa.com/#stories/eae8a4b7-823e-b395-b03c-3a21a4317e8a" },
  { id: "f7ce7bc8-0f75-b8cd-e045-3a21a4ca99ee", iso: "gb-eng", label: "England Goals", link: "https://www.fifa.com/#stories/f7ce7bc8-0f75-b8cd-e045-3a21a4ca99ee" },
  { id: "37c02e44-68dd-604e-fc30-3a21a4c80e4a", iso: "fr", label: "France Goals", link: "https://www.fifa.com/#stories/37c02e44-68dd-604e-fc30-3a21a4c80e4a" },
  { id: "aeeafd8e-c3c8-d2be-f05f-3a21a430506e", iso: "fr", label: "Kylian Mbappe", link: "https://www.fifa.com/#stories/aeeafd8e-c3c8-d2be-f05f-3a21a430506e" },
  { id: "bab55574-885b-d609-4abc-3a21a4c8c2ba", iso: "no", label: "Norway Goals", link: "https://www.fifa.com/#stories/bab55574-885b-d609-4abc-3a21a4c8c2ba" },
  { id: "aea9d88d-44db-170b-73e3-3a21a430b3cb", iso: "no", label: "Erling Haaland", link: "https://www.fifa.com/#stories/aea9d88d-44db-170b-73e3-3a21a430b3cb" },
  { id: "9c4d06d6-7cbf-7c4f-bbfc-3a21a4c6abb1", iso: "be", label: "Belgium Goals", link: "https://www.fifa.com/#stories/9c4d06d6-7cbf-7c4f-bbfc-3a21a4c6abb1" },
  { id: "7f2bdffa-c30d-c859-e3e9-3a21a4c67150", iso: "es", label: "Spain Goals", link: "https://www.fifa.com/#stories/7f2bdffa-c30d-c859-e3e9-3a21a4c67150" },
  { id: "5e7330f6-1369-c4bc-60e0-3a21a4c32f9f", iso: "ma", label: "Morocco Goals", link: "https://www.fifa.com/#stories/5e7330f6-1369-c4bc-60e0-3a21a4c32f9f" },
  { id: "8a670d52-2106-1c20-cc7d-3a224faf32e7", iso: "ch", label: "Switzerland Goals", link: "https://www.fifa.com/#stories/8a670d52-2106-1c20-cc7d-3a224faf32e7" },
  { id: "bc8aefc4-f07e-fb73-3305-3a224faeebee", iso: "ar", label: "Argentina Goals", link: "https://www.fifa.com/#stories/bc8aefc4-f07e-fb73-3305-3a224faeebee" },
  { id: "5824cf1b-91d8-9420-2003-3a21aae44947", iso: "no", label: "NOR V ENG", link: "https://www.fifa.com/#stories/5824cf1b-91d8-9420-2003-3a21aae44947" },
  { id: "93bf098e-c514-18c4-c559-3a21aae561c0", iso: "ar", label: "ARG V SUI", link: "https://www.fifa.com/#stories/93bf098e-c514-18c4-c559-3a21aae561c0" },
  { id: "2db29989-cb30-296c-96cb-3a21aae0fe41", iso: "ch", label: "SUI (4-3p) COL", link: "https://www.fifa.com/#stories/2db29989-cb30-296c-96cb-3a21aae0fe41" },
  { id: "31bb83b9-4205-70dc-efa5-3a21aadfe506", iso: "ar", label: "ARG 3-2 EGY", link: "https://www.fifa.com/#stories/31bb83b9-4205-70dc-efa5-3a21aadfe506" },
  { id: "be47be8a-0604-002a-13a9-3a21aade7652", iso: "us", label: "USA 1-4 BEL", link: "https://www.fifa.com/#stories/be47be8a-0604-002a-13a9-3a21aade7652" },
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
