import { Suspense } from "react";
import { TvScreen } from "@/components/tv-screen";

function TvPageInner({ code }: { code?: string }) {
  return <TvScreen initialCode={code} />;
}

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  return (
    <Suspense>
      <TvPageInner code={params.code?.toUpperCase()} />
    </Suspense>
  );
}
