import {
  buildOddsMovementSeries,
  computePossessionSplit,
  extractLineups,
  findFirstGoal,
  normalizeOddsSnapshot,
  normalizeScoreSnapshot,
} from "./txline-client";
import { extractGoalCalls, extractGoals, extractSubstitutionEvents } from "./txline-normalize";

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

  it("decodes per-half stat banks when present", () => {
    const normalized = normalizeScoreSnapshot([
      {
        Action: "game_finalised",
        Seq: 99,
        Stats: {
          1: 0, 2: 3, 3: 4, 4: 4, 7: 11, 8: 1,
          1001: 0, 1002: 0, 1003: 2, 1004: 4, 1007: 5, 1008: 0,
          3001: 0, 3002: 3, 3003: 2, 3004: 0, 3007: 6, 3008: 1,
        },
      },
    ]);

    expect(normalized.halfStats?.first).toMatchObject({
      awayGoals: 0, homeGoals: 0, homeCorners: 5, awayYellowCards: 4,
    });
    expect(normalized.halfStats?.second).toMatchObject({
      awayGoals: 3, homeCorners: 6, awayCorners: 1,
    });
    // No banks -> no halfStats key
    expect(
      normalizeScoreSnapshot([{ Seq: 1, Stats: { 1: 0, 2: 1 } }]).halfStats,
    ).toBeUndefined();
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

  it("compacts full-match 1X2 updates into a bounded movement series", () => {
    const entries = [
      // Out of order on purpose: the series must sort by timestamp.
      {
        Pct: ["23.1", "28.2", "48.7"],
        SuperOddsType: "1X2_PARTICIPANT_RESULT",
        Ts: 3,
      },
      {
        Pct: ["50", "50"],
        SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS",
        Ts: 4,
      },
      // Moves less than 0.5 percentage points versus the last kept point.
      {
        Pct: ["23.2", "28.1", "48.7"],
        SuperOddsType: "1X2_PARTICIPANT_RESULT",
        Ts: 5,
      },
      {
        Pct: ["25.0", "27.0", "48.0"],
        SuperOddsType: "1X2_PARTICIPANT_RESULT",
        Ts: 7,
      },
      // Period markets are excluded from the full-match series.
      {
        MarketPeriod: "half=1",
        Pct: ["30", "40", "30"],
        SuperOddsType: "1X2_PARTICIPANT_RESULT",
        Ts: 6,
      },
      {
        Pct: ["22.0", "28.0", "50.0"],
        SuperOddsType: "1X2_PARTICIPANT_RESULT",
        Ts: 1,
      },
    ];

    expect(
      buildOddsMovementSeries(entries).map((point) => point.ts),
    ).toEqual([1, 3, 7]);
    expect(buildOddsMovementSeries(entries)[0]).toEqual({
      away: 50,
      draw: 28,
      home: 22,
      ts: 1,
    });
    expect(
      buildOddsMovementSeries(entries, { maxPoints: 2 }).map(
        (point) => point.ts,
      ),
    ).toEqual([3, 7]);
  });

  it("computes a possession split from possession-phase records", () => {
    expect(
      computePossessionSplit([
        { clockSeconds: 0, possession: 1, seq: 1 },
        { clockSeconds: 90, possession: 2, seq: 2 },
        { clockSeconds: 120, seq: 3 },
      ]),
    ).toEqual({
      team1Pct: 75,
      team1Seconds: 90,
      team2Pct: 25,
      team2Seconds: 30,
    });
    // Under a minute of attributed play returns null.
    expect(
      computePossessionSplit([
        { clockSeconds: 0, possession: 1, seq: 1 },
        { clockSeconds: 30, seq: 2 },
      ]),
    ).toBeNull();
  });

  it("extracts lineups with player names from feed records", () => {
    const lineups = extractLineups([
      {
        Action: "lineups",
        Lineups: [
          {
            lineups: [
              {
                player: { normativeId: 280343, preferredName: "Ounahi, Azzedine" },
                rosterNumber: "8",
                starter: true,
              },
              {
                player: { normativeId: 280344, preferredName: "Bench Player" },
                rosterNumber: "20",
                starter: false,
              },
            ],
            normativeId: 2530,
            preferredName: "Morocco",
          },
          {
            lineups: [],
            normativeId: 1686,
            preferredName: "Canada",
          },
        ],
        Participant1Id: 1686,
        Participant1IsHome: true,
        Seq: 8,
        Ts: 1783183237478,
      },
    ]);

    expect(lineups?.teams.map((team) => team.teamName)).toEqual([
      "Canada",
      "Morocco",
    ]);
    expect(lineups?.teams[1].isHome).toBe(false);
    expect(lineups?.teams[1].players[0]).toEqual({
      name: "Ounahi, Azzedine",
      number: "8",
      playerId: 280343,
      starter: true,
    });
  });

  it("finds the first goal scorer from sibling goal records", () => {
    expect(
      findFirstGoal([
        {
          awayGoals: 0,
          homeGoals: 0,
          participant1IsHome: true,
          seq: 1,
        },
        // Unconfirmed goal record: stats not advanced yet, no player.
        {
          action: "goal",
          awayGoals: 0,
          homeGoals: 0,
          participant1IsHome: true,
          seq: 2,
        },
        // Confirmed sibling record carries the player and the advance.
        {
          action: "goal",
          awayGoals: 1,
          data: { PlayerId: 10092778 },
          homeGoals: 0,
          participant1IsHome: true,
          seq: 3,
        },
        {
          action: "goal",
          awayGoals: 2,
          data: { PlayerId: 99999 },
          homeGoals: 0,
          participant1IsHome: true,
          seq: 9,
        },
      ]),
    ).toEqual({ playerId: 10092778, scoringSide: "away" });
    expect(findFirstGoal([])).toBeNull();
  });

  it("extracts every goal with minute and scorer", () => {
    const goals = extractGoals([
      {
        awayGoals: 0,
        homeGoals: 0,
        participant1IsHome: true,
        seq: 1,
      },
      {
        action: "goal",
        awayGoals: 1,
        clockSeconds: 2958,
        data: { PlayerId: 10092778 },
        homeGoals: 0,
        participant1IsHome: true,
        seq: 3,
      },
      {
        action: "goal",
        awayGoals: 2,
        clockSeconds: 4879,
        homeGoals: 0,
        participant1IsHome: true,
        seq: 9,
      },
      // Scorer arrives on a sibling record of the second goal.
      {
        action: "goal",
        awayGoals: 2,
        data: { PlayerId: 10115454 },
        homeGoals: 0,
        participant1IsHome: true,
        seq: 10,
      },
    ]);

    expect(goals).toHaveLength(2);
    expect(goals[0]).toMatchObject({
      awayGoals: 1,
      clockSeconds: 2958,
      playerId: 10092778,
      scoringSide: "away",
    });
    expect(goals[1]).toMatchObject({
      clockSeconds: 4879,
      playerId: 10115454,
    });
  });

  it("resolves goal calls by score advance or clearing record", () => {
    const calls = extractGoalCalls([
      // Raise that is cleared -> no goal
      { action: "possible", awayGoals: 0, clockSeconds: 660, data: { Goal: true }, eventId: 147, homeGoals: 0, participant: 2, seq: 151 },
      { action: "possible", awayGoals: 0, data: { Goal: false }, eventId: 148, homeGoals: 0, seq: 152 },
      // Raise followed by a score advance -> goal stood
      { action: "possible", awayGoals: 0, clockSeconds: 3560, data: { Goal: true }, eventId: 791, homeGoals: 0, participant: 1, seq: 791 },
      { action: "goal", awayGoals: 0, homeGoals: 1, seq: 793 },
      // Open raise with no resolution yet (live)
      { action: "possible", awayGoals: 0, clockSeconds: 4000, data: { Goal: true }, eventId: 900, homeGoals: 1, participant: 2, seq: 900 },
    ]);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({ resolved: true, stood: false, participant: 2 });
    expect(calls[1]).toMatchObject({ resolved: true, stood: true, participant: 1 });
    expect(calls[2]).toMatchObject({ resolved: false, stood: false });
  });

  it("merges substitution sibling records and drops player-less events", () => {
    expect(
      extractSubstitutionEvents([
        // Unconfirmed record: no players yet.
        { action: "substitution", clockSeconds: 3715, eventId: 657, seq: 10 },
        // Confirmed sibling carries the players.
        {
          action: "substitution",
          data: { PlayerInId: 111, PlayerOutId: 222 },
          eventId: 657,
          seq: 11,
        },
        // Event that never received player IDs is dropped.
        { action: "substitution", clockSeconds: 4020, eventId: 702, seq: 12 },
        { action: "kickoff", eventId: 1, seq: 1 },
      ]),
    ).toEqual([
      { clockSeconds: 3715, playerInId: 111, playerOutId: 222 },
    ]);
  });
});
