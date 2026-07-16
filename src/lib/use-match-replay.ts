"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TxlineUpdateData } from "./match-shared";
import {
  loadReplayOdds,
  loadReplayRecords,
  type ReplayOddsPoint,
} from "./replay-pack";
import { normalizeScoreSnapshot, readNumber, withoutRaw } from "./txline-normalize";

// Plays a committed replay pack back through the live pipeline.
//
// The records are the raw TxLINE score feed, so this hook does exactly what the
// SSE handler does — normalize, mark statsKnown, append — only paced by a
// virtual clock instead of the network. Everything downstream (goals, cards,
// the match clock, momentum, settlement) is the live code path, untouched.

export type ReplayStatus = "error" | "idle" | "loading" | "ready";

export type MatchReplay = {
  // Milliseconds of match time since kickoff.
  atMs: number;
  durationMs: number;
  finished: boolean;
  oddsPct: number[] | null;
  pause: () => void;
  play: () => void;
  playing: boolean;
  restart: () => void;
  seek: (atMs: number) => void;
  setSpeed: (speed: number) => void;
  speed: number;
  status: ReplayStatus;
  updates: TxlineUpdateData[];
};

type TimelineEntry = {
  ts: number;
  update: TxlineUpdateData;
};

export const REPLAY_SPEEDS = [1, 15, 30, 60, 120] as const;
// A match is ~2 hours of records including the break, so 60x lands it at about
// two minutes — long enough to read, short enough for a demo.
const DEFAULT_SPEED = 60;
// 10fps: fast enough for a smooth clock, slow enough that the match page (which
// re-folds ~1000 records per pass) is not re-rendering on every frame.
const TICK_MS = 100;
// Scout match phase 2 is "first half"; the records before it are warmup.
const FIRST_HALF_STATUS = 2;

function buildTimeline(records: unknown[]): TimelineEntry[] {
  return records
    .map((record) => {
      const raw = record as Record<string, unknown>;
      const normalized = withoutRaw(normalizeScoreSnapshot(record));
      const stats = raw.Stats;
      // Filler records (throw-ins, possession phases) carry an empty Stats
      // object and must inherit the last real score, or the board flickers
      // back to 0-0 between goals.
      const statsKnown = Boolean(
        stats && typeof stats === "object" && Object.keys(stats).length > 0,
      );
      const ts = readNumber(raw, "Ts") ?? 0;

      return {
        ts,
        update: {
          ...normalized,
          id: `replay-${normalized.seq ?? ts}`,
          statsKnown,
        },
      };
    })
    .sort((left, right) => left.ts - right.ts || (left.update.seq ?? 0) - (right.update.seq ?? 0));
}

function findKickoffTs(timeline: TimelineEntry[]): number {
  const kicked = timeline.find((entry) => entry.update.statusId === FIRST_HALF_STATUS);

  return kicked?.ts ?? timeline[0]?.ts ?? 0;
}

// Timeline is sorted by ts, so the emitted prefix is a binary search away.
// Strictly-before, so that at 0' the kickoff record itself is still pending and
// the page shows a pre-match state the viewer can make picks against.
function cursorFor(timeline: TimelineEntry[], limitTs: number): number {
  let low = 0;
  let high = timeline.length;

  while (low < high) {
    const mid = (low + high) >>> 1;

    if (timeline[mid].ts < limitTs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

export function useMatchReplay(fixtureId: number, enabled: boolean): MatchReplay {
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [odds, setOdds] = useState<ReplayOddsPoint[]>([]);
  const [kickoffTs, setKickoffTs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [atMs, setAtMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);

  useEffect(() => {
    if (!enabled || !Number.isFinite(fixtureId)) {
      return;
    }

    let cancelled = false;

    async function load() {
      setStatus("loading");
      setPlaying(false);
      setAtMs(0);

      const [records, oddsPoints] = await Promise.all([
        loadReplayRecords(fixtureId),
        loadReplayOdds(fixtureId),
      ]);

      if (cancelled) {
        return;
      }

      if (!records?.length) {
        setStatus("error");

        return;
      }

      const built = buildTimeline(records);
      const kickoff = findKickoffTs(built);

      setTimeline(built);
      setOdds(oddsPoints);
      setKickoffTs(kickoff);
      // +1ms so the final record falls strictly before the end of the clock and
      // full time actually lands (see cursorFor).
      setDurationMs(Math.max(0, (built.at(-1)?.ts ?? kickoff) - kickoff) + 1);
      setStatus("ready");
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [enabled, fixtureId]);

  const finished = status === "ready" && durationMs > 0 && atMs >= durationMs;
  // The clock stops at full time by simply not running, rather than by an
  // effect flipping `playing` back off once it notices.
  const running = playing && !finished && status === "ready";

  useEffect(() => {
    if (!running) {
      return;
    }

    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;

      last = now;
      setAtMs((previous) => Math.min(previous + elapsed * speed, durationMs));
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [durationMs, running, speed]);

  // Everything up to kickoff (lineups, venue, warmup) is emitted from the
  // start, so the page shows a set-up match at 0' rather than an empty one.
  const cursor = useMemo(
    () => cursorFor(timeline, kickoffTs + atMs),
    [atMs, kickoffTs, timeline],
  );
  const updates = useMemo(
    () => timeline.slice(0, cursor).map((entry) => entry.update),
    [cursor, timeline],
  );
  const oddsPct = useMemo(() => {
    if (odds.length === 0) {
      return null;
    }

    const limit = kickoffTs + atMs;
    let latest: ReplayOddsPoint | null = null;

    for (const point of odds) {
      if (point.Ts > limit) {
        break;
      }

      latest = point;
    }

    return latest?.Pct ?? null;
  }, [atMs, kickoffTs, odds]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const restart = useCallback(() => {
    setAtMs(0);
    setPlaying(true);
  }, []);
  const seek = useCallback(
    (next: number) => setAtMs(Math.min(Math.max(next, 0), durationMs)),
    [durationMs],
  );

  return {
    atMs,
    durationMs,
    finished,
    oddsPct,
    pause,
    play,
    playing: running,
    restart,
    seek,
    setSpeed,
    speed,
    status,
    updates,
  };
}
