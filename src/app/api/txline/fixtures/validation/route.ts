import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineFixtureBatchValidation } from "@/lib/txline-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getTxlineConfig();

  if (!config.configured) {
    return NextResponse.json({
      data: null,
      mode: "demo",
      source: "Demo replay, no TxLINE credentials configured",
    });
  }

  try {
    return NextResponse.json({
      data: await fetchTxlineFixtureBatchValidation(),
      mode: "txline",
      source: "TxLINE fixture batch-validation API",
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
