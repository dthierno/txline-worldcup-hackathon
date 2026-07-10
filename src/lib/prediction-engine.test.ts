import {
  clampGoals,
  outcomeWinner,
  settleLinePick,
  settlePrediction,
  type MatchOutcome,
  type MatchPrediction,
} from "./prediction-engine";

const teams = { awayTeam: "Morocco", homeTeam: "Canada" };

function makePrediction(overrides: Partial<MatchPrediction> = {}): MatchPrediction {
  return {
    awayGoals: 3,
    fixtureId: 18185036,
    homeGoals: 0,
    savedAt: "2026-07-04T10:00:00.000Z",
    totalCards: "under",
    totalCorners: "under",
    totalGoals: "over",
    winner: "away",
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<MatchOutcome> = {}): MatchOutcome {
  return {
    awayGoals: 3,
    finished: true,
    homeGoals: 0,
    totalCards: 2,
    totalCorners: 7,
    ...overrides,
  };
}

describe("clampGoals", () => {
  it("keeps predictions inside 0-12 whole goals", () => {
    expect(clampGoals(-3)).toBe(0);
    expect(clampGoals(4.9)).toBe(4);
    expect(clampGoals(99)).toBe(12);
    expect(clampGoals(Number.NaN)).toBe(0);
  });
});

describe("outcomeWinner", () => {
  it("maps goals to home, away, or draw", () => {
    expect(outcomeWinner(makeOutcome({ homeGoals: 2, awayGoals: 1 }))).toBe("home");
    expect(outcomeWinner(makeOutcome({ homeGoals: 0, awayGoals: 3 }))).toBe("away");
    expect(outcomeWinner(makeOutcome({ homeGoals: 1, awayGoals: 1 }))).toBe("draw");
  });
});

describe("settleLinePick", () => {
  it("settles overs as soon as the line is passed, even live", () => {
    expect(settleLinePick("over", 3, 2.5, false)).toBe("won");
    expect(settleLinePick("over", 2, 2.5, false)).toBe("open");
    expect(settleLinePick("over", 2, 2.5, true)).toBe("lost");
  });

  it("settles unders only at full time unless already lost", () => {
    expect(settleLinePick("under", 2, 2.5, false)).toBe("open");
    expect(settleLinePick("under", 3, 2.5, false)).toBe("lost");
    expect(settleLinePick("under", 2, 2.5, true)).toBe("won");
  });
});

describe("settlePrediction", () => {
  it("awards full points for a perfect finished prediction", () => {
    const settlement = settlePrediction(makePrediction(), makeOutcome(), teams);

    expect(settlement.final).toBe(true);
    // 5 exact + 3 winner + 2 goals over + 2 corners under + 2 cards under
    expect(settlement.totalPoints).toBe(14);
    expect(settlement.markets.map((market) => market.status)).toEqual([
      "won",
      "won",
      "won",
      "won",
      "won",
    ]);
  });

  it("awards winner but not exact score for the right result", () => {
    const settlement = settlePrediction(
      makePrediction({ homeGoals: 1, awayGoals: 2 }),
      makeOutcome(),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    expect(byMarket["Exact score"].status).toBe("lost");
    expect(byMarket["Exact score"].points).toBe(0);
    expect(byMarket["Winner"].status).toBe("won");
    expect(byMarket["Winner"].points).toBe(3);
    expect(byMarket["Winner"].pick).toBe("Morocco");
  });

  it("keeps exact score and winner open while the match is live", () => {
    const settlement = settlePrediction(
      makePrediction(),
      makeOutcome({ finished: false, awayGoals: 1 }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    expect(settlement.final).toBe(false);
    expect(byMarket["Exact score"].status).toBe("open");
    expect(byMarket["Winner"].status).toBe("open");
    expect(byMarket["Goals over/under 2.5"].status).toBe("open");
  });

  it("settles a lost under line as soon as it is passed live", () => {
    const settlement = settlePrediction(
      makePrediction(),
      makeOutcome({ finished: false, totalCorners: 9 }),
      teams,
    );
    const corners = settlement.markets.find((market) =>
      market.market.startsWith("Corners"),
    );

    expect(corners?.status).toBe("lost");
    expect(corners?.points).toBe(0);
  });

  it("settles a first-scorer pick by TxLINE player ID, even live", () => {
    const settlement = settlePrediction(
      makePrediction({
        firstScorer: { name: "Ounahi, Azzedine", playerId: 10092778 },
      }),
      makeOutcome({
        finished: false,
        awayGoals: 1,
        firstGoal: { playerId: 10092778, scorerName: "Ounahi, Azzedine" },
      }),
      teams,
    );
    const market = settlement.markets.find(
      (candidate) => candidate.market === "First scorer",
    );

    expect(market?.status).toBe("won");
    expect(market?.points).toBe(6);
    expect(market?.result).toBe("Ounahi, Azzedine");
  });

  it("settles a no-scorer pick only at full time", () => {
    const outcome = makeOutcome({
      awayGoals: 0,
      firstGoal: null,
      totalCorners: 2,
    });
    const live = settlePrediction(
      makePrediction({ firstScorer: "none", awayGoals: 0 }),
      { ...outcome, finished: false },
      teams,
    );
    const finished = settlePrediction(
      makePrediction({ firstScorer: "none", awayGoals: 0 }),
      outcome,
      teams,
    );

    expect(
      live.markets.find((market) => market.market === "First scorer")?.status,
    ).toBe("open");
    expect(
      finished.markets.find((market) => market.market === "First scorer")
        ?.status,
    ).toBe("won");
  });

  it("voids the first-scorer market when the goal has no player recorded", () => {
    const settlement = settlePrediction(
      makePrediction({
        firstScorer: { name: "Ounahi, Azzedine", playerId: 10092778 },
      }),
      makeOutcome({ firstGoal: { playerId: undefined } }),
      teams,
    );
    const market = settlement.markets.find(
      (candidate) => candidate.market === "First scorer",
    );

    expect(market?.status).toBe("void");
    expect(market?.points).toBe(0);
  });

  it("omits the first-scorer market when no pick was made", () => {
    const settlement = settlePrediction(makePrediction(), makeOutcome(), teams);

    expect(
      settlement.markets.some((market) => market.market === "First scorer"),
    ).toBe(false);
  });

  it("scales winner payout by odds locked at save time", () => {
    const settlement = settlePrediction(
      makePrediction({ oddsAtSave: { away: 5.35, draw: 3.8, home: 1.7 } }),
      makeOutcome(),
      teams,
    );
    const winner = settlement.markets.find((m) => m.market === "Winner");

    // away pick at 5.35 decimal odds: 3 x 5.35 = 16 points
    expect(winner?.points).toBe(16);
    expect(winner?.pick).toBe("Morocco @ 5.35");
  });

  it("caps and floors odds-scaled winner payouts", () => {
    const capped = settlePrediction(
      makePrediction({ oddsAtSave: { away: 40, draw: 3, home: 1.01 } }),
      makeOutcome(),
      teams,
    );

    expect(
      capped.markets.find((m) => m.market === "Winner")?.points,
    ).toBe(30);

    const floored = settlePrediction(
      makePrediction({
        winner: "home",
        homeGoals: 3,
        awayGoals: 0,
        oddsAtSave: { away: 40, draw: 3, home: 1.01 },
      }),
      makeOutcome({ homeGoals: 3, awayGoals: 0 }),
      teams,
    );

    expect(
      floored.markets.find((m) => m.market === "Winner")?.points,
    ).toBe(3);
  });

  it("is deterministic for the same inputs", () => {
    const first = settlePrediction(makePrediction(), makeOutcome(), teams);
    const second = settlePrediction(makePrediction(), makeOutcome(), teams);

    expect(second).toEqual(first);
  });
});
