import { NextResponse } from "next/server";

import {
  resolveScorerPool,
  type ScorerPool,
  type ScorerPoolTeam,
} from "@/lib/api-football-player-media";
import { readLatestPackLineupTeam } from "@/lib/replay-store";
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
    const teams = lineups ? [] : await fixtureTeams(id, config.configured);
    let data = await resolveScorerPool(lineups, teams);
    let source = data.provisional
      ? "API-Football squads, no TxLINE lineup published yet"
      : "TxLINE score feed lineups records";

    // Squad provider empty (typically its daily quota): fall back to each
    // side's previous recorded lineup. Those carry TxLINE's own player ids,
    // so the pool is settlement-grade, not provisional - it is just last
    // match's squad rather than today's.
    if (data.teams.length === 0 && teams.length === 2) {
      const packTeams = teams.map((team) => {
        const lineup = readLatestPackLineupTeam(team.teamName);

        return lineup
          ? {
              isHome: team.isHome,
              players: lineup.players.flatMap((player) =>
                typeof player.playerId === "number"
                  ? [
                      {
                        imageUrl: player.imageUrl,
                        name: player.name,
                        playerId: player.playerId,
                        position: player.position,
                        shirtNumber: player.number
                          ? Number(player.number) || undefined
                          : undefined,
                      },
                    ]
                  : [],
              ),
              teamName: team.teamName,
            }
          : null;
      });

      if (packTeams.every((team) => team && team.players.length > 0)) {
        data = {
          configured: data.configured,
          provider: "txline",
          provisional: false,
          teams: packTeams as ScorerPoolTeam[],
        } satisfies ScorerPool;
        source = "TxLINE lineups from each side's previous recorded match";
      }
    }

    return NextResponse.json({
      data,
      mode: config.configured ? "txline" : "demo",
      source,
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
