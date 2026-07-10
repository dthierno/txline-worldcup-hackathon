import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import {
  fetchTxlineHistoricalScoreUpdates,
  withoutRaw,
} from "@/lib/txline-client";

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
      data: [],
      mode: "demo",
      source: "Demo replay, no TxLINE credentials configured",
    });
  }

  try {
    return NextResponse.json({
      data: (await fetchTxlineHistoricalScoreUpdates(id)).map(withoutRaw),
      mode: "txline",
      source: "TxLINE scores historical replay API",
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: [],
        error: error instanceof Error ? error.message : "Unknown TxLINE error",
        mode: "fallback",
      },
      { status: 200 },
    );
  }
}
