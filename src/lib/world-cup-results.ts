// Final scores of every World Cup 2026 match TxLINE's devnet carried a
// finalised feed for, recovered via the windowed history endpoints
// (fixtures/updates/{epochDay}/{hourOfDay} + scores/historical). Score is
// [home, away] from the game_finalised record (includes extra-time goals).
// The June 11-19 group games are absent: their replays are purged upstream.

export type WorldCupResult = {
  away: string;
  fixtureId: number;
  home: string;
  kickoffUtc: string;
  score: [number, number];
};

export const worldCupResults: WorldCupResult[] = [
  { fixtureId: 17926765, home: "Czech Republic", away: "South Africa", kickoffUtc: "2026-06-18T16:00:00.000Z", score: [1, 1] },
  { fixtureId: 17926603, home: "Switzerland", away: "Bosnia & Herzegovina", kickoffUtc: "2026-06-18T19:00:00.000Z", score: [4, 1] },
  { fixtureId: 17588238, home: "Canada", away: "Qatar", kickoffUtc: "2026-06-18T22:00:00.000Z", score: [6, 0] },
  { fixtureId: 17588223, home: "Mexico", away: "South Korea", kickoffUtc: "2026-06-19T01:00:00.000Z", score: [1, 0] },
  { fixtureId: 17588388, home: "USA", away: "Australia", kickoffUtc: "2026-06-19T19:00:00.000Z", score: [2, 0] },
  { fixtureId: 17588397, home: "Scotland", away: "Morocco", kickoffUtc: "2026-06-19T22:00:00.000Z", score: [0, 1] },
  { fixtureId: 17588317, home: "Brazil", away: "Haiti", kickoffUtc: "2026-06-20T00:30:00.000Z", score: [3, 0] },
  { fixtureId: 17926688, home: "Turkey", away: "Paraguay", kickoffUtc: "2026-06-20T03:00:00.000Z", score: [0, 1] },
  { fixtureId: 17926687, home: "Netherlands", away: "Sweden", kickoffUtc: "2026-06-20T17:00:00.000Z", score: [5, 1] },
  { fixtureId: 17588240, home: "Germany", away: "Ivory Coast", kickoffUtc: "2026-06-20T20:00:00.000Z", score: [2, 1] },
  { fixtureId: 17588320, home: "Ecuador", away: "Curacao", kickoffUtc: "2026-06-21T00:00:00.000Z", score: [0, 0] },
  { fixtureId: 17588310, home: "Tunisia", away: "Japan", kickoffUtc: "2026-06-21T04:00:00.000Z", score: [0, 4] },
  { fixtureId: 17588232, home: "Spain", away: "Saudi Arabia", kickoffUtc: "2026-06-21T16:00:00.000Z", score: [4, 0] },
  { fixtureId: 17588390, home: "Belgium", away: "Iran", kickoffUtc: "2026-06-21T19:00:00.000Z", score: [0, 0] },
  { fixtureId: 17588235, home: "Uruguay", away: "Cape Verde", kickoffUtc: "2026-06-21T22:00:00.000Z", score: [2, 2] },
  { fixtureId: 17588242, home: "New Zealand", away: "Egypt", kickoffUtc: "2026-06-22T01:00:00.000Z", score: [1, 3] },
  { fixtureId: 17588389, home: "Argentina", away: "Austria", kickoffUtc: "2026-06-22T17:00:00.000Z", score: [2, 0] },
  { fixtureId: 17926647, home: "France", away: "Iraq", kickoffUtc: "2026-06-22T21:00:00.000Z", score: [3, 0] },
  { fixtureId: 17588313, home: "Norway", away: "Senegal", kickoffUtc: "2026-06-23T00:00:00.000Z", score: [3, 2] },
  { fixtureId: 17588244, home: "Jordan", away: "Algeria", kickoffUtc: "2026-06-23T03:00:00.000Z", score: [1, 2] },
  { fixtureId: 17588231, home: "Portugal", away: "Uzbekistan", kickoffUtc: "2026-06-23T17:00:00.000Z", score: [5, 0] },
  { fixtureId: 17588324, home: "England", away: "Ghana", kickoffUtc: "2026-06-23T20:00:00.000Z", score: [0, 0] },
  { fixtureId: 17588401, home: "Panama", away: "Croatia", kickoffUtc: "2026-06-23T23:00:00.000Z", score: [0, 1] },
  { fixtureId: 17926615, home: "Colombia", away: "Congo DR", kickoffUtc: "2026-06-24T02:00:00.000Z", score: [1, 0] },
  { fixtureId: 17588303, home: "Switzerland", away: "Canada", kickoffUtc: "2026-06-24T19:00:00.000Z", score: [2, 1] },
  { fixtureId: 17926766, home: "Bosnia & Herzegovina", away: "Qatar", kickoffUtc: "2026-06-24T19:00:00.000Z", score: [3, 1] },
  { fixtureId: 17588319, home: "Morocco", away: "Haiti", kickoffUtc: "2026-06-24T22:00:00.000Z", score: [4, 2] },
  { fixtureId: 17588398, home: "Scotland", away: "Brazil", kickoffUtc: "2026-06-24T22:01:00.000Z", score: [0, 3] },
  { fixtureId: 17588395, home: "South Africa", away: "South Korea", kickoffUtc: "2026-06-25T01:00:00.000Z", score: [1, 0] },
  { fixtureId: 17926764, home: "Czech Republic", away: "Mexico", kickoffUtc: "2026-06-25T01:00:00.000Z", score: [0, 3] },
  { fixtureId: 17588302, home: "Ecuador", away: "Germany", kickoffUtc: "2026-06-25T20:00:00.000Z", score: [2, 1] },
  { fixtureId: 17588321, home: "Curacao", away: "Ivory Coast", kickoffUtc: "2026-06-25T20:00:00.000Z", score: [0, 2] },
  { fixtureId: 17588236, home: "Tunisia", away: "Netherlands", kickoffUtc: "2026-06-25T23:00:00.000Z", score: [1, 3] },
  { fixtureId: 17926686, home: "Japan", away: "Sweden", kickoffUtc: "2026-06-25T23:00:00.000Z", score: [1, 1] },
  { fixtureId: 17588229, home: "Paraguay", away: "Australia", kickoffUtc: "2026-06-26T02:00:00.000Z", score: [0, 0] },
  { fixtureId: 17926593, home: "Turkey", away: "USA", kickoffUtc: "2026-06-26T02:00:00.000Z", score: [3, 2] },
  { fixtureId: 17926740, home: "Senegal", away: "Iraq", kickoffUtc: "2026-06-26T19:00:00.000Z", score: [5, 0] },
  { fixtureId: 17588234, home: "Norway", away: "France", kickoffUtc: "2026-06-26T19:00:00.000Z", score: [1, 4] },
  { fixtureId: 17588314, home: "Cape Verde", away: "Saudi Arabia", kickoffUtc: "2026-06-27T00:00:00.000Z", score: [0, 0] },
  { fixtureId: 17588404, home: "Uruguay", away: "Spain", kickoffUtc: "2026-06-27T00:00:00.000Z", score: [0, 1] },
  { fixtureId: 17588323, home: "New Zealand", away: "Belgium", kickoffUtc: "2026-06-27T03:00:00.000Z", score: [1, 5] },
  { fixtureId: 17588309, home: "Egypt", away: "Iran", kickoffUtc: "2026-06-27T03:00:00.000Z", score: [1, 1] },
  { fixtureId: 17588402, home: "Panama", away: "England", kickoffUtc: "2026-06-27T21:00:00.000Z", score: [0, 2] },
  { fixtureId: 17588245, home: "Croatia", away: "Ghana", kickoffUtc: "2026-06-27T21:00:00.000Z", score: [2, 1] },
  { fixtureId: 17588391, home: "Colombia", away: "Portugal", kickoffUtc: "2026-06-27T23:31:00.000Z", score: [0, 0] },
  { fixtureId: 17926704, home: "Congo DR", away: "Uzbekistan", kickoffUtc: "2026-06-27T23:31:00.000Z", score: [3, 1] },
  { fixtureId: 17588326, home: "Algeria", away: "Austria", kickoffUtc: "2026-06-28T02:00:00.000Z", score: [3, 3] },
  { fixtureId: 17588325, home: "Jordan", away: "Argentina", kickoffUtc: "2026-06-28T02:00:00.000Z", score: [1, 3] },
  { fixtureId: 18167317, home: "South Africa", away: "Canada", kickoffUtc: "2026-06-28T19:00:00.000Z", score: [0, 1] },
  { fixtureId: 18172469, home: "Brazil", away: "Japan", kickoffUtc: "2026-06-29T17:00:00.000Z", score: [2, 1] },
  { fixtureId: 18175983, home: "Germany", away: "Paraguay", kickoffUtc: "2026-06-29T20:30:00.000Z", score: [1, 1] },
  { fixtureId: 18172280, home: "Netherlands", away: "Morocco", kickoffUtc: "2026-06-30T01:00:00.000Z", score: [1, 1] },
  { fixtureId: 18175397, home: "Ivory Coast", away: "Norway", kickoffUtc: "2026-06-30T17:00:00.000Z", score: [1, 2] },
  { fixtureId: 18175981, home: "France", away: "Sweden", kickoffUtc: "2026-06-30T21:00:00.000Z", score: [3, 0] },
  { fixtureId: 18179759, home: "Mexico", away: "Ecuador", kickoffUtc: "2026-07-01T02:00:00.000Z", score: [2, 0] },
  { fixtureId: 18179764, home: "England", away: "Congo DR", kickoffUtc: "2026-07-01T16:00:00.000Z", score: [2, 1] },
  { fixtureId: 18179550, home: "Belgium", away: "Senegal", kickoffUtc: "2026-07-01T20:00:00.000Z", score: [3, 2] },
  { fixtureId: 18172379, home: "USA", away: "Bosnia & Herzegovina", kickoffUtc: "2026-07-02T00:00:00.000Z", score: [2, 0] },
  { fixtureId: 18179551, home: "Spain", away: "Austria", kickoffUtc: "2026-07-02T19:00:00.000Z", score: [3, 0] },
  { fixtureId: 18179763, home: "Portugal", away: "Croatia", kickoffUtc: "2026-07-02T23:00:00.000Z", score: [2, 1] },
  { fixtureId: 18179552, home: "Switzerland", away: "Algeria", kickoffUtc: "2026-07-03T03:00:00.000Z", score: [2, 0] },
  { fixtureId: 18176123, home: "Australia", away: "Egypt", kickoffUtc: "2026-07-03T18:00:00.000Z", score: [1, 1] },
  { fixtureId: 18175918, home: "Argentina", away: "Cape Verde", kickoffUtc: "2026-07-03T22:00:00.000Z", score: [3, 2] },
  { fixtureId: 18179549, home: "Colombia", away: "Ghana", kickoffUtc: "2026-07-04T01:30:00.000Z", score: [1, 0] },
  { fixtureId: 18185036, home: "Canada", away: "Morocco", kickoffUtc: "2026-07-04T17:00:00.000Z", score: [0, 3] },
  { fixtureId: 18188721, home: "Paraguay", away: "France", kickoffUtc: "2026-07-04T21:03:00.000Z", score: [0, 1] },
  { fixtureId: 18187298, home: "Brazil", away: "Norway", kickoffUtc: "2026-07-05T20:00:00.000Z", score: [1, 2] },
  { fixtureId: 18192996, home: "Mexico", away: "England", kickoffUtc: "2026-07-06T01:00:00.000Z", score: [2, 3] },
  { fixtureId: 18198205, home: "Portugal", away: "Spain", kickoffUtc: "2026-07-06T19:00:00.000Z", score: [0, 1] },
  { fixtureId: 18193785, home: "USA", away: "Belgium", kickoffUtc: "2026-07-07T00:00:00.000Z", score: [1, 4] },
  { fixtureId: 18202701, home: "Argentina", away: "Egypt", kickoffUtc: "2026-07-07T16:00:00.000Z", score: [3, 2] },
  { fixtureId: 18202783, home: "Switzerland", away: "Colombia", kickoffUtc: "2026-07-07T20:00:00.000Z", score: [0, 0] },
  { fixtureId: 18209181, home: "France", away: "Morocco", kickoffUtc: "2026-07-09T20:00:00.000Z", score: [2, 0] },
  { fixtureId: 18218149, home: "Spain", away: "Belgium", kickoffUtc: "2026-07-10T19:00:00.000Z", score: [2, 1] },
  { fixtureId: 18213979, home: "Norway", away: "England", kickoffUtc: "2026-07-11T21:00:00.000Z", score: [1, 2] },
  // After extra time (goals in the 114th and 120th minutes) - verified
  // against the TxLINE snapshot (statusId 100) on 14 Jul 2026.
  { fixtureId: 18222446, home: "Argentina", away: "Switzerland", kickoffUtc: "2026-07-12T01:00:00.000Z", score: [3, 1] },
  // Semi-finals - verified against the committed TxLINE replay packs
  // (game_finalised stat banks) on 17 Jul 2026.
  { fixtureId: 18237038, home: "France", away: "Spain", kickoffUtc: "2026-07-14T19:00:00.000Z", score: [0, 2] },
  { fixtureId: 18241006, home: "England", away: "Argentina", kickoffUtc: "2026-07-15T19:00:00.000Z", score: [1, 2] },
];
