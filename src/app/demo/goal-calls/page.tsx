"use client";

// Static design showcase for the live-calls panel: one example call in every
// state (open, open-and-picked, won, lost, skipped, void) with seeded
// answers, so the card can be inspected without a live match.

import { useEffect, useState } from "react";

import { LiveCallsPanel, type LiveUiCall } from "@/components/match-page-v2";
import { saveGoalCall } from "@/lib/prediction-store";

const DEMO_FIXTURE_ID = 999999;

const DEMO_CALLS: LiveUiCall[] = [
  {
    correctIndex: 0,
    key: "static-won",
    minute: "23'",
    options: ["Goal", "No goal"],
    outcome: "⚽ Goal",
    question: "Close play for France - does it end in a goal?",
    resolved: true,
    seq: 1,
  },
  {
    correctIndex: 0,
    key: "static-lost",
    minute: "45'",
    options: ["Over 3.5", "Under 3.5"],
    outcome: "6 minutes added",
    question: "Added time (half 1): over or under 3.5 minutes?",
    resolved: true,
    seq: 2,
  },
  {
    correctIndex: 1,
    key: "static-skipped",
    minute: "58'",
    options: ["France", "Morocco"],
    outcome: "Morocco",
    question: "Who wins the next corner?",
    resolved: true,
    seq: 3,
  },
  {
    key: "static-void",
    minute: "90'",
    options: ["France", "Morocco"],
    outcome: "No more goals",
    question: "Who scores the next goal?",
    resolved: true,
    seq: 4,
    voided: true,
  },
  {
    key: "static-open-picked",
    minute: "74'",
    options: ["France", "Morocco"],
    outcome: "Open",
    question: "Who wins the next corner?",
    resolved: false,
    seq: 5,
  },
  {
    key: "static-open",
    minute: "76'",
    options: ["Goal", "No goal"],
    outcome: "Open",
    question: "Close play for Morocco - does it end in a goal?",
    resolved: false,
    seq: 6,
  },
];

export default function GoalCallsDemo() {
  const [ready, setReady] = useState(false);

  // Reset the demo fixture to exactly the seeded answers before the panel
  // first renders, so the won, lost and picked states show without any
  // interaction - and the open call's prompt reappears on every reload even
  // after it was answered on a previous visit.
  useEffect(() => {
    try {
      const key = "fan-forecast.goalcalls.v1";
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");

      delete parsed[String(DEMO_FIXTURE_ID)];
      window.localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // best effort
    }

    const answeredAt = new Date().toISOString();

    saveGoalCall(DEMO_FIXTURE_ID, "static-won", { answer: "0", answeredAt });
    saveGoalCall(DEMO_FIXTURE_ID, "static-lost", { answer: "1", answeredAt });
    saveGoalCall(DEMO_FIXTURE_ID, "static-open-picked", {
      answer: "0",
      answeredAt,
    });

    const timer = setTimeout(() => setReady(true), 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main>
      <h1>Live calls - static states</h1>
      <p className="muted">
        Every state of the live-calls card on one screen: an open call (its
        prompt stays open here - the timer is frozen for design review), an
        open call already answered, a won call, a lost one, a skipped one, and
        a void. Example data, not TxLINE.
      </p>
      {ready ? (
        <LiveCallsPanel
          calls={DEMO_CALLS}
          fixtureId={DEMO_FIXTURE_ID}
          freezePrompt
          live
        />
      ) : null}
    </main>
  );
}
