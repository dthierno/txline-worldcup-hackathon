"use client";

// Demo harness for the live goal-calls feature: simulates scout raises and
// resolutions on a fast clock so the flow can be tested without a live match.

import { useEffect, useState } from "react";

import { GoalCallsSection } from "@/components/match-page";
import { Button } from "@/components/ui/button";
import type { GoalCallEvent } from "@/lib/txline-normalize";

const DEMO_FIXTURE = {
  awayTeam: "Morocco",
  fixtureGroup: "Demo",
  fixtureId: 999999,
  homeTeam: "France",
  kickoffUtc: "2026-07-10T00:00:00.000Z",
  stage: "Demo",
};

const ROUNDS = 8;
const ANSWER_WINDOW_MS = 6000;
const PAUSE_BETWEEN_MS = 3000;

export default function GoalCallsDemo() {
  const [runId, setRunId] = useState(0);
  const [calls, setCalls] = useState<GoalCallEvent[]>([]);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function playRound(n: number) {
      if (cancelled || n >= ROUNDS) {
        return;
      }

      setRound(n + 1);

      const key = `demo-${runId}-${n}`;

      setCalls((previous) => [
        ...previous,
        {
          clockSeconds: 420 * (n + 1),
          key,
          participant: n % 2 === 0 ? 1 : 2,
          resolved: false,
          seq: n + 1,
          stood: false,
        },
      ]);

      timers.push(
        setTimeout(() => {
          if (cancelled) {
            return;
          }

          const stood = Math.random() < 0.4;

          setCalls((previous) =>
            previous.map((call) =>
              call.key === key ? { ...call, resolved: true, stood } : call,
            ),
          );
          timers.push(setTimeout(() => playRound(n + 1), PAUSE_BETWEEN_MS));
        }, ANSWER_WINDOW_MS),
      );
    }

    playRound(0);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [runId]);

  function reset() {
    try {
      const raw = window.localStorage.getItem("fan-forecast.goalcalls.v1");
      const parsed = raw ? JSON.parse(raw) : {};

      delete parsed[String(DEMO_FIXTURE.fixtureId)];
      window.localStorage.setItem(
        "fan-forecast.goalcalls.v1",
        JSON.stringify(parsed),
      );
    } catch {
      // best effort
    }

    setCalls([]);
    setRound(0);
    setRunId((id) => id + 1);
  }

  return (
    <main>
      <h1>Goal calls demo</h1>
      <p className="muted">
        Simulated match: a new &quot;possible goal&quot; moment every ~9s. You
        have {ANSWER_WINDOW_MS / 1000}s to answer before it resolves (40%
        chance it stands). Round {Math.min(round, ROUNDS)}/{ROUNDS}. Not real
        TxLINE data — for testing the flow only.
      </p>
      <Button onClick={reset} variant="outline">
        Reset demo
      </Button>
      <GoalCallsSection
        key={runId}
        calls={calls}
        fixture={DEMO_FIXTURE}
        live
      />
    </main>
  );
}
