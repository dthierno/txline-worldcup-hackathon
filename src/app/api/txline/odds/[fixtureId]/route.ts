import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineOddsSnapshot } from "@/lib/txline-client";

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
      source: "Demo odds, no TxLINE credentials configured",
    });
  }

  try {
    return NextResponse.json({
      data: await fetchTxlineOddsSnapshot(id),
      mode: "txline",
      source: "TxLINE odds snapshot API",
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
