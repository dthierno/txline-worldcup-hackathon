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
    expect(winner?.pick).toBe("Morocco");
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

  it("scales exact-score payout by the frozen scoreline odds", () => {
    const settlement = settlePrediction(
      makePrediction({ awayGoals: 3, exactScoreOdds: 12.4, homeGoals: 0 }),
      makeOutcome(),
      teams,
    );

    expect(
      settlement.markets.find((market) => market.market === "Exact score")
        ?.points,
    ).toBe(12);

    const capped = settlePrediction(
      makePrediction({ exactScoreOdds: 80 }),
      makeOutcome(),
      teams,
    );

    expect(
      capped.markets.find((market) => market.market === "Exact score")
        ?.points,
    ).toBe(30);
  });

  it("is deterministic for the same inputs", () => {
    const first = settlePrediction(makePrediction(), makeOutcome(), teams);
    const second = settlePrediction(makePrediction(), makeOutcome(), teams);

    expect(second).toEqual(first);
  });

  it("wins an anytime-scorer pick mid-match but keeps last scorer open", () => {
    const settlement = settlePrediction(
      makePrediction({
        anytimeScorer: { name: "Hakimi, Achraf", playerId: 7 },
        lastScorer: { name: "Hakimi, Achraf", playerId: 7 },
      }),
      makeOutcome({
        finished: false,
        goals: [
          { playerId: 7, scorerName: "Hakimi, Achraf" },
          { playerId: 9, scorerName: "En-Nesyri, Youssef" },
        ],
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    // A scored goal cannot be unscored; the anytime call banks live.
    expect(byMarket["Anytime scorer"].status).toBe("won");
    expect(byMarket["Anytime scorer"].points).toBe(4);
    // A later goal could still change the last scorer.
    expect(byMarket["Last scorer"].status).toBe("open");
  });

  it("settles the last scorer against the final goal at full time", () => {
    const settlement = settlePrediction(
      makePrediction({
        anytimeScorer: "none",
        lastScorer: { name: "En-Nesyri, Youssef", playerId: 9 },
      }),
      makeOutcome({
        goals: [
          { playerId: 7, scorerName: "Hakimi, Achraf" },
          { playerId: 9, scorerName: "En-Nesyri, Youssef" },
        ],
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    expect(byMarket["Last scorer"].status).toBe("won");
    expect(byMarket["Last scorer"].points).toBe(6);
    expect(byMarket["Last scorer"].result).toBe("En-Nesyri, Youssef");
    // Goals were scored, so "no goal scorer" loses.
    expect(byMarket["Anytime scorer"].status).toBe("lost");
  });

  it("settles the disciplinary markets off the per-player card record", () => {
    const settlement = settlePrediction(
      makePrediction({
        bookedPlayer: { name: "Hakimi, Achraf", odds: 11.2, playerId: 7 },
        sentOffPlayer: { name: "Saiss, Romain", odds: 140, playerId: 5 },
      }),
      makeOutcome({
        // Two cards reported, two attributed: the record adds up.
        playerCards: { "5": { red: 1 }, "7": { yellow: 1 } },
        totalCards: 2,
        totalRedCards: 1,
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    expect(byMarket["Booked"].status).toBe("won");
    expect(byMarket["Booked"].points).toBe(11);
    expect(byMarket["Sent off"].status).toBe("won");
    expect(byMarket["Sent off"].points).toBe(140);
  });

  it("loses a booking pick only when the card record adds up", () => {
    const complete = settlePrediction(
      makePrediction({
        bookedPlayer: { name: "Hakimi, Achraf", playerId: 7 },
      }),
      makeOutcome({
        playerCards: { "5": { yellow: 1 }, "9": { yellow: 1 } },
        totalCards: 2,
        totalRedCards: 0,
      }),
      teams,
    );

    expect(
      complete.markets.find((market) => market.market === "Booked")?.status,
    ).toBe("lost");
  });

  it("voids a booking pick when TxLINE attributed only some of the cards", () => {
    const settlement = settlePrediction(
      makePrediction({
        bookedPlayer: { name: "Hakimi, Achraf", playerId: 7 },
      }),
      makeOutcome({
        // Four cards in the match, one attributed: the fan's player could be
        // any of the three TxLINE never named, so the call cannot be ruled out.
        playerCards: { "5": { yellow: 1 } },
        totalCards: 4,
        totalRedCards: 0,
      }),
      teams,
    );

    expect(
      settlement.markets.find((market) => market.market === "Booked")?.status,
    ).toBe("void");
  });

  it("keeps a booking pick open until the per-player record lands", () => {
    const settlement = settlePrediction(
      makePrediction({
        bookedPlayer: { name: "Hakimi, Achraf", playerId: 7 },
      }),
      // TxLINE only attaches playerStats to game_finalised.
      makeOutcome({ finished: false, playerCards: null, totalCards: 3 }),
      teams,
    );

    expect(
      settlement.markets.find((market) => market.market === "Booked")?.status,
    ).toBe("open");
  });

  it("pays a scorer pick by the odds frozen at save", () => {
    const settlement = settlePrediction(
      makePrediction({
        // A defender: long odds on both calls.
        anytimeScorer: { name: "Hakimi, Achraf", odds: 12.4, playerId: 7 },
        firstScorer: { name: "Hakimi, Achraf", odds: 31.7, playerId: 7 },
      }),
      makeOutcome({
        firstGoal: { playerId: 7, scorerName: "Hakimi, Achraf" },
        goals: [{ playerId: 7, scorerName: "Hakimi, Achraf" }],
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    // The long shot pays its price rather than the flat base a favourite earns.
    expect(byMarket["Anytime scorer"].points).toBe(12);
    expect(byMarket["First scorer"].points).toBe(32);
  });

  it("floors scorer points at the base and caps the wildest calls", () => {
    const settlement = settlePrediction(
      makePrediction({
        // The favourite prices below the base, a keeper far above the cap.
        anytimeScorer: { name: "En-Nesyri, Youssef", odds: 1.9, playerId: 9 },
        firstScorer: { name: "En-Nesyri, Youssef", odds: 900, playerId: 9 },
      }),
      makeOutcome({
        firstGoal: { playerId: 9, scorerName: "En-Nesyri, Youssef" },
        goals: [{ playerId: 9, scorerName: "En-Nesyri, Youssef" }],
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    // Floored at the flat base the market used to pay everyone.
    expect(byMarket["Anytime scorer"].points).toBe(4);
    expect(byMarket["First scorer"].points).toBe(50);
  });

  it("voids a provisional scorer pick instead of losing it", () => {
    // Taken off a provider squad before TxLINE published an XI, so playerId 99
    // is a provider id the goal feed will never report - even though this fan
    // named the player who actually scored.
    const settlement = settlePrediction(
      makePrediction({
        anytimeScorer: { name: "Hakimi, Achraf", playerId: 99, provisional: true },
        firstScorer: { name: "Hakimi, Achraf", playerId: 99, provisional: true },
        lastScorer: { name: "Hakimi, Achraf", playerId: 99, provisional: true },
      }),
      makeOutcome({
        firstGoal: { playerId: 7, scorerName: "Hakimi, Achraf" },
        goals: [{ playerId: 7, scorerName: "Hakimi, Achraf" }],
      }),
      teams,
    );
    const byMarket = Object.fromEntries(
      settlement.markets.map((market) => [market.market, market]),
    );

    for (const market of ["Anytime scorer", "First scorer", "Last scorer"]) {
      expect(byMarket[market].status).toBe("void");
      expect(byMarket[market].points).toBe(0);
    }
  });

  it("keeps a provisional scorer pick open while the match can still reconcile", () => {
    const settlement = settlePrediction(
      makePrediction({
        firstScorer: { name: "Hakimi, Achraf", playerId: 99, provisional: true },
      }),
      makeOutcome({ finished: false, firstGoal: { playerId: 7 } }),
      teams,
    );
    const first = settlement.markets.find(
      (market) => market.market === "First scorer",
    );

    expect(first?.status).toBe("open");
  });

  it("settles double-chance side picks at full time, scaled by odds", () => {
    const settlement = settlePrediction(
      makePrediction({
        sidePicks: [
          { kind: "double_chance", odds: 1.31, pick: "draw_away" },
          { kind: "double_chance", odds: 4.1, pick: "home_draw" },
        ],
      }),
      makeOutcome(),
      teams,
    );
    const [covered, missed] = settlement.markets.filter(
      (market) => market.market === "Double chance",
    );

    expect(covered?.pick).toBe("Draw or Morocco");
    expect(covered?.status).toBe("won");
    // 2 x 1.31 rounds to 3, floored at the base of 2 anyway
    expect(covered?.points).toBe(3);
    expect(missed?.status).toBe("lost");
    expect(missed?.points).toBe(0);
  });

  it("keeps double chance open while the match runs", () => {
    const settlement = settlePrediction(
      makePrediction({
        sidePicks: [{ kind: "double_chance", odds: 1.31, pick: "draw_away" }],
      }),
      makeOutcome({ finished: false }),
      teams,
    );

    expect(
      settlement.markets.find((market) => market.market === "Double chance")
        ?.status,
    ).toBe("open");
  });

  it("settles extra goals lines like core lines, paying the frozen odds", () => {
    const settlement = settlePrediction(
      makePrediction({
        sidePicks: [
          { kind: "goals_line", line: 1.5, odds: 1.3, pick: "over" },
          { kind: "goals_line", line: 4.5, odds: 3.4, pick: "over" },
        ],
      }),
      // 3 goals so far, match still running: over 1.5 already won, over 4.5
      // still open.
      makeOutcome({ finished: false }),
      teams,
    );
    const overLow = settlement.markets.find(
      (market) => market.market === "Goals over/under 1.5",
    );
    const overHigh = settlement.markets.find(
      (market) => market.market === "Goals over/under 4.5",
    );

    expect(overLow?.status).toBe("won");
    expect(overLow?.points).toBe(3);
    expect(overHigh?.status).toBe("open");
  });

  it("settles home handicap by the adjusted margin and voids pushes", () => {
    const prediction = makePrediction({
      sidePicks: [
        { kind: "handicap", line: 1.5, odds: 2.1, pick: "home" },
        { kind: "handicap", line: -0.5, odds: 3.0, pick: "away" },
        { kind: "handicap", line: 3, odds: 2.5, pick: "home" },
      ],
    });
    // Canada 0 - 3 Morocco: home +1.5 loses (margin -1.5), away -0.5 wins
    // (margin -3.5), home +3 pushes (margin 0) and voids.
    const settlement = settlePrediction(prediction, makeOutcome(), teams);
    const handicaps = settlement.markets.filter((market) =>
      market.market.startsWith("Handicap"),
    );

    expect(handicaps.map((market) => market.status)).toEqual([
      "lost",
      "won",
      "void",
    ]);
    expect(handicaps[1]?.market).toBe("Handicap Canada -0.5");
    expect(handicaps[1]?.pick).toBe("Morocco");
    expect(handicaps[1]?.points).toBe(6);
    expect(handicaps[2]?.points).toBe(0);
  });

  it("caps side-pick payouts and ignores picks past the limit", () => {
    const longShot = settlePrediction(
      makePrediction({
        sidePicks: [{ kind: "goals_line", line: 0.5, odds: 16.4, pick: "under" }],
      }),
      makeOutcome({ awayGoals: 0, finished: true, homeGoals: 0 }),
      teams,
    );

    expect(
      longShot.markets.find(
        (market) => market.market === "Goals over/under 0.5",
      )?.points,
    ).toBe(20);

    // The cap is 8: one slot per side-market group (double chance, first-half
    // result and goals, margin, BTTS, penalty, own goal) plus headroom.
    const overLimit = settlePrediction(
      makePrediction({
        sidePicks: Array.from({ length: 11 }, () => ({
          kind: "goals_line" as const,
          line: 1.5,
          odds: 1.3,
          pick: "over" as const,
        })),
      }),
      makeOutcome(),
      teams,
    );

    expect(
      overLimit.markets.filter(
        (market) => market.market === "Goals over/under 1.5",
      ),
    ).toHaveLength(8);
  });
});

describe("side markets from the researched feed", () => {
  const bare = makePrediction({
    awayGoals: null,
    homeGoals: null,
    totalCards: null,
    totalCorners: null,
    totalGoals: null,
    winner: null,
  });
  const oneMarket = (settlement: {
    markets: Array<{ points: number; result: string; status: string }>;
  }) => {
    expect(settlement.markets).toHaveLength(1);

    return settlement.markets[0];
  };

  it("settles the first-half result at the break, not full time", () => {
    const settlement = settlePrediction(
      { ...bare, sidePicks: [{ kind: "half_result", odds: 2.62, pick: "home" }] },
      makeOutcome({ finished: false, halfTimeAway: 0, halfTimeHome: 1 }),
      teams,
    );
    const market = oneMarket(settlement);

    expect(market.status).toBe("won");
    expect(market.points).toBe(5);
    expect(market.result).toBe("HT 1-0");
  });

  it("voids first-half markets when a finished match has no half-time record", () => {
    const settlement = settlePrediction(
      {
        ...bare,
        sidePicks: [
          { kind: "half_result", odds: 2.62, pick: "home" },
          { kind: "half_goals_line", line: 1.5, odds: 2.34, pick: "over" },
        ],
      },
      makeOutcome(),
      teams,
    );

    expect(settlement.markets.map((market) => market.status)).toEqual([
      "void",
      "void",
    ]);
  });

  it("settles the first-half goals line from the half banks", () => {
    const settlement = settlePrediction(
      {
        ...bare,
        sidePicks: [{ kind: "half_goals_line", line: 1.5, odds: 2.34, pick: "over" }],
      },
      makeOutcome({ halfTimeAway: 1, halfTimeHome: 1 }),
      teams,
    );

    expect(oneMarket(settlement).status).toBe("won");
  });

  it("clinches a both-teams-to-score yes before full time and no only at it", () => {
    const yes = { ...bare, sidePicks: [{ kind: "btts", odds: 1.61, pick: "yes" } as const] };
    const live = settlePrediction(
      yes,
      makeOutcome({ awayGoals: 1, finished: false, homeGoals: 1 }),
      teams,
    );

    expect(oneMarket(live).status).toBe("won");

    const no = { ...bare, sidePicks: [{ kind: "btts", odds: 2.6, pick: "no" } as const] };
    const blank = settlePrediction(
      no,
      makeOutcome({ awayGoals: 3, finished: false, homeGoals: 0 }),
      teams,
    );

    expect(oneMarket(blank).status).toBe("open");
    expect(
      oneMarket(settlePrediction(no, makeOutcome({ awayGoals: 3, homeGoals: 0 }), teams))
        .status,
    ).toBe("won");
  });

  it("settles penalty and own-goal picks from the player record and voids without one", () => {
    const picks = {
      ...bare,
      sidePicks: [
        { kind: "penalty", odds: 3.33, pick: "yes" } as const,
        { kind: "own_goal", odds: 10, pick: "no" } as const,
      ],
    };
    const recorded = settlePrediction(
      picks,
      makeOutcome({ ownGoals: 0, penaltiesAwarded: 1 }),
      teams,
    );

    expect(recorded.markets.map((market) => market.status)).toEqual(["won", "won"]);

    const unrecorded = settlePrediction(picks, makeOutcome(), teams);

    expect(unrecorded.markets.map((market) => market.status)).toEqual([
      "void",
      "void",
    ]);
  });

  it("pays the goals line at its frozen market price", () => {
    const settlement = settlePrediction(
      makePrediction({
        awayGoals: null,
        homeGoals: null,
        totalCards: null,
        totalCorners: null,
        totalGoalsOdds: { over: 1.54, under: 2.84 },
        winner: null,
      }),
      makeOutcome(),
      teams,
    );
    const market = oneMarket(settlement);

    // 2 x 1.54 = 3.08 -> 3, instead of the flat 2.
    expect(market.status).toBe("won");
    expect(market.points).toBe(3);
  });
});
