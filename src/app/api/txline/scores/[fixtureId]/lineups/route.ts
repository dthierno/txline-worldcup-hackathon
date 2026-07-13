import { NextResponse } from "next/server";

import { enrichLineupsWithApiFootballImages } from "@/lib/api-football-player-media";
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
    const lineups = await fetchTxlineLineups(id);
    const media = await enrichLineupsWithApiFootballImages(lineups);

    return NextResponse.json({
      data: media.lineups,
      media: {
        configured: media.configured,
        provider: media.provider,
        resolved: media.resolved,
      },
      mode: "txline",
      source: "TxLINE score feed lineups records",
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
