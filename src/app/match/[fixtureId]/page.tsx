import { MatchPage } from "@/components/match-page";

export default async function Match({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;

  return <MatchPage fixtureId={Number.parseInt(fixtureId, 10)} />;
}
