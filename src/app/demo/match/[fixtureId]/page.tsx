import { MatchPageV2 } from "@/components/match-page-v2";

// Design sandbox: the match page rebuilt with the homepage design language
// (see DESIGN.md), for side-by-side comparison with /match/[fixtureId].
export default async function MatchV2({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;

  return <MatchPageV2 fixtureId={Number.parseInt(fixtureId, 10)} />;
}
