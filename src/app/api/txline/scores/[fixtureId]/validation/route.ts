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

    // Prove every settled market, not just goals: one validation call per
    // TxLINE stat-key pair.
    const pairs = [
      { market: "Goals", statKey: 1, statKey2: 2 },
      { market: "Yellow cards", statKey: 3, statKey2: 4 },
      { market: "Red cards", statKey: 5, statKey2: 6 },
      { market: "Corners", statKey: 7, statKey2: 8 },
    ];
    const results = await Promise.all(
      pairs.map((pair) =>
        fetchTxlineScoreStatValidation({
          fixtureId: id,
          seq: latestSeq,
          statKey: pair.statKey,
          statKey2: pair.statKey2,
        })
          .then((summary) => ({ market: pair.market, ...summary }))
          .catch(() => null),
      ),
    );
    const goals = results[0];

    if (!goals) {
      throw new Error("Stat validation unavailable");
    }

    return NextResponse.json({
      data: {
        ...goals,
        markets: results
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .map((entry) => ({
            market: entry.market,
            proofNodes:
              entry.statProofCount +
              entry.subTreeProofCount +
              entry.mainTreeProofCount,
            statKeys: entry.statKeys,
          })),
      },
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
