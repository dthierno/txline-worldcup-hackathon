import { UserProfile } from "@/components/user-profile";

export default async function Profile({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return <UserProfile userId={decodeURIComponent(userId)} />;
}
