import { render, screen } from "@testing-library/react";

import { PredictionSection } from "@/components/match-page-v2";
import type { MatchOutcome } from "@/lib/prediction-engine";
import { savePrediction } from "@/lib/prediction-store";
import type { WorldCupFixture } from "@/lib/world-cup-fixtures";

const fixture: WorldCupFixture = {
  awayTeam: "England",
  fixtureGroup: "World Cup > Semi-finals",
  fixtureId: 99999001,
  homeTeam: "France",
  kickoffUtc: "2026-07-18T17:00:00.000Z",
  stage: "Semi-finals",
};

function seedSavedSlip() {
  savePrediction({
    awayGoals: 2,
    fixtureId: fixture.fixtureId,
    homeGoals: 1,
    savedAt: "2026-07-18T16:43:00.000Z",
    totalCards: "under",
    totalCorners: "under",
    totalGoals: "over",
    winner: "away",
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("PredictionSection is one ticket from kickoff to full time", () => {
  it("renders a locked, in-play slip as the stamped ticket, not the flat list", async () => {
    seedSavedSlip();
    const inPlay: MatchOutcome = {
      awayGoals: 0,
      finished: false,
      homeGoals: 0,
      totalCards: 0,
      totalCorners: 0,
    };

    const { container } = render(
      <PredictionSection
        calls={[]}
        fixture={fixture}
        now={Date.parse("2026-07-18T18:00:00.000Z")}
        outcome={inPlay}
        scorerPool={null}
      />,
    );

    // Regression guard: this state used to render the plain `.mp2-slip` list.
    expect(await screen.findByText("Points so far")).toBeInTheDocument();
    expect(container.querySelector(".mp2-ticket-card")).not.toBeNull();
    expect(container.querySelector(".mp2-slip")).toBeNull();
  });

  it("still renders the finished slip as the stamped ticket with the win total", async () => {
    seedSavedSlip();
    const finished: MatchOutcome = {
      awayGoals: 2,
      finished: true,
      homeGoals: 1,
      totalCards: 0,
      totalCorners: 0,
    };

    const { container } = render(
      <PredictionSection
        calls={[]}
        fixture={fixture}
        now={Date.parse("2026-07-18T20:00:00.000Z")}
        outcome={finished}
        scorerPool={null}
      />,
    );

    expect(await screen.findByText("Points won")).toBeInTheDocument();
    expect(container.querySelector(".mp2-ticket-card")).not.toBeNull();
    expect(container.querySelector(".mp2-slip")).toBeNull();
  });
});
