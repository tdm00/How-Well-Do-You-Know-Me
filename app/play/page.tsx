import { Suspense } from "react";
import { PlayScreen } from "@/components/play-screen";

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense>
      <PlayScreen initialCode={params.code?.toUpperCase()} />
    </Suspense>
  );
}
