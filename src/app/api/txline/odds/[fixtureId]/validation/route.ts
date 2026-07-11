import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineOddsValidationForFixture } from "@/lib/txline-client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    fixtureId: string;
  }>;
};

// Merkle proof for the fixture's latest full-match 1X2 odds record: the odds
// counterpart to score stat validation.
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
      source: "Demo replay, no TxLINE credentials configured",
    });
  }

  try {
    const data = await fetchTxlineOddsValidationForFixture(id);

    return NextResponse.json({
      data,
      mode: "txline",
      source: "TxLINE odds validation API",
      ...(data === null
        ? { error: "No priced full-match 1X2 record to validate" }
        : {}),
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
