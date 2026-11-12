import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";

/** Convex reconnects itself. Preserve the open conversation during outages. */
export function ConnectionBanner() {
  const { isWebSocketConnected } = useConvexConnectionState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setVisible(!isWebSocketConnected),
      isWebSocketConnected ? 0 : 5000,
    );
    return () => window.clearTimeout(timer);
  }, [isWebSocketConnected]);

  if (isWebSocketConnected || !visible) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/20 bg-warning/10 px-4 py-2 text-center text-xs text-foreground"
    >
      <Loader2 className="size-3.5 shrink-0 animate-spin text-warning" />
      Reconnecting to Kyro. Your conversation will update when we're back.
    </div>
  );
}
