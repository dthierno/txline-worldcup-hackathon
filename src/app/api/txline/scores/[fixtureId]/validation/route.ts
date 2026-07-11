import { NextResponse } from "next/server";

import { getTxlineConfig } from "@/lib/txline-config";
import {
  fetchTxlineHistoricalScoreUpdates,
  fetchTxlineScoreStatValidation,
  fetchTxlineScoreStatValidationV3,
  fetchTxlineScoreUpdates,
} from "@/lib/txline-client";

const MARKET_PAIRS = [
  { market: "Goals", statKey: 1, statKey2: 2 },
  { market: "Yellow cards", statKey: 3, statKey2: 4 },
  { market: "Red cards", statKey: 5, statKey2: 6 },
  { market: "Corners", statKey: 7, statKey2: 8 },
];

// Preferred path: two v3 multiproof calls cover all four markets (four stat
// keys each) and return the proven values.
async function validateWithV3(fixtureId: number, seq: number) {
  const [firstBatch, secondBatch] = await Promise.all([
    fetchTxlineScoreStatValidationV3({
      fixtureId,
      seq,
      statKeys: [1, 2, 3, 4],
    }),
    fetchTxlineScoreStatValidationV3({
      fixtureId,
      seq,
      statKeys: [5, 6, 7, 8],
    }),
  ]);
  const batches = [firstBatch, secondBatch];
  const markets = MARKET_PAIRS.map((pair, index) => {
    const batch = batches[Math.floor(index / 2)];
    const proven = batch.provenStats.filter(
      (stat) => stat.key === pair.statKey || stat.key === pair.statKey2,
    );

    return {
      market: pair.market,
      proofNodes:
        batch.multiproofHashCount +
        batch.subTreeProofCount +
        batch.mainTreeProofCount,
      proven,
      statKeys: [pair.statKey, pair.statKey2],
    };
  });

  return {
    fixtureId: firstBatch.fixtureId,
    mainTreeProofCount: firstBatch.mainTreeProofCount,
    markets,
    proofMode: "multiproof-v3",
    statKeys: [1, 2, 3, 4, 5, 6, 7, 8],
    statProofCount: firstBatch.multiproofHashCount + secondBatch.multiproofHashCount,
    subTreeProofCount: firstBatch.subTreeProofCount,
    ts: firstBatch.ts,
    updateCount: firstBatch.updateCount,
  };
}

// Fallback: one legacy stat-validation call per market pair.
async function validateWithLegacyPairs(fixtureId: number, seq: number) {
  const results = await Promise.all(
    MARKET_PAIRS.map((pair) =>
      fetchTxlineScoreStatValidation({
        fixtureId,
        seq,
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

  return {
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
    proofMode: "legacy-pairs",
  };
}

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

    // Prove every settled market: v3 compressed multiproofs (with proven
    // values) when available, legacy per-pair proofs otherwise.
    const data = await validateWithV3(id, latestSeq).catch(() =>
      validateWithLegacyPairs(id, latestSeq),
    );

    return NextResponse.json({
      data,
      mode: "txline",
      source:
        data.proofMode === "multiproof-v3"
          ? "TxLINE score stat-validation-v3 API"
          : "TxLINE score stat-validation API",
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
