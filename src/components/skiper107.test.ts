import { describe, expect, it } from "vitest";

import { buildLiveRounds, currentRoundIndex, type Round } from "./skiper107";

describe("buildLiveRounds", () => {
  it("overlays live TXLine scores on the retained bracket", () => {
    const rounds = buildLiveRounds(
      [
        {
          awayTeam: "Switzerland",
          fixtureGroup: "World Cup > Quarter-finals",
          fixtureId: 18222446,
          homeTeam: "Argentina",
          kickoffUtc: "2026-07-12T01:00:00.000Z",
          stage: "Quarter-finals",
        },
      ],
      {
        18222446: {
          awayGoals: 1,
          clockSeconds: 4380,
          homeGoals: 2,
          statusId: 4,
        },
      },
      Date.parse("2026-07-12T02:15:00.000Z"),
    );
    const game = rounds[2].matches[3];

    expect(game).toMatchObject({
      fixtureId: 18222446,
      liveMinute: 73,
      status: "live",
    });
    expect(game.home.score).toBe("2");
    expect(game.away.score).toBe("1");
  });

  it("places newly published TXLine fixtures into future rounds", () => {
    const rounds = buildLiveRounds(
      [
        {
          awayTeam: "Spain",
          fixtureGroup: "World Cup > Final",
          fixtureId: 999001,
          homeTeam: "France",
          kickoffUtc: "2026-07-19T19:00:00.000Z",
          stage: "Final",
        },
      ],
      {},
      Date.parse("2026-07-12T02:15:00.000Z"),
    );
    const final = rounds[4].matches[0];

    expect(final).toMatchObject({
      fixtureId: 999001,
      status: "upcoming",
    });
    expect(final.home.team?.name).toBe("France");
    expect(final.away.team?.name).toBe("Spain");
  });
});

describe("currentRoundIndex", () => {
  const round = (
    name: string,
    statuses: Array<"finished" | "live" | "upcoming">,
  ): Round => ({
    name,
    matches: statuses.map((status, index) => ({
      away: { score: null, team: null },
      date: "",
      home: { score: null, team: null },
      id: `${name}-${index}`,
      status,
    })),
  });

  it("opens on the first unfinished stage", () => {
    expect(
      currentRoundIndex([
        round("Round of 32", ["finished"]),
        round("Round of 16", ["finished"]),
        round("Quarter-finals", ["finished"]),
        round("Semi-finals", ["upcoming"]),
        round("Final", ["upcoming"]),
      ]),
    ).toBe(3);
  });

  it("prioritizes a live stage over other unfinished rounds", () => {
    expect(
      currentRoundIndex([
        round("Round of 32", ["upcoming"]),
        round("Round of 16", ["live"]),
        round("Quarter-finals", ["upcoming"]),
      ]),
    ).toBe(1);
  });

  it("opens on the final when it is the only remaining stage", () => {
    expect(
      currentRoundIndex([
        round("Semi-finals", ["finished"]),
        round("Final", ["upcoming"]),
      ]),
    ).toBe(1);
  });
});
