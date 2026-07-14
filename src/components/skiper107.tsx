"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";

import { teamFlag } from "@/lib/team-visuals";
import { cn } from "@/lib/utils";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";
import { worldCupResults } from "@/lib/world-cup-results";

export type Team = { name: string; code: string };
export type MatchSide = { team: Team | null; score: string | null };
export type Match = {
  id: string;
  date: string;
  fixtureId?: number;
  kickoffUtc?: string;
  liveMinute?: number;
  status: "finished" | "live" | "upcoming";
  home: MatchSide;
  away: MatchSide;
  winner?: "home" | "away";
  penalties?: boolean;
};
export type Round = { name: string; matches: Match[] };
export type BracketScore = {
  awayGoals: number;
  clockSeconds?: number;
  homeGoals: number;
  statusId?: number;
};

const CARD_W = 250;
const CARD_H = 124;
const GAP_X = 40;
const GAP_Y = 32;
const PITCH = CARD_H + GAP_Y;
const VISIBLE_COLS = 3;
const TRANSITION = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };

const side = (name: string, code: string, score: string | null): MatchSide => ({
  team: { name, code },
  score,
});
const tbd = (): MatchSide => ({ team: null, score: null });
const match = (
  id: string,
  date: string,
  home: MatchSide,
  away: MatchSide,
  winner?: "home" | "away",
  penalties = false,
  fixtureId?: number,
): Match => ({
  id,
  date,
  home,
  away,
  winner,
  penalties,
  fixtureId,
  status: winner ? "finished" : "upcoming",
});

export const ROUNDS: Round[] = [
  {
    name: "Round of 32",
    matches: [
      match("r32-1", "Mon, 29 Jun", side("South Africa", "za", "0"), side("Canada", "ca", "1"), "away", false, 18167317),
      match("r32-2", "Tue, 30 Jun", side("Netherlands", "nl", "1 (2)"), side("Morocco", "ma", "1 (3)"), "away", true, 18172280),
      match("r32-3", "Tue, 30 Jun", side("Germany", "de", "1 (3)"), side("Paraguay", "py", "1 (4)"), "away", true, 18175983),
      match("r32-4", "Wed, 1 Jul", side("France", "fr", "3"), side("Sweden", "se", "0"), "home", false, 18175981),
      match("r32-5", "Thu, 2 Jul", side("Belgium", "be", "3"), side("Senegal", "sn", "2"), "home", false, 18179550),
      match("r32-6", "Thu, 2 Jul", side("USA", "us", "2"), side("Bosnia and Herzegovina", "ba", "0"), "home", false, 18172379),
      match("r32-7", "Fri, 3 Jul", side("Spain", "es", "3"), side("Austria", "at", "0"), "home", false, 18179551),
      match("r32-8", "Fri, 3 Jul", side("Portugal", "pt", "2"), side("Croatia", "hr", "1"), "home", false, 18179763),
      match("r32-9", "Mon, 29 Jun", side("Brazil", "br", "2"), side("Japan", "jp", "1"), "home", false, 18172469),
      match("r32-10", "Tue, 30 Jun", side("Côte d'Ivoire", "ci", "1"), side("Norway", "no", "2"), "away", false, 18175397),
      match("r32-11", "Wed, 1 Jul", side("Mexico", "mx", "2"), side("Ecuador", "ec", "0"), "home", false, 18179759),
      match("r32-12", "Wed, 1 Jul", side("England", "gb-eng", "2"), side("DR Congo", "cd", "1"), "home", false, 18179764),
      match("r32-13", "Fri, 3 Jul", side("Switzerland", "ch", "2"), side("Algeria", "dz", "0"), "home", false, 18179552),
      match("r32-14", "Sat, 4 Jul", side("Colombia", "co", "1"), side("Ghana", "gh", "0"), "home", false, 18179549),
      match("r32-15", "Fri, 3 Jul", side("Australia", "au", "1 (2)"), side("Egypt", "eg", "1 (4)"), "away", true, 18176123),
      match("r32-16", "Sat, 4 Jul", side("Argentina", "ar", "3"), side("Cabo Verde", "cv", "2"), "home", false, 18175918),
    ],
  },
  {
    name: "Round of 16",
    matches: [
      match("r16-1", "Sat, 4 Jul", side("Canada", "ca", "0"), side("Morocco", "ma", "3"), "away", false, 18185036),
      match("r16-2", "Sun, 5 Jul", side("Paraguay", "py", "0"), side("France", "fr", "1"), "away", false, 18188721),
      match("r16-3", "Mon, 6 Jul", side("USA", "us", "1"), side("Belgium", "be", "4"), "away", false, 18193785),
      match("r16-4", "Mon, 6 Jul", side("Portugal", "pt", "0"), side("Spain", "es", "1"), "away", false, 18198205),
      match("r16-5", "Mon, 6 Jul", side("Brazil", "br", "1"), side("Norway", "no", "2"), "away", false, 18187298),
      match("r16-6", "Mon, 6 Jul", side("Mexico", "mx", "2"), side("England", "gb-eng", "3"), "away", false, 18192996),
      match("r16-7", "Tue, 7 Jul", side("Switzerland", "ch", "0 (4)"), side("Colombia", "co", "0 (3)"), "home", true, 18202783),
      match("r16-8", "Tue, 7 Jul", side("Argentina", "ar", "3"), side("Egypt", "eg", "2"), "home", false, 18202701),
    ],
  },
  {
    name: "Quarter-finals",
    matches: [
      match("qf-1", "Fri, 10 Jul, 4:00 am", side("France", "fr", "2"), side("Morocco", "ma", "0"), "home", false, 18209181),
      match("qf-2", "Sat, 11 Jul, 3:00 am", side("Spain", "es", "2"), side("Belgium", "be", "1"), "home", false, 18218149),
      match("qf-3", "Sun, 12 Jul, 5:00 am", side("Norway", "no", null), side("England", "gb-eng", null), undefined, false, 18213979),
      match("qf-4", "Sun, 12 Jul, 10:00 am", side("Argentina", "ar", null), side("Switzerland", "ch", null), undefined, false, 18222446),
    ],
  },
  {
    name: "Semi-finals",
    matches: [
      match("sf-1", "Wed, 15 Jul, 4:00 am", side("France", "fr", null), side("Spain", "es", null), undefined, false, 18237038),
      match("sf-2", "Thu, 16 Jul, 3:00 am", tbd(), tbd()),
    ],
  },
  {
    name: "Final",
    matches: [match("f-1", "Mon, 20 Jul, 3:00 am", tbd(), tbd())],
  },
];

const IN_PLAY_STATUS_IDS = new Set([2, 3, 4, 6, 7, 8, 9]);

function isEnded(statusId?: number) {
  return statusId !== undefined && (statusId === 5 || statusId >= 10);
}

function team(name: string): Team {
  return { code: teamFlag(name) ?? "un", name };
}

function formatBracketDate(kickoffUtc: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    weekday: "short",
  }).format(new Date(kickoffUtc));
}

function roundForFixture(fixture: WorldCupFixture): string | null {
  const stage = `${fixture.fixtureGroup} ${fixture.stage}`.toLowerCase();

  if (stage.includes("8th final") || stage.includes("round of 16")) return "Round of 16";
  if (stage.includes("quarter")) return "Quarter-finals";
  if (stage.includes("semi")) return "Semi-finals";
  if (stage.includes("final") && !stage.includes("3rd") && !stage.includes("third")) return "Final";

  return null;
}

function sameTeams(game: Match, fixture: WorldCupFixture) {
  const names = [game.home.team?.name, game.away.team?.name]
    .filter(Boolean)
    .map((name) => name!.toLowerCase());

  return (
    names.length === 2 &&
    names.includes(fixture.homeTeam.toLowerCase()) &&
    names.includes(fixture.awayTeam.toLowerCase())
  );
}

function applyFixture(
  game: Match,
  fixture: WorldCupFixture,
  score: BracketScore | undefined,
  now: number,
) {
  game.fixtureId = fixture.fixtureId;
  game.kickoffUtc = fixture.kickoffUtc;
  game.date = formatBracketDate(fixture.kickoffUtc);
  game.home.team = team(fixture.homeTeam);
  game.away.team = team(fixture.awayTeam);

  if (score) {
    // TxLINE publishes a meaningless 0-0 snapshot before kickoff with no
    // StatusId; a missing StatusId only means "live" once the match has
    // actually started.
    const kickedOff = new Date(fixture.kickoffUtc).getTime() <= now;
    const inPlay =
      IN_PLAY_STATUS_IDS.has(score.statusId ?? -1) ||
      (score.statusId === undefined && kickedOff);

    if (isEnded(score.statusId)) {
      game.home.score = String(score.homeGoals);
      game.away.score = String(score.awayGoals);
      game.status = "finished";
      game.winner =
        score.homeGoals > score.awayGoals
          ? "home"
          : score.awayGoals > score.homeGoals
            ? "away"
            : game.winner;
    } else if (inPlay) {
      game.home.score = String(score.homeGoals);
      game.away.score = String(score.awayGoals);
      game.liveMinute = score.clockSeconds
        ? Math.max(1, Math.floor(score.clockSeconds / 60))
        : undefined;
      game.status = "live";
      game.winner = undefined;
    } else if (!kickedOff) {
      game.status = "upcoming";
      game.home.score = null;
      game.away.score = null;
      game.winner = undefined;
    }
  } else if (new Date(fixture.kickoffUtc).getTime() > now) {
    game.status = "upcoming";
    game.home.score = null;
    game.away.score = null;
    game.winner = undefined;
  }
}

function propagateWinners(rounds: Round[]) {
  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const current = rounds[roundIndex];
    const next = rounds[roundIndex + 1];

    current.matches.forEach((game, matchIndex) => {
      const winner = game.winner ? game[game.winner].team : null;

      if (!winner) return;

      const destination = next.matches[Math.floor(matchIndex / 2)];
      const destinationSide = matchIndex % 2 === 0 ? "home" : "away";

      if (destination && !destination[destinationSide].team) {
        destination[destinationSide].team = { ...winner };
      }
    });
  }
}

/**
 * Overlays the retained tournament tree with the same merged fixtures and
 * corrected score fold used elsewhere on the homepage. Historical TXLine
 * results keep completed rounds visible after the snapshot expires.
 */
export function buildLiveRounds(
  fixtures: WorldCupFixture[],
  scores: Record<number, BracketScore>,
  now = 0,
): Round[] {
  const rounds = ROUNDS.map((round) => ({
    ...round,
    matches: round.matches.map((game) => ({
      ...game,
      away: { ...game.away, team: game.away.team ? { ...game.away.team } : null },
      home: { ...game.home, team: game.home.team ? { ...game.home.team } : null },
    })),
  }));
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

  for (const result of worldCupResults) {
    const game = rounds.flatMap((round) => round.matches).find(
      (candidate) => candidate.fixtureId === result.fixtureId,
    );

    if (!game) continue;

    const fixture = fixtureById.get(result.fixtureId) ?? {
      awayTeam: result.away,
      fixtureGroup: "World Cup",
      fixtureId: result.fixtureId,
      homeTeam: result.home,
      kickoffUtc: result.kickoffUtc,
      stage: "",
    };

    applyFixture(game, fixture, scores[result.fixtureId], now);

    const liveScore = scores[result.fixtureId];

    if (!liveScore || !IN_PLAY_STATUS_IDS.has(liveScore.statusId ?? -1)) {
      const finalScore = liveScore
        ? [liveScore.homeGoals, liveScore.awayGoals]
        : result.score;

      game.home.score = String(finalScore[0]);
      game.away.score = String(finalScore[1]);
      game.status = "finished";
      game.winner =
        finalScore[0] > finalScore[1]
          ? "home"
          : finalScore[1] > finalScore[0]
            ? "away"
            : game.winner;
    }
  }

  for (const game of rounds.flatMap((round) => round.matches)) {
    if (!game.fixtureId) continue;

    const fixture = fixtureById.get(game.fixtureId);

    if (fixture) applyFixture(game, fixture, scores[game.fixtureId], now);
  }

  propagateWinners(rounds);

  for (const fixture of fixtures) {
    if (rounds.some((round) => round.matches.some((game) => game.fixtureId === fixture.fixtureId))) {
      continue;
    }

    const exact = rounds
      .flatMap((round) => round.matches)
      .find((game) => !game.fixtureId && sameTeams(game, fixture));
    const targetRound = rounds.find((round) => round.name === roundForFixture(fixture));
    const open = targetRound?.matches.find((game) => !game.fixtureId);
    const target = exact ?? open;

    if (target) applyFixture(target, fixture, scores[fixture.fixtureId], now);
  }

  propagateWinners(rounds);

  return rounds;
}

/** Prefer a live round, then the earliest round that still has a match to
 * play. If the tournament is complete, leave the viewport on the final. */
export function currentRoundIndex(rounds: Round[]): number {
  const liveRound = rounds.findIndex((round) =>
    round.matches.some((game) => game.status === "live"),
  );

  if (liveRound >= 0) return liveRound;

  const unfinishedRound = rounds.findIndex((round) =>
    round.matches.some((game) => game.status !== "finished"),
  );

  return unfinishedRound >= 0 ? unfinishedRound : Math.max(0, rounds.length - 1);
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d={direction === "left" ? "m13 17-5-5 5-5m5 10-5-5 5-5" : "m6 7 5 5-5 5m5-10 5 5-5 5"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 fill-current text-muted-foreground/50" viewBox="0 0 24 24">
      <path d="M12 2 4 5v6c0 5.05 3.41 9.76 8 11 4.59-1.24 8-5.95 8-11V5l-8-3Z" />
    </svg>
  );
}

function TeamRow({ side, winner, finished }: { side: MatchSide; winner: boolean; finished: boolean }) {
  const muted = finished && !winner;
  return (
    <div className="flex items-center gap-3">
      {side.team ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`${side.team.name} flag`}
          className="bracket-flag h-5 w-7 rounded-[4px] object-cover"
          draggable={false}
          loading="lazy"
          src={`https://flagcdn.com/w80/${side.team.code}.png`}
        />
      ) : (
        <span className="flex h-5 w-7 items-center justify-center"><ShieldIcon /></span>
      )}
      <span className={cn("flex-1 truncate text-base font-medium", muted && "text-muted-foreground")}>
        {side.team?.name ?? "TBD"}
      </span>
      {side.score !== null ? (
        <span className={cn("text-base font-medium tabular-nums", muted && "text-muted-foreground")}>
          {side.score}
        </span>
      ) : null}
      <span className={cn("bracket-winner-marker border-y-4 border-r-[6px] border-y-transparent border-r-transparent", winner && "is-winner")} />
    </div>
  );
}

function MatchCard({ match: game, roundName }: { match: Match; roundName: string }) {
  const finished = game.status === "finished";
  const live = game.status === "live";
  const className = cn(
    "bracket-match-card block h-[124px] w-[250px] rounded-2xl p-4 text-foreground no-underline",
    live && "is-live",
  );
  const content = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm leading-5 text-muted-foreground">{game.date}</span>
        {finished || live ? (
          <span
            className={cn(
              "bracket-status rounded-full px-2.5 text-xs font-medium leading-5",
              live && "is-live",
            )}
          >
            {live
              ? game.liveMinute
                ? `${game.liveMinute}'`
                : "LIVE"
              : game.penalties
                ? "FT (P)"
                : "FT"}
          </span>
        ) : null}
      </div>
      <div className="space-y-2.5">
        <TeamRow side={game.home} winner={game.winner === "home"} finished={finished} />
        <TeamRow side={game.away} winner={game.winner === "away"} finished={finished} />
      </div>
    </>
  );

  if (game.fixtureId) {
    const home = game.home.team?.name ?? "TBD";
    const away = game.away.team?.name ?? "TBD";

    return (
      <Link
        aria-label={`Open ${roundName}: ${home} vs ${away}`}
        className={className}
        href={`/match/${game.fixtureId}`}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

function yFor(roundIndex: number, matchIndex: number, start: number) {
  if (roundIndex >= start) {
    const scale = 2 ** (roundIndex - start);
    return (scale * (matchIndex + 0.5) - 0.5) * PITCH;
  }
  const parent = Math.floor(matchIndex / 2 ** (start - roundIndex));
  return parent * PITCH;
}

export function KnockoutBracket({
  rounds = ROUNDS,
  initialRound = 0,
  className,
  now,
}: {
  rounds?: Round[];
  initialRound?: number;
  className?: string;
  now?: number | null;
}) {
  const maxStart = Math.max(0, rounds.length - 2);
  const focusedStart = Math.min(Math.max(0, initialRound), maxStart);
  const [navigation, setNavigation] = useState({
    activeRound: initialRound,
    start: focusedStart,
  });
  // A new active stage supersedes the prior manual position. Ordinary score
  // updates retain the user's browsing position because initialRound is stable.
  const start =
    navigation.activeRound === initialRound
      ? Math.min(navigation.start, maxStart)
      : focusedStart;
  const height = rounds[start].matches.length * PITCH - GAP_Y;
  const cards = useMemo(
    () => rounds.flatMap((round, ri) => round.matches.map((game, mi) => ({ round, game, ri, mi }))),
    [rounds],
  );

  return (
    <div className={cn("bracket-shell w-full", className)}>
      <div className="bracket-viewport mx-auto w-full max-w-[850px]">
      <div className="relative mb-6 h-10 overflow-hidden">
        <button
          type="button"
          aria-label="Previous round"
          disabled={start === 0}
          onClick={() =>
            setNavigation({
              activeRound: initialRound,
              start: Math.max(0, start - 1),
            })
          }
          className="bracket-nav-button absolute left-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full text-foreground disabled:pointer-events-none"
        >
          <motion.span animate={{ opacity: start === 0 ? 0 : 1 }} transition={TRANSITION}>
            <ChevronIcon direction="left" />
          </motion.span>
        </button>
        <button
          type="button"
          aria-label="Next round"
          disabled={start === maxStart}
          onClick={() =>
            setNavigation({
              activeRound: initialRound,
              start: Math.min(maxStart, start + 1),
            })
          }
          className="bracket-nav-button absolute right-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full text-foreground disabled:pointer-events-none"
        >
          <motion.span animate={{ opacity: start === maxStart ? 0 : 1 }} transition={TRANSITION}>
            <ChevronIcon direction="right" />
          </motion.span>
        </button>
        {rounds.map((round, ri) => {
          const visible = ri >= start && ri < start + VISIBLE_COLS;
          return (
            <motion.div
              key={round.name}
              className="absolute top-0 flex h-10 w-[250px] items-center justify-center"
              animate={{ x: 20 + (ri - start) * (CARD_W + GAP_X), opacity: visible ? 1 : 0 }}
              transition={TRANSITION}
            >
              <span className="bracket-round-title text-base font-medium">{round.name}</span>
            </motion.div>
          );
        })}
      </div>

      <motion.div className="bracket-canvas relative overflow-hidden" animate={{ height }} transition={TRANSITION}>
        {rounds[start].matches.map((_, index) => (
          <motion.span
            key={`entry-${index}`}
            className="bracket-entry-line absolute left-0 top-0 h-px w-5"
            animate={{ y: index * PITCH + CARD_H / 2, opacity: 1 }}
            transition={TRANSITION}
          />
        ))}

        {rounds.slice(1).flatMap((round, offset) => {
          const ri = offset + 1;
          return round.matches.map((_, index) => {
            const prevRound = ri - 1;
            const x = 20 + (prevRound - start) * (CARD_W + GAP_X) + CARD_W;
            const y1 = yFor(prevRound, index * 2, start) + CARD_H / 2;
            const y2 = yFor(prevRound, index * 2 + 1, start) + CARD_H / 2;
            const visible = prevRound >= start && ri < start + VISIBLE_COLS;
            return (
              <motion.div
                key={`connector-${ri}-${index}`}
                className="bracket-connector absolute left-0 top-0 w-5 rounded-r-xl border-y border-r"
                animate={{ x, y: y1, height: Math.max(0, y2 - y1), opacity: visible ? 1 : 0 }}
                transition={TRANSITION}
              >
                <span className="bracket-connector-feed absolute left-full top-1/2 h-px w-5" />
              </motion.div>
            );
          });
        })}

        {cards.map(({ round, game, ri, mi }) => {
          const visible = ri >= start && ri < start + VISIBLE_COLS;
          return (
            <motion.div
              key={game.id}
              className="absolute left-0 top-0"
              animate={{
                x: 20 + (ri - start) * (CARD_W + GAP_X),
                y: yFor(ri, mi, start),
                opacity: visible ? 1 : 0,
              }}
              transition={TRANSITION}
            >
              <MatchCard match={game} roundName={round.name} />
            </motion.div>
          );
        })}
      </motion.div>

      <div className="bracket-footnote mt-10 pt-6">
        <p className="text-sm italic text-muted-foreground">
          All times are in UTC+8 · Current time:{" "}
          <time className="tabular-nums not-italic">
            {now === null || now === undefined
              ? "Syncing…"
              : new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "medium",
                }).format(new Date(now))}
          </time>
        </p>
      </div>
      </div>
    </div>
  );
}

export function Skiper107({
  fixtures = [],
  scores = {},
  now,
}: {
  fixtures?: WorldCupFixture[];
  scores?: Record<number, BracketScore>;
  now?: number | null;
}) {
  const liveRounds = useMemo(
    () => buildLiveRounds(fixtures, scores, now ?? 0),
    [fixtures, scores, now],
  );
  const activeRound = useMemo(() => currentRoundIndex(liveRounds), [liveRounds]);

  return <KnockoutBracket rounds={liveRounds} initialRound={activeRound} now={now} />;
}
