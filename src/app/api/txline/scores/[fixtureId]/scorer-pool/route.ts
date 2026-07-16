import { NextResponse } from "next/server";

import { resolveScorerPool } from "@/lib/api-football-player-media";
import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineFixtures, fetchTxlineLineups } from "@/lib/txline-client";
import type { NormalizedLineups } from "@/lib/txline-normalize";
import { txlineWorldCupFixtures } from "@/lib/world-cup-fixtures";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    fixtureId: string;
  }>;
};

// Only needed before TxLINE publishes an XI, since the XI names its own teams.
async function fixtureTeams(
  id: number,
  configured: boolean,
): Promise<Array<{ isHome: boolean; teamName: string }>> {
  let fixtures = txlineWorldCupFixtures;

  if (configured) {
    try {
      fixtures = await fetchTxlineFixtures();
    } catch {
      // The seeded schedule still names the teams when the snapshot is down.
    }
  }

  const fixture =
    fixtures.find((entry) => entry.fixtureId === id) ??
    txlineWorldCupFixtures.find((entry) => entry.fixtureId === id);

  return fixture
    ? [
        { isHome: true, teamName: fixture.homeTeam },
        { isHome: false, teamName: fixture.awayTeam },
      ]
    : [];
}

export async function GET(_request: Request, context: RouteContext) {
  const config = getTxlineConfig();
  const { fixtureId } = await context.params;
  const id = Number.parseInt(fixtureId, 10);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid fixtureId" }, { status: 400 });
  }

  let lineups: NormalizedLineups | null = null;

  if (config.configured) {
    try {
      lineups = await fetchTxlineLineups(id);
    } catch {
      // No XI yet is the normal case days out, and a TxLINE outage should not
      // cost the markets their provider-squad pool either.
    }
  }

  try {
    const data = await resolveScorerPool(
      lineups,
      lineups ? [] : await fixtureTeams(id, config.configured),
    );

    return NextResponse.json({
      data,
      mode: config.configured ? "txline" : "demo",
      source: data.provisional
        ? "API-Football squads, no TxLINE lineup published yet"
        : "TxLINE score feed lineups records",
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: error instanceof Error ? error.message : "Unknown TxLINE error",
        mode: "fallback",
      },
      { status: 200 },
    );
  }
}
