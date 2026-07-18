"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { teamFlag } from "@/lib/team-visuals";
import { worldCupResults } from "@/lib/world-cup-results";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";

// Tournament month calendar for the Matches tab (grid structure after
// Serena's scheduler, reskinned dark): every fixture is a flag chip on its
// day - finished with the score, upcoming with kickoff time, live pulsing.

type CalendarEntry = {
  away: string;
  fixtureId: number;
  home: string;
  kickoffUtc: string;
  live: boolean;
  score: [number, number] | null;
};

type CalendarCell = { day: number; inMonth: boolean; key: string };

const IN_PLAY_STATUS_IDS = new Set([2, 3, 4, 6, 7, 8, 9]);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS_PER_DAY = 3;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Monday-first month grid, trailing/leading days included as fillers.
function buildMonth(year: number, month: number): CalendarCell[][] {
  const first = new Date(year, month, 1);
  const cursor = new Date(first);

  cursor.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const rows: CalendarCell[][] = [];

  do {
    const week: CalendarCell[] = [];

    for (let index = 0; index < 7; index += 1) {
      week.push({
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        key: isoDate(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    rows.push(week);
  } while (cursor.getMonth() === month);

  return rows;
}

function kickoffTime(kickoffUtc: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(kickoffUtc));
}

function ChipFlag({ team }: { team: string }) {
  const iso = teamFlag(team);

  if (!iso) {
    return <span aria-hidden className="wc-cal-flag wc-cal-flag-tbd" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="wc-cal-flag"
      src={`https://flagcdn.com/w40/${iso}.png`}
    />
  );
}

// The 2026 tournament spans June and July.
export const CALENDAR_MONTHS: Array<{ label: string; month: number }> = [
  { label: "June", month: 5 },
  { label: "July", month: 6 },
];

export function MatchCalendar({
  fixtures,
  month,
  now,
  scores,
}: {
  fixtures: WorldCupFixture[];
  month: number;
  now: number | null;
  scores?: Record<
    number,
    { awayGoals: number; homeGoals: number; statusId?: number }
  >;
}) {
  // Verified results carry the finished half of the tournament; the live
  // fixture list layers today's and upcoming matches (with in-play scores)
  // on top.
  const byDay = useMemo(() => {
    const entries = new Map<number, CalendarEntry>();

    for (const result of worldCupResults) {
      entries.set(result.fixtureId, {
        away: result.away,
        fixtureId: result.fixtureId,
        home: result.home,
        kickoffUtc: result.kickoffUtc,
        live: false,
        score: [result.score[0], result.score[1]],
      });
    }

    for (const fixture of fixtures) {
      if (entries.has(fixture.fixtureId)) {
        continue;
      }

      const score = scores?.[fixture.fixtureId];
      const live = score ? IN_PLAY_STATUS_IDS.has(score.statusId ?? -1) : false;

      entries.set(fixture.fixtureId, {
        away: fixture.awayTeam,
        fixtureId: fixture.fixtureId,
        home: fixture.homeTeam,
        kickoffUtc: fixture.kickoffUtc,
        live,
        score: live && score ? [score.homeGoals, score.awayGoals] : null,
      });
    }

    const grouped = new Map<string, CalendarEntry[]>();

    for (const entry of [...entries.values()].sort((left, right) =>
      left.kickoffUtc.localeCompare(right.kickoffUtc),
    )) {
      const key = isoDate(new Date(entry.kickoffUtc));

      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }

    return grouped;
  }, [fixtures, scores]);

  const rows = useMemo(() => buildMonth(2026, month), [month]);
  const today = now !== null ? isoDate(new Date(now)) : null;
  // The day whose full fixture list is open in the dialog.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const openGames = openDay ? (byDay.get(openDay) ?? []) : [];
  const openTitle = openDay
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        weekday: "long",
      }).format(new Date(`${openDay}T00:00:00`))
    : "";

  return (
    <div className="wc-cal" aria-label="Tournament calendar">
      <div className="wc-cal-scroll">
        <div className="wc-cal-inner">
          <div aria-hidden className="wc-cal-weekdays">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div
            className="wc-cal-grid"
            style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}
          >
            {rows.flatMap((week) =>
              week.map((cell) => {
                if (!cell.inMonth) {
                  return <div className="wc-cal-empty" key={cell.key} />;
                }

                const games = byDay.get(cell.key) ?? [];
                const shown = games.slice(0, MAX_CHIPS_PER_DAY);
                const folded = games.length - shown.length;

                return (
                  <div className="wc-cal-day" key={cell.key}>
                    <span
                      className={`wc-cal-num${cell.key === today ? " wc-cal-today" : ""}`}
                    >
                      {cell.day}
                    </span>
                    {shown.map((game) => (
                      <Link
                        aria-label={`${game.home} vs ${game.away}`}
                        className={`wc-cal-chip${game.live ? " wc-cal-live" : ""}`}
                        href={`/match/${game.fixtureId}`}
                        key={game.fixtureId}
                        title={`${game.home} vs ${game.away}`}
                      >
                        <ChipFlag team={game.home} />
                        <b>
                          {game.score
                            ? `${game.score[0]}-${game.score[1]}`
                            : kickoffTime(game.kickoffUtc)}
                        </b>
                        <ChipFlag team={game.away} />
                      </Link>
                    ))}
                    {folded > 0 ? (
                      <button
                        className="wc-cal-more"
                        onClick={() => setOpenDay(cell.key)}
                        type="button"
                      >
                        +{folded} more
                      </button>
                    ) : null}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={openDay !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDay(null);
          }
        }}
      >
        <DialogContent className="lc-prompt wc-day-modal">
          <DialogTitle className="league-modal-title">{openTitle}</DialogTitle>
          <ul className="wc-day-list">
            {openGames.map((game) => (
              <li key={game.fixtureId}>
                <Link
                  className={`wc-day-row${game.live ? " wc-day-live" : ""}`}
                  href={`/match/${game.fixtureId}`}
                >
                  <span className="wc-day-team">
                    <ChipFlag team={game.home} />
                    <span>{game.home}</span>
                  </span>
                  <b className="wc-day-score">
                    {game.score
                      ? `${game.score[0]} - ${game.score[1]}`
                      : kickoffTime(game.kickoffUtc)}
                  </b>
                  <span className="wc-day-team wc-day-team-away">
                    <span>{game.away}</span>
                    <ChipFlag team={game.away} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
