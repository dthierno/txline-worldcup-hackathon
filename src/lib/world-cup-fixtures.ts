export type WorldCupFixture = {
  awayTeam: string;
  fixtureGroup: string;
  fixtureId: number;
  homeTeam: string;
  kickoffUtc: string;
  stage: string;
};

// Confirmed TxLINE schedule coverage from the World Cup docs.
export const txlineWorldCupFixtures: WorldCupFixture[] = [
  {
    fixtureId: 18185036,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Canada",
    awayTeam: "Morocco",
    kickoffUtc: "2026-07-04T17:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18188721,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Paraguay",
    awayTeam: "France",
    kickoffUtc: "2026-07-04T21:03:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18187298,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Brazil",
    awayTeam: "Norway",
    kickoffUtc: "2026-07-05T20:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18192996,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Mexico",
    awayTeam: "England",
    kickoffUtc: "2026-07-06T00:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18198205,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Portugal",
    awayTeam: "Spain",
    kickoffUtc: "2026-07-06T19:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18193785,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "USA",
    awayTeam: "Belgium",
    kickoffUtc: "2026-07-07T00:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18202701,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Argentina",
    awayTeam: "Egypt",
    kickoffUtc: "2026-07-07T16:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18202783,
    fixtureGroup: "World Cup > 8th Finals",
    homeTeam: "Switzerland",
    awayTeam: "Colombia",
    kickoffUtc: "2026-07-07T20:00:00.000Z",
    stage: "8th Finals",
  },
  {
    fixtureId: 18209181,
    fixtureGroup: "World Cup > Quarter-finals",
    homeTeam: "France",
    awayTeam: "Morocco",
    kickoffUtc: "2026-07-09T20:00:00.000Z",
    stage: "Quarter-finals",
  },
];

export const featuredFixture = txlineWorldCupFixtures.find(
  (fixture) => fixture.fixtureId === 18209181,
)!;
