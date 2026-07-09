import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineFixtures } from "@/lib/txline-client";
import { txlineWorldCupFixtures } from "@/lib/world-cup-fixtures";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getTxlineConfig();

  if (!config.configured) {
    return NextResponse.json({
      data: txlineWorldCupFixtures,
      mode: "demo",
      source: "TxLINE docs schedule seed",
    });
  }

  try {
    const data = await fetchTxlineFixtures();

    return NextResponse.json({
      data,
      mode: "txline",
      source: "TxLINE fixtures snapshot API",
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: txlineWorldCupFixtures,
        error: error instanceof Error ? error.message : "Unknown TxLINE error",
        mode: "fallback",
        source: "TxLINE docs schedule seed",
      },
      { status: 200 },
    );
  }
}
