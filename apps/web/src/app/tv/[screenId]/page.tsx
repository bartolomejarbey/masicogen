import { TvPlayer } from "@/components/TvPlayer";

export default async function ScreenPlayerPage({
  params
}: {
  params: Promise<{ screenId: string }>;
}) {
  const { screenId } = await params;
  const allowDemoFallback = process.env.NEXT_PUBLIC_APP_ENV !== "production";

  return (
    <main className="player-page">
      <TvPlayer allowDemoFallback={allowDemoFallback} screenId={screenId} />
    </main>
  );
}
