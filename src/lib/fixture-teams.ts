import { pastWorldCupFixtures } from "./past-world-cup-fixtures";
import { fetchTxlineFixtures } from "./txline-client";
import { txlineWorldCupFixtures } from "./world-cup-fixtures";

// Who plays in a fixture, independent of whether TxLINE has published an XI.
// Needed by the fallbacks that build squads and predicted lineups before the
// official one lands (TxLINE names the teams inside the lineups record, so
// once that exists nothing needs this).
export async function fixtureTeams(
  id: number,
  configured: boolean,
): Promise<Array<{ isHome: boolean; teamName: string }>> {
  let fixtures = [...pastWorldCupFixtures, ...txlineWorldCupFixtures];

  if (configured) {
    try {
      fixtures = [...(await fetchTxlineFixtures()), ...fixtures];
    } catch {
      // The seeded schedules still name the teams when the snapshot is down.
    }
  }

  const fixture = fixtures.find((entry) => entry.fixtureId === id);

  return fixture
    ? [
        { isHome: true, teamName: fixture.homeTeam },
        { isHome: false, teamName: fixture.awayTeam },
      ]
    : [];
}
