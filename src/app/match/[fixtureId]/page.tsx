import { MatchPageV2 } from "@/components/match-page-v2";

export default async function Match({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;

  return <MatchPageV2 fixtureId={Number.parseInt(fixtureId, 10)} />;
}
