import { redirect } from "next/navigation";

// This design is now the default match page at /match/[fixtureId]; keep the old
// demo URL working by redirecting to the canonical route.
export default async function MatchV2({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId } = await params;

  redirect(`/match/${fixtureId}`);
}
