import JoinClient from "./JoinClient";

export function generateStaticParams() {
  return [];
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <JoinClient userId={userId} />;
}
