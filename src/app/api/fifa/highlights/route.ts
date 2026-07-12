import { NextResponse } from "next/server";

import { fetchFifaHighlights } from "@/lib/fifa-highlights";

export const dynamic = "force-dynamic";

// Official FIFA highlights for a fixture, resolved live from FIFA.com's own
// content API. Query: ?home=Argentina&away=Switzerland&kickoff=<ISO>.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const home = searchParams.get("home");
  const away = searchParams.get("away");
  const kickoff = searchParams.get("kickoff") ?? "";

  if (!home || !away) {
    return NextResponse.json(
      { error: "home and away are required" },
      { status: 400 },
    );
  }

  try {
    const result = await fetchFifaHighlights(home, away, kickoff, Date.now());

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        accessible: null,
        error: error instanceof Error ? error.message : "FIFA API error",
        official: null,
        status: "not-found",
      },
      { status: 200 },
    );
  }
}
