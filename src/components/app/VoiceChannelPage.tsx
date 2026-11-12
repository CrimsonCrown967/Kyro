import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Headphones,
  Loader2,
  Volume2,
  Mic,
  MonitorSmartphone,
} from "@/components/icons";
import { VoiceRoster } from "@/components/app/Voice";
import { LiveKitVoiceRoomLoader as VoiceRoom } from "@/components/app/LiveKitVoiceRoomLoader";

/**
 * Preview a voice room before joining. The transport reports the actual
 * connection state; choosing a channel never turns on the microphone itself.
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
  const [joined, setJoined] = useState(false);
  const [connection, setConnection] = useState("disconnected");

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
        <span
          className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:flex"
          role="status"
        >
          <Headphones className="size-3.5" />
          {!joined
            ? "Voice preview"
            : connection === "connected"
              ? "Connected"
              : connection.toLowerCase().includes("reconnect")
                ? "Reconnecting…"
                : "Connecting…"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <section className="voice-welcome mb-8 rounded-3xl border border-primary/15 p-6 sm:p-9">
          <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Headphones className="size-7" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-primary">
            A little closer, together
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            {channel.name}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {channel.topic ||
              "Good company doesn't need a reason. Drop in, share your screen, or stay and listen."}
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Mic className="size-4" /> Voice & video
            </span>
            <span className="flex items-center gap-2">
              <MonitorSmartphone className="size-4" /> Screen sharing
            </span>
          </div>
          {!joined && (
            <Button
              className="mt-7 rounded-xl px-6"
              onClick={() => setJoined(true)}
            >
              <Headphones className="mr-2 size-4" /> Join voice
            </Button>
          )}
          {!joined && (
            <p className="mt-3 text-xs text-muted-foreground">
              Previewing the room. Your microphone is off.
            </p>
          )}
        </section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          In this channel
        </h2>
        <VoiceRoster containerType="channel" containerId={channelId} />
      </div>

      {joined && (
        <VoiceRoom
          containerType="channel"
          containerId={channelId}
          active={joined}
          onLeave={() => setJoined(false)}
          onConnectionChange={setConnection}
        />
      )}
    </div>
  );
}
