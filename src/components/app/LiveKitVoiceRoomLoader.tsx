import { lazy, Suspense } from "react";
import { Loader2 } from "@/components/icons";

const LazyLiveKitVoiceRoom = lazy(() =>
  import("@/components/app/LiveKitVoiceRoom").then((module) => ({
    default: module.LiveKitVoiceRoom,
  })),
);

export function LiveKitVoiceRoomLoader(props: {
  containerType: "channel" | "conversation";
  containerId: string;
  active: boolean;
  onLeave: () => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 border-t border-border/60 bg-panel px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading secure voice…
        </div>
      }
    >
      <LazyLiveKitVoiceRoom {...props} />
    </Suspense>
  );
}
