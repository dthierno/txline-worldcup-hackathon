import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import { fetchTxlineScoreUpdates, withoutRaw } from "@/lib/txline-client";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    fixtureId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const config = getTxlineConfig();
  const { fixtureId } = await context.params;
  const id = Number.parseInt(fixtureId, 10);

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid fixtureId" }, { status: 400 });
  }

  // Cursor: only return events newer than the last one the client already has,
  // so a poll ships the handful of new events rather than the whole match.
  const since = Number.parseInt(
    new URL(request.url).searchParams.get("since") ?? "0",
    10,
  );
  const cursor = Number.isFinite(since) ? since : 0;

  if (!config.configured) {
    return NextResponse.json({
      data: [],
      mode: "demo",
      source: "Demo replay, no TxLINE credentials configured",
    });
  }

  try {
    const updates = (await fetchTxlineScoreUpdates(id))
      .map(withoutRaw)
      .filter((update) => (update.seq ?? 0) > cursor);

    return NextResponse.json({
      data: updates,
      mode: "txline",
      source: "TxLINE scores updates API",
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
