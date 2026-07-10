"use client";

// Demo harness for the live goal-calls feature: simulates scout raises and
// resolutions on a fast clock so the flow can be tested without a live match.

import { useEffect, useState } from "react";

import { GoalCallsSection, type LiveUiCall } from "@/components/match-page";
import { Button } from "@/components/ui/button";


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

function clearDemoAnswers() {
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
}

export default function GoalCallsDemo() {
  const [runId, setRunId] = useState(0);
  const [calls, setCalls] = useState<LiveUiCall[]>([]);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // First mount: pick a random run id so call keys never collide with a
    // previous visit's stored answers (which would auto-apply and suppress
    // the popups). Also clears old demo answers as housekeeping.
    if (runId === 0) {
      clearDemoAnswers();
      timers.push(
        setTimeout(() => setRunId(1 + Math.floor(Math.random() * 1e9)), 0),
      );

      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    function playRound(n: number) {
      if (cancelled || n >= ROUNDS) {
        return;
      }

      setRound(n + 1);

      const key = `demo-${runId}-${n}`;
      const kinds: Array<Pick<LiveUiCall, "options" | "question">> = [
        {
          options: ["Goal", "No goal"],
          question: `Close play for ${n % 2 === 0 ? "France" : "Morocco"} - does it end in a goal?`,
        },
        { options: ["France", "Morocco"], question: "Who wins the next corner?" },
        {
          options: ["Over 3.5", "Under 3.5"],
          question: "Added time (half 1): over or under 3.5 minutes?",
        },
      ];
      const kind = kinds[n % kinds.length];

      // StrictMode re-runs effects in dev; never raise the same key twice.
      setCalls((previous) =>
        previous.some((call) => call.key === key)
          ? previous
          : [
        ...previous,
        {
          key,
          minute: `${7 * (n + 1)}'`,
          options: kind.options as [string, string],
          outcome: "Open",
          question: kind.question,
          resolved: false,
          seq: n + 1,
        },
      ],
      );

      timers.push(
        setTimeout(() => {
          if (cancelled) {
            return;
          }

          const correctIndex = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;

          setCalls((previous) =>
            previous.map((call) =>
              call.key === key
                ? {
                    ...call,
                    correctIndex,
                    outcome: call.options[correctIndex],
                    resolved: true,
                  }
                : call,
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
    clearDemoAnswers();
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
        fixtureId={DEMO_FIXTURE.fixtureId}
        live
      />
    </main>
  );
}
