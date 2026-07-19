"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@/../convex/_generated/api";
import type { MatchPrediction } from "@/lib/prediction-engine";
import { useDisplayName } from "@/lib/use-display-name";
import {
  GAMESTATE_HYDRATED_EVENT,
  GOAL_CALLS_CHANGED_EVENT,
  PREDICTIONS_CHANGED_EVENT,
  SETTLEMENTS_CHANGED_EVENT,
  loadGoalCalls,
  loadPrediction,
  loadSettlements,
  mergeServerGameState,
  type ServerGameState,
  type StoredSettlement,
} from "@/lib/prediction-store";

// Mirrors the fan's device gameplay - predictions, settlements, live-call
// answers - to Convex so it follows them across devices. On sign-in it merges
// the server copy into this device and pushes anything local-only up; after
// that each local save is echoed to the server via the store's change events.
// Renders nothing. Signed out, it does nothing and the app stays device-local.
export function GameplaySync() {
  // Convex auth, NOT Clerk's useUser: isAuthenticated only flips true once the
  // browser has fetched the Clerk token AND Convex has validated it. Gating on
  // Clerk's isSignedIn races - myGameState would run before Convex trusts the
  // token, return empty, and the one-shot hydration would lock that in.
  const { isAuthenticated } = useConvexAuth();
  // The username recorded below comes from Clerk (via useDisplayName); the auth
  // gate is useConvexAuth above, not Clerk's useUser.
  const displayName = useDisplayName();
  const savePrediction = useMutation(api.gameplay.savePrediction);
  const saveSettlement = useMutation(api.gameplay.saveSettlement);
  const saveGoalCalls = useMutation(api.gameplay.saveGoalCalls);
  const recordUser = useMutation(api.users.recordUser);
  const gameState = useQuery(api.gameplay.myGameState, isAuthenticated ? {} : "skip");
  const hydrated = useRef(false);

  // One place to normalise a stored settlement into the mutation's args.
  function pushSettlement(settlement: StoredSettlement): void {
    void saveSettlement({
      botCallPoints: settlement.botCallPoints,
      finalScore: settlement.finalScore,
      fixtureId: settlement.fixtureId,
      totalPoints: settlement.totalPoints,
    });
  }

  // Hydrate once per signed-in session: pull the server's copy into this
  // device, push whatever was only here, then let views re-read.
  useEffect(() => {
    if (!isAuthenticated) {
      hydrated.current = false;

      return;
    }

    if (!gameState || hydrated.current) {
      return;
    }

    hydrated.current = true;

    const server: ServerGameState = {
      goalCalls: gameState.goalCalls,
      predictions: gameState.predictions.map((entry) => ({
        fixtureId: entry.fixtureId,
        prediction: entry.prediction as MatchPrediction,
      })),
      settlements: gameState.settlements as StoredSettlement[],
    };
    const { uploadGoalCalls, uploadPredictions, uploadSettlements } =
      mergeServerGameState(server);

    for (const prediction of uploadPredictions) {
      void savePrediction({ fixtureId: prediction.fixtureId, prediction });
    }

    for (const settlement of uploadSettlements) {
      pushSettlement(settlement);
    }

    for (const entry of uploadGoalCalls) {
      void saveGoalCalls({ answers: entry.answers, fixtureId: entry.fixtureId });
    }

    window.dispatchEvent(new Event(GAMESTATE_HYDRATED_EVENT));
    // pushSettlement is stable enough for this once-per-session effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isAuthenticated, savePrediction, saveSettlement, saveGoalCalls]);

  // Mirror each subsequent local save up to the server.
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const onPrediction = (event: Event) => {
      const fixtureId = (event as CustomEvent<number>).detail;
      const prediction = loadPrediction(fixtureId);

      if (prediction) {
        void savePrediction({ fixtureId, prediction });
      }
    };

    const onSettlement = (event: Event) => {
      const fixtureId = (event as CustomEvent<number>).detail;
      const settlement = loadSettlements()[String(fixtureId)];

      if (settlement) {
        pushSettlement(settlement);
      }
    };

    const onGoalCalls = (event: Event) => {
      const fixtureId = (event as CustomEvent<number>).detail;

      void saveGoalCalls({ answers: loadGoalCalls(fixtureId), fixtureId });
    };

    window.addEventListener(PREDICTIONS_CHANGED_EVENT, onPrediction);
    window.addEventListener(SETTLEMENTS_CHANGED_EVENT, onSettlement);
    window.addEventListener(GOAL_CALLS_CHANGED_EVENT, onGoalCalls);

    return () => {
      window.removeEventListener(PREDICTIONS_CHANGED_EVENT, onPrediction);
      window.removeEventListener(SETTLEMENTS_CHANGED_EVENT, onSettlement);
      window.removeEventListener(GOAL_CALLS_CHANGED_EVENT, onGoalCalls);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, savePrediction, saveSettlement, saveGoalCalls]);

  // Record the user (username) once authenticated, so the unique-user count is
  // visible in the Convex dashboard and the global board shows their handle.
  useEffect(() => {
    if (isAuthenticated) {
      void recordUser({ name: displayName });
    }
  }, [isAuthenticated, recordUser, displayName]);

  return null;
}
