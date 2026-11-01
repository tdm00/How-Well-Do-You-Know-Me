import { Suspense } from "react";
import { HostScreen } from "@/components/host-screen";

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; host?: string }>;
}) {
  const params = await searchParams;
  const initial =
    params.code && params.host
      ? { code: params.code.toUpperCase(), token: params.host }
      : undefined;
  return (
    <Suspense>
      <HostScreen initial={initial} />
    </Suspense>
  );
}
