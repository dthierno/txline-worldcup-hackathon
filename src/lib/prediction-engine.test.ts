import { demoEvents } from "./demo-data";
import {
  applyPredictionUpdate,
  calculateScoreBreakdown,
  defaultPrediction,
} from "./prediction-engine";

describe("prediction engine", () => {
  it("settles exact score, winner, goals, corners, cards, and first-goal picks", () => {
    const finalEvent = demoEvents.at(-1);

    expect(finalEvent).toBeDefined();
    expect(
      calculateScoreBreakdown(
        defaultPrediction,
        finalEvent!.snapshot,
        demoEvents,
      ),
    ).toEqual({
      exactScore: 8,
      winner: 3,
      totalGoals: 2,
      totalCards: 2,
      totalCorners: 2,
      nextGoal: 4,
      total: 21,
    });
  });

  it("does not award under or no-goal picks before kickoff", () => {
    expect(
      calculateScoreBreakdown(
        {
          ...defaultPrediction,
          winner: "draw",
          totalGoals: "under",
          totalCards: "under",
          totalCorners: "under",
          nextGoal: "none",
        },
        {
          awayScore: 0,
          awayWinProbability: 15,
          drawProbability: 42,
          homeScore: 0,
          homeWinProbability: 43,
          marketNote: "pre-match",
          minute: 0,
          status: "pre",
          statusLabel: "NS",
          totalCards: 0,
          totalCorners: 0,
        },
        [],
      ),
    ).toEqual({
      exactScore: 0,
      winner: 0,
      totalGoals: 0,
      totalCards: 0,
      totalCorners: 0,
      nextGoal: 0,
      total: 0,
    });
  });

  it("does not change a locked score prediction", () => {
    expect(
      applyPredictionUpdate(defaultPrediction, "homeScore", 5),
    ).toMatchObject({
      homeScore: 1,
      locked: true,
    });
  });

  it("clamps editable score predictions", () => {
    expect(
      applyPredictionUpdate(
        { ...defaultPrediction, locked: false },
        "homeScore",
        99,
      ),
    ).toMatchObject({
      homeScore: 12,
      locked: false,
    });
  });
});
