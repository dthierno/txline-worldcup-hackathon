"use client";

import { FootballIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { TxlineUpdateData } from "@/lib/match-shared";
import type { GoalEvent } from "@/lib/txline-normalize";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";

// Flashscore's match-momentum widget, rebuilt to its exact geometry from the
// rendered SVG (640x158 viewBox stretched to width, per-minute bars on a
// shared pitch with 1px-radius tips, dotted amplitude guides, one block per
// period) and to its measured palette (period #0f2d37, dots and connector
// lines #555e61, home bars #fff, away #777e81, captions #c8cdcd). Data is
// TxLINE's: pressure per minute from the possession/chance weights, goals and
// red cards as badges hanging off the timeline.

const WIDTH = 640;
const HEIGHT = 158;
// The bar group's translate(0, 24): baseline at 79, 55 of amplitude each way.
const BASELINE = 79;
const AMPLITUDE = 55;
const DOT_TOP = 25;
const DOT_BOTTOM = 133;
const PERIOD_GAP = 5;
// Play phases in timeline order; breaks and pre-match never own a bar. The
// scout clock is cumulative across the match, but every phase restart emits a
// few zero-second records before the clock lands, so each phase's minutes are
// clamped into its own window (start .. end + stoppage headroom).
const PHASES = [2, 4, 7, 9] as const;
const PHASE_WINDOW: Record<number, { end: number; start: number }> = {
  2: { end: 60, start: 0 },
  4: { end: 105, start: 45 },
  7: { end: 120, start: 90 },
  9: { end: 135, start: 105 },
};
// Same attack-pressure weights as extractMomentum, folded per phase-minute
// because the per-phase clock makes global minutes collide across halves.
const WEIGHTS: Record<string, number> = {
  attack_possession: 1,
  corner: 2,
  danger_possession: 2,
  high_danger_possession: 3,
  shot: 3,
};

type Slot = {
  minute: number;
  net: number;
  x: number;
};

type Period = {
  slots: Slot[];
  width: number;
  x: number;
};

type Incident = {
  kind: "goal" | "red";
  minute: number;
  side: "away" | "home";
};

type PlacedIncident = Incident & {
  center: number;
  tip: number;
};

function roundedBar(x: number, barWidth: number, height: number, up: boolean) {
  const tip = up ? BASELINE - height : BASELINE + height;
  const shoulder = up ? tip + 1 : tip - 1;
  const sweep = up ? 1 : 0;

  return [
    `M ${x} ${BASELINE}`,
    `L ${x} ${shoulder}`,
    `A 1 1 0 0 ${sweep} ${x + 1} ${tip}`,
    `L ${x + barWidth - 1} ${tip}`,
    `A 1 1 0 0 ${sweep} ${x + barWidth} ${shoulder}`,
    `L ${x + barWidth} ${BASELINE}`,
    "Z",
  ].join(" ");
}

export function FlashMomentum({
  awayIso,
  fixture,
  goals,
  homeIso,
  updates,
}: {
  awayIso: string | undefined;
  fixture: WorldCupFixture;
  goals: GoalEvent[];
  homeIso: string | undefined;
  updates: TxlineUpdateData[];
}) {
  // Minute range each play phase actually covered, from the records' own
  // StatusId; a phase with no records (no extra time) never gets a block.
  const ranges = new Map<number, { max: number; min: number }>();
  const netByKey = new Map<string, number>();
  const seenChances = new Set<string>();
  let participant1IsHome = true;

  for (const update of updates) {
    if (typeof update.participant1IsHome === "boolean") {
      participant1IsHome = update.participant1IsHome;
    }

    const phase = update.statusId;
    const clock = update.clockSeconds;

    if (
      !PHASES.includes(phase as (typeof PHASES)[number]) ||
      typeof clock !== "number" ||
      !Number.isFinite(clock)
    ) {
      continue;
    }

    const window = PHASE_WINDOW[phase as number];
    const minute = Math.min(
      Math.max(Math.floor(clock / 60), window.start),
      window.end,
    );
    const range = ranges.get(phase as number) ?? { max: minute, min: minute };

    range.max = Math.max(range.max, minute);
    range.min = Math.min(range.min, minute);
    ranges.set(phase as number, range);

    const weight = WEIGHTS[update.action ?? ""];
    const team = update.participant ?? update.possession;

    if (!weight || (team !== 1 && team !== 2)) {
      continue;
    }

    // Chances emit sibling records per event Id; count each event once.
    if (update.action === "shot" || update.action === "corner") {
      const chanceKey = `${update.action}-${update.eventId ?? `seq-${update.seq}`}`;

      if (seenChances.has(chanceKey)) {
        continue;
      }

      seenChances.add(chanceKey);
    }

    const isHome = participant1IsHome ? team === 1 : team === 2;
    const key = `${phase}:${minute}`;

    netByKey.set(key, (netByKey.get(key) ?? 0) + (isHome ? weight : -weight));
  }

  const phaseMinutes = PHASES.filter((phase) => ranges.has(phase)).map(
    (phase) => {
      const range = ranges.get(phase)!;

      return Array.from({ length: range.max - range.min + 1 }, (_, index) => ({
        cumulative: range.min + index,
        net: netByKey.get(`${phase}:${range.min + index}`) ?? 0,
      }));
    },
  );
  const totalMinutes = phaseMinutes.reduce((sum, list) => sum + list.length, 0);

  if (totalMinutes < 5) {
    return null;
  }

  // Their layout solved for the pitch: every period is minutes*pitch - 1 wide,
  // with 5px gaps, filling 640 exactly.
  const periodCount = phaseMinutes.length;
  const pitch =
    (WIDTH + periodCount - PERIOD_GAP * (periodCount - 1)) / totalMinutes;
  const barWidth = pitch - 1;
  const maxAbs = Math.max(
    1,
    ...phaseMinutes.flat().map((entry) => Math.abs(entry.net)),
  );

  const periods: Period[] = [];
  const slotByMinute = new Map<number, Slot>();
  let cursor = 0;

  for (const minutes of phaseMinutes) {
    const width = minutes.length * pitch - 1;
    const period: Period = { slots: [], width, x: cursor };

    minutes.forEach((entry, index) => {
      const slot: Slot = {
        minute: entry.cumulative,
        net: entry.net,
        x: cursor + index * pitch,
      };

      period.slots.push(slot);
      // Stoppage minutes overlap the next phase's opening (45+3 shares its
      // cumulative minute with H2's 48'); the first phase keeps the badge.
      if (!slotByMinute.has(entry.cumulative)) {
        slotByMinute.set(entry.cumulative, slot);
      }
    });
    periods.push(period);
    cursor += width + PERIOD_GAP;
  }

  const dots = (period: Period) => {
    const intervals = Math.max(1, Math.round((period.width - 2) / 5));
    const step = (period.width - 2) / intervals;

    return Array.from(
      { length: intervals + 1 },
      (_, index) => period.x + 1 + index * step,
    );
  };

  const barHeight = (value: number) =>
    Math.min(
      AMPLITUDE,
      Math.max(2, Math.round((AMPLITUDE * Math.abs(value)) / maxAbs)),
    );

  const incidents = ([
    ...goals.flatMap((goal): Incident[] =>
      typeof goal.clockSeconds === "number"
        ? [
            {
              kind: "goal",
              minute: Math.floor(goal.clockSeconds / 60),
              side: goal.scoringSide,
            },
          ]
        : [],
    ),
    ...(() => {
      const seen = new Set<string>();
      const reds: Incident[] = [];

      for (const update of updates) {
        if (
          update.action !== "red_card" ||
          (update.participant !== 1 && update.participant !== 2) ||
          typeof update.clockSeconds !== "number"
        ) {
          continue;
        }

        const key = String(update.eventId ?? `seq-${update.seq}`);

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        reds.push({
          kind: "red",
          minute: Math.floor(update.clockSeconds / 60),
          side:
            participant1IsHome === (update.participant === 1)
              ? "home"
              : "away",
        });
      }

      return reds;
    })(),
  ] as Incident[])
    .map((incident) => ({
      incident,
      slot: slotByMinute.get(incident.minute),
    }))
    .filter(
      (entry): entry is { incident: Incident; slot: Slot } =>
        entry.slot !== undefined,
    )
    .map(
      ({ incident, slot }): PlacedIncident => ({
        ...incident,
        center: slot.x + barWidth / 2,
        tip:
          incident.side === "home"
            ? BASELINE - barHeight(slot.net)
            : BASELINE + barHeight(slot.net),
      }),
    );

  const labelMinutes = [
    ...new Set(
      phaseMinutes
        .flat()
        .map((entry) => entry.cumulative)
        .filter((minute) => minute > 0 && minute % 15 === 0),
    ),
  ];
  const timeLabels = labelMinutes
    .filter((minute) => slotByMinute.has(minute))
    .map((minute) => ({
      center: slotByMinute.get(minute)!.x + barWidth / 2,
      minute,
    }));
  const shortName = (team: string) =>
    team.replaceAll(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();

  return (
    <section aria-label="Match momentum" className="card fsm-card">
      <div className="fsm">
        <div className="fsm-team fsm-team-home">
          {homeIso ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={`https://flagcdn.com/w40/${homeIso}.png`} />
          ) : null}
          <span>{shortName(fixture.homeTeam)}</span>
        </div>
        <div className="fsm-legend">
          <svg fill="currentColor" height="10" viewBox="0 0 20 20" width="10">
            <path d="M6 17H2V3H6V17ZM12 17H8V11H12V17ZM18 17H14V7H18V17Z" />
          </svg>
          <span>Match Momentum</span>
        </div>
        <div className="fsm-chart">
          <svg
            aria-label="Momentum chart visualization"
            height={HEIGHT}
            preserveAspectRatio="none"
            role="img"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
          >
            {periods.map((period) => (
              <g key={period.x}>
                <rect
                  className="fsm-period"
                  height={HEIGHT}
                  rx={2}
                  width={period.width}
                  x={period.x}
                  y={0}
                />
                {dots(period).map((cx) => (
                  <circle className="fsm-dot" cx={cx} cy={DOT_TOP} key={`t${cx}`} r={1} />
                ))}
                {dots(period).map((cx) => (
                  <circle className="fsm-dot" cx={cx} cy={DOT_BOTTOM} key={`b${cx}`} r={1} />
                ))}
                {period.slots.map((slot) => (
                  <g key={slot.minute}>
                    {slot.net !== 0 ? (
                      <path
                        className={
                          slot.net > 0 ? "fsm-bar" : "fsm-bar fsm-bar-away"
                        }
                        d={roundedBar(
                          slot.x,
                          barWidth,
                          barHeight(slot.net),
                          slot.net > 0,
                        )}
                      />
                    ) : null}
                    <rect
                      className="fsm-hit"
                      height={HEIGHT}
                      width={barWidth}
                      x={slot.x}
                      y={0}
                    >
                      <title>
                        {`${slot.minute}' — ${
                          slot.net === 0
                            ? "even"
                            : `${
                                slot.net > 0
                                  ? fixture.homeTeam
                                  : fixture.awayTeam
                              } pressure ${Math.abs(slot.net)}`
                        }`}
                      </title>
                    </rect>
                  </g>
                ))}
              </g>
            ))}
          </svg>
          {incidents.map((incident) => (
            <div key={`${incident.kind}-${incident.side}-${incident.minute}`}>
              <div
                className={`fsm-incident${incident.side === "away" ? " fsm-incident-away" : ""}`}
                style={{ left: `${(incident.center / WIDTH) * 100}%` }}
              >
                {incident.kind === "goal" ? (
                  <HugeiconsIcon
                    aria-label="Goal"
                    icon={FootballIcon}
                    size={12}
                    strokeWidth={2}
                  />
                ) : (
                  <span aria-label="Red card" className="fsm-redcard" />
                )}
              </div>
              <div
                className="fsm-incident-line"
                style={{
                  height:
                    incident.side === "home"
                      ? `${incident.tip - 16}px`
                      : `${142 - incident.tip}px`,
                  left: `${(incident.center / WIDTH) * 100}%`,
                  top:
                    incident.side === "home"
                      ? "16px"
                      : `${incident.tip}px`,
                }}
              />
            </div>
          ))}
          {timeLabels.map((label) => (
            <span
              className="fsm-time"
              key={label.minute}
              style={{ left: `${(label.center / WIDTH) * 100}%` }}
            >
              {label.minute}&apos;
            </span>
          ))}
        </div>
        <div className="fsm-team fsm-team-away">
          {awayIso ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={`https://flagcdn.com/w40/${awayIso}.png`} />
          ) : null}
          <span>{shortName(fixture.awayTeam)}</span>
        </div>
      </div>
    </section>
  );
}
