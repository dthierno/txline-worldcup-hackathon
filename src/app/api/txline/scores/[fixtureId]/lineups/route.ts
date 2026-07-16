import { NextResponse } from "next/server";

import { enrichLineupsWithApiFootballImages } from "@/lib/api-football-player-media";
import { fixtureTeams } from "@/lib/fixture-teams";
import { readProjectedTeamLineup } from "@/lib/replay-store";
import type { NormalizedLineupTeam } from "@/lib/txline-normalize";
import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineLineups } from "@/lib/txline-client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    fixtureId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const config = getTxlineConfig();
  const { fixtureId } = await context.params;
  const id = Number.parseInt(fixtureId, 10);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid fixtureId" }, { status: 400 });
  }

  if (!config.configured) {
    return NextResponse.json({
      data: null,
      mode: "demo",
      source: "Demo lineups, no TxLINE credentials configured",
    });
  }

  try {
    let lineups = await fetchTxlineLineups(id);
    let source = "TxLINE score feed lineups records";

    // TxLINE publishes the official XI about an hour before kickoff. Until
    // then, project one from each side's recorded history (majority starters
    // over the last three matches, red-carded players excluded) - clearly
    // flagged, and replaced by the real one the moment it lands. isHome is
    // remapped: a side's last match may have had them on the other side of
    // the fixture.
    if (!lineups) {
      const teams = await fixtureTeams(id, config.configured);
      const projected = teams.map((team) => {
        const projection = readProjectedTeamLineup(team.teamName);

        return projection ? { ...projection, isHome: team.isHome } : null;
      });

      if (teams.length === 2 && projected.every(Boolean)) {
        lineups = {
          predicted: true,
          teams: projected as NormalizedLineupTeam[],
        };
        source =
          "Projected XI from recent matches (suspensions applied); TxLINE publishes official lineups about an hour before kickoff";
      }
    }

    const media = await enrichLineupsWithApiFootballImages(lineups);

    return NextResponse.json({
      data: media.lineups,
      media: {
        configured: media.configured,
        provider: media.provider,
        resolved: media.resolved,
      },
      mode: "txline",
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
