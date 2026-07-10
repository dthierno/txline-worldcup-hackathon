import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { openTxlineStream } from "@/lib/txline-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getTxlineConfig();

  if (!config.configured) {
    return NextResponse.json(
      { error: "TxLINE credentials are not configured" },
      { status: 503 },
    );
  }

  const response = await openTxlineStream("odds");

  return new Response(response.body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream",
    },
  });
}
