import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Headphones, Loader2, Volume2 } from "@/components/icons";
import { VoiceRoster } from "@/components/app/Voice";
import { LiveKitVoiceRoomLoader as VoiceRoom } from "@/components/app/LiveKitVoiceRoomLoader";

/**
 * A community voice channel: drop in, talk, drop out. The room auto-joins on
 * open — the same feel as clicking a voice channel in any game chat — and the
 * strip at the bottom carries mute, deafen and leave.
 */
export function VoiceChannelPage({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) {
  const navigate = useNavigate();
  const channels = useQuery(api.channels.list, {
    serverId: serverId as Id<"servers">,
  });
  const [joined, setJoined] = useState(true);

  if (channels === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const channel = channels.channels.find((entry) => entry.id === channelId);
  if (!channel || channel.kind !== "voice") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Volume2 className="size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">Voice channel not found</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or it may not be a voice channel.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => navigate(`/dashboard/s/${serverId}`)}
        >
          Back to the community
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-panel px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-surface text-muted-foreground">
          <Volume2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{channel.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            Live voice channel — everyone here can talk.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success sm:flex">
          <Headphones className="size-3.5" />
          {joined ? "Connected" : "Not connected"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          In this channel
        </h2>
        <VoiceRoster containerType="channel" containerId={channelId} />

        {!joined && (
          <div className="mt-6 rounded-xl border border-border/70 bg-surface p-5 text-center">
            <p className="text-sm text-muted-foreground">
              You left the voice channel.
            </p>
            <Button className="mt-3" onClick={() => setJoined(true)}>
              Rejoin voice
            </Button>
          </div>
        )}
      </div>

      <VoiceRoom
        containerType="channel"
        containerId={channelId}
        active={joined}
        onLeave={() => setJoined(false)}
      />
    </div>
  );
}
