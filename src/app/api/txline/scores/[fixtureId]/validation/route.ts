import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import {
  fetchTxlineHistoricalScoreUpdates,
  fetchTxlineScoreStatValidation,
  fetchTxlineScoreUpdates,
} from "@/lib/txline-client";

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
  const searchParams = new URL(request.url).searchParams;
  const requestedSeq = Number.parseInt(searchParams.get("seq") ?? "", 10);

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
    const updates = Number.isFinite(requestedSeq)
      ? []
      : await fetchTxlineHistoricalScoreUpdates(id).catch(() =>
          fetchTxlineScoreUpdates(id),
        );
    const latestSeq = Number.isFinite(requestedSeq)
      ? requestedSeq
      : [...updates].sort((left, right) => (right.seq ?? 0) - (left.seq ?? 0))[0]
          ?.seq;

    if (typeof latestSeq !== "number") {
      return NextResponse.json({
        data: null,
        mode: "fallback",
        source: "TxLINE score stat-validation API",
        error: "No score sequence is available to validate",
      });
    }

    return NextResponse.json({
      data: await fetchTxlineScoreStatValidation({
        fixtureId: id,
        seq: latestSeq,
        statKey: 1,
        statKey2: 2,
      }),
      mode: "txline",
      source: "TxLINE score stat-validation API",
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
