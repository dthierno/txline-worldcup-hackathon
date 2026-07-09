import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getTxlineConfig();

  return NextResponse.json({
    apiOrigin: config.apiOrigin,
    configured: config.configured,
    mode: config.configured ? "txline" : "demo",
    network: config.network,
  });
}
