import { normalizeOddsSnapshot, normalizeScoreSnapshot } from "./txline-client";

describe("txline client normalizers", () => {
  it("normalizes score arrays with object Stats maps", () => {
    expect(
      normalizeScoreSnapshot([
        {
          Action: "goal",
          GameState: "first_half",
          Seq: 7,
          Stats: {
            1: 2,
            2: 1,
            3: 1,
            7: 4,
            8: 3,
          },
          Ts: 1783208903160,
        },
      ]),
    ).toMatchObject({
      action: "goal",
      awayCorners: 3,
      awayGoals: 1,
      gameState: "first_half",
      homeCorners: 4,
      homeGoals: 2,
      homeYellowCards: 1,
      seq: 7,
    });
  });

  it("extracts 1X2 odds probabilities", () => {
    expect(
      normalizeOddsSnapshot([
        {
          InRunning: false,
          MarketParameters: null,
          MarketPeriod: "half=1",
          Pct: ["43.422", "41.999", "14.579"],
          PriceNames: ["part1", "draw", "part2"],
          Prices: [2303, 2381, 6859],
          SuperOddsType: "1X2_PARTICIPANT_RESULT",
        },
      ]),
    ).toMatchObject({
      awayWinProbability: 14.579,
      drawProbability: 41.999,
      homeWinProbability: 43.422,
      marketNote: "TxLINE 1X2: 43.4% / 42.0% / 14.6%",
    });
  });
});
