import {
  buildOddsMovementSeries,
  computePossessionSplit,
  extractLineups,
  findFirstGoal,
  normalizeOddsSnapshot,
  normalizeScoreSnapshot,
} from "./txline-client";
import {
  applyScoutCorrections,
  buildOddsBoard,
  deriveMatchClock,
  extractGoalCalls,
  extractGoals,
  extractMatchInfo,
  extractMomentum,
  extractPenaltyEvents,
  extractSubstitutionEvents,
  formatLiveMinute,
  normalizeOddsValidation,
  normalizeValidationSummaryV3,
} from "./txline-normalize";

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
                player: {
                  dateOfBirth: "2000-04-19",
                  normativeId: 280343,
                  preferredName: "Ounahi, Azzedine",
                },
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
      dateOfBirth: "2000-04-19",
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

  it("removes disallowed goals when the score regresses", () => {
    // NOR-ENG live pattern: Norway's 57' goal advanced the stats to 2-1 on a
    // VAR record, was discarded, and the stats regressed to 1-1.
    const base = { participant1IsHome: true };
    const goals = extractGoals([
      { ...base, awayGoals: 0, homeGoals: 0, seq: 1 },
      { ...base, action: "goal", awayGoals: 0, clockSeconds: 2104, data: { PlayerId: 7 }, homeGoals: 1, seq: 314 },
      { ...base, action: "goal", awayGoals: 1, clockSeconds: 2770, data: { PlayerId: 8 }, homeGoals: 1, seq: 418 },
      // Disallowed: advance then regression, no goal action survives.
      { ...base, action: "var_end", awayGoals: 1, clockSeconds: 3406, homeGoals: 2, seq: 538 },
      { ...base, action: "corner", awayGoals: 1, clockSeconds: 3429, homeGoals: 1, seq: 541 },
      { ...base, action: "goal", awayGoals: 2, clockSeconds: 5555, data: { PlayerId: 8 }, homeGoals: 1, seq: 885 },
    ]);

    expect(goals.map((goal) => `${goal.homeGoals}-${goal.awayGoals}`)).toEqual([
      "1-0",
      "1-1",
      "1-2",
    ]);
    expect(goals.map((goal) => goal.playerId)).toEqual([7, 8, 8]);
  });

  it("drops discarded events and applies shot amends", () => {
    const corrected = applyScoutCorrections([
      // A corner later discarded by the scout (shared event Id).
      {
        action: "corner",
        clockSeconds: 100,
        eventId: 470,
        participant: 1,
        seq: 10,
      },
      { action: "action_discarded", eventId: 470, seq: 11 },
      // A shot re-graded from OnTarget to OffTarget via action_amend.
      { action: "shot", clockSeconds: 215, eventId: 63, seq: 12 },
      {
        action: "shot",
        clockSeconds: 215,
        data: { Outcome: "OnTarget" },
        eventId: 63,
        participant: 1,
        seq: 13,
      },
      {
        action: "action_amend",
        data: {
          Action: "shot",
          New: { Clock: { Running: true, Seconds: 215 }, Outcome: "OffTarget" },
          Previous: {
            Clock: { Running: true, Seconds: 215 },
            Outcome: "OnTarget",
          },
        },
        eventId: 108,
        seq: 14,
      },
    ]);

    expect(corrected.some((update) => update.action === "corner")).toBe(false);
    expect(
      corrected.find((update) => update.seq === 13)?.data?.Outcome,
    ).toBe("OffTarget");
    // The empty sibling record is untouched.
    expect(corrected.find((update) => update.seq === 12)?.data).toBeUndefined();
  });

  it("derives the latest match clock and phase", () => {
    expect(
      deriveMatchClock([
        { clockRunning: false, clockSeconds: 0, seq: 19, statusId: 2, ts: 1 },
        { clockRunning: true, clockSeconds: 2705, seq: 560, statusId: 4, ts: 9 },
      ]),
    ).toEqual({ running: true, seconds: 2705, statusId: 4, ts: 9 });
    expect(formatLiveMinute(2705, 4)).toBe("46'");
    expect(formatLiveMinute(47 * 60, 2)).toBe("45+3'");
    expect(formatLiveMinute(92 * 60, 4)).toBe("90+3'");
  });

  it("extracts scene-setting match info", () => {
    expect(
      extractMatchInfo([
        {
          action: "weather",
          data: { Conditions: ["Sunny", "Day"] },
          participant1IsHome: true,
          seq: 1,
        },
        {
          action: "pitch",
          data: { Conditions: ["Good"] },
          participant1IsHome: true,
          seq: 2,
        },
        {
          action: "venue",
          data: { Type: "neutral" },
          participant1IsHome: true,
          seq: 3,
        },
        {
          action: "jersey",
          data: { Color: "aqua" },
          participant: 1,
          participant1IsHome: true,
          seq: 4,
        },
        {
          action: "kickoff_team",
          participant: 2,
          participant1IsHome: true,
          seq: 5,
        },
      ]),
    ).toEqual({
      awayJersey: undefined,
      homeJersey: "aqua",
      kickoffSide: "away",
      pitch: "Good",
      venueType: "neutral",
      weather: "Sunny, Day",
    });
  });

  it("buckets attack momentum per side and dedupes chance siblings", () => {
    const buckets = extractMomentum([
      {
        action: "danger_possession",
        clockSeconds: 30,
        participant: 1,
        participant1IsHome: true,
        seq: 1,
      },
      {
        action: "high_danger_possession",
        clockSeconds: 90,
        participant: 2,
        seq: 2,
      },
      // Two sibling records of the same shot: counted once.
      { action: "shot", clockSeconds: 120, eventId: 9, participant: 1, seq: 3 },
      { action: "shot", clockSeconds: 120, eventId: 9, participant: 1, seq: 4 },
      { action: "safe_possession", clockSeconds: 150, participant: 1, seq: 5 },
      { action: "attack_possession", clockSeconds: 400, participant: 2, seq: 6 },
    ]);

    expect(buckets).toEqual([
      { awayPressure: 3, homePressure: 5, startMinute: 0 },
      { awayPressure: 1, homePressure: 0, startMinute: 5 },
    ]);
  });

  it("settles penalties by outcome record or score advance", () => {
    const base = { awayGoals: 0, homeGoals: 0, participant1IsHome: true };
    const events = extractPenaltyEvents([
      { ...base, action: "penalty", clockSeconds: 1472, eventId: 296, participant: 1, seq: 313 },
      { ...base, action: "var_end", data: { Outcome: "Stands" }, seq: 320 },
      {
        ...base,
        action: "penalty_outcome",
        data: { Outcome: "Missed" },
        seq: 322,
      },
      { ...base, action: "penalty", clockSeconds: 5000, eventId: 800, participant: 2, seq: 900 },
      { ...base, action: "goal", awayGoals: 1, seq: 905 },
      { ...base, action: "game_finalised", awayGoals: 1, seq: 999 },
    ]);

    expect(events).toMatchObject([
      {
        outcome: "missed",
        participant: 1,
        resolved: true,
        varOutcome: "Stands",
        voided: false,
      },
      { outcome: "scored", participant: 2, resolved: true },
    ]);
  });

  it("normalizes v3 multiproof validation with proven stat values", () => {
    expect(
      normalizeValidationSummaryV3({
        eventStatRoot: [75, 120],
        mainTreeProof: [{ hash: [1], isRightSibling: true }],
        multiproof: { hashes: [{ hash: [2] }, { hash: [3] }] },
        statsToProve: [
          { stat: { key: 1, period: 100, value: 2 }, statProof: [] },
          { stat: { key: 2, period: 100, value: 0 }, statProof: [] },
        ],
        subTreeProof: [{ hash: [4] }],
        summary: {
          fixtureId: 18209181,
          updateStats: { updateCount: 1 },
        },
        ts: 1783634788478,
      }),
    ).toEqual({
      fixtureId: 18209181,
      mainTreeProofCount: 1,
      multiproofHashCount: 2,
      provenStats: [
        { key: 1, value: 2 },
        { key: 2, value: 0 },
      ],
      subTreeProofCount: 1,
      ts: 1783634788478,
      updateCount: 1,
    });
  });

  it("normalizes an odds validation proof", () => {
    expect(
      normalizeOddsValidation({
        mainTreeProof: [{ hash: [1] }, { hash: [2] }],
        odds: {
          Bookmaker: "TXLineStablePriceDemargined",
          MessageId: "1837058724:00003:000125-10021-stab",
          PriceNames: ["part1", "draw", "part2"],
          Prices: [1660, 4120, 6530],
          SuperOddsType: "1X2_PARTICIPANT_RESULT",
          Ts: 1783633403469,
        },
        subTreeProof: [{ hash: [3] }],
        summary: { updateStats: { updateCount: 1146 } },
      }),
    ).toEqual({
      bookmaker: "TXLineStablePriceDemargined",
      mainTreeProofCount: 2,
      marketType: "1X2_PARTICIPANT_RESULT",
      messageId: "1837058724:00003:000125-10021-stab",
      prices: [1.66, 4.12, 6.53],
      priceNames: ["part1", "draw", "part2"],
      subTreeProofCount: 1,
      ts: 1783633403469,
      updateCount: 1146,
    });
  });

  it("builds a full-period odds board with latest prices per line", () => {
    expect(
      buildOddsBoard([
        {
          Prices: [2195, 2583, 6360],
          SuperOddsType: "1X2_PARTICIPANT_RESULT",
          Ts: 5,
        },
        // Half-time market: excluded.
        {
          MarketPeriod: "half=1",
          Prices: [1500, 3000, 8000],
          SuperOddsType: "1X2_PARTICIPANT_RESULT",
          Ts: 9,
        },
        // Suspended (empty prices): skipped.
        {
          MarketParameters: "line=2.5",
          Prices: [],
          SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS",
          Ts: 9,
        },
        {
          MarketParameters: "line=2.5",
          Prices: [1900, 1900],
          SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS",
          Ts: 3,
        },
        {
          MarketParameters: "line=2.5",
          Prices: [2100, 1700],
          SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS",
          Ts: 4,
        },
        {
          MarketParameters: "line=-0.5",
          Prices: [1800, 2000],
          SuperOddsType: "ASIANHANDICAP_PARTICIPANT_GOALS",
          Ts: 4,
        },
      ]),
    ).toEqual({
      asianHandicap: [{ line: -0.5, prices: [1.8, 2], ts: 4 }],
      overUnder: [{ line: 2.5, prices: [2.1, 1.7], ts: 4 }],
      result: { away: 6.36, draw: 2.583, home: 2.195, ts: 5 },
    });
  });
});
