import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  MicOff,
  Phone,
  PhoneOff,
  ScreenShare,
  Video,
  Volume2,
} from "@/components/icons";
import { DeviceBadge, UserAvatar } from "@/components/app/UserAvatar";
import { playNotificationPing } from "@/lib/sound";
import { useUiStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

type ContainerType = "channel" | "conversation";

/**
 * The call controls that live in a DM header: start a call when idle, cancel
 * while ringing out, accept/decline while ringing in, and a live pill while
 * the call is connected. LiveKit media is mounted by the chat surface's
 * `LiveKitVoiceRoom`; this component only drives the existing `calls` rows.
 */
export function DmCallHeader({ conversationId }: { conversationId: string }) {
  const call = useQuery(api.voice.currentCall, {
    conversationId: conversationId as Id<"conversations">,
  });
  const startCall = useMutation(api.voice.startCall);
  const answerCall = useMutation(api.voice.answerCall);
  const endCall = useMutation(api.voice.endCall);
  const [busy, setBusy] = useState(false);
  const now = useNow(1_000);

  if (call === undefined) return null;

  const hangUp = () => {
    if (!call) return;
    void endCall({ callId: call.id as Id<"calls"> }).catch(() => undefined);
  };

  if (!call) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label="Start voice call"
        title="Start voice call"
        className="h-8 w-8 shrink-0 px-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          setBusy(true);
          void startCall({
            conversationId: conversationId as Id<"conversations">,
          })
            .catch((error: unknown) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Couldn't start the call.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Phone className="size-4" />
      </Button>
    );
  }

  const ringing = !call.answeredAt;

  // Someone is calling us: accept joins the room, decline hangs up and the
  // conversation records a missed call.
  if (ringing && !call.isCaller) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-surface py-1 pl-2.5 pr-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          Incoming call
        </span>
        <button
          type="button"
          aria-label="Accept call"
          title="Accept"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void answerCall({ callId: call.id as Id<"calls"> })
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
          className="flex size-7 items-center justify-center rounded-full bg-success text-white transition-transform hover:scale-105"
        >
          <Phone className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Decline call"
          title="Decline"
          onClick={hangUp}
          className="flex size-7 items-center justify-center rounded-full bg-destructive text-white transition-transform hover:scale-105"
        >
          <PhoneOff className="size-3.5" />
        </button>
      </div>
    );
  }

  // We're calling out and nobody has picked up yet.
  if (ringing) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-surface py-1 pl-2.5 pr-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Calling…
        </span>
        <button
          type="button"
          aria-label="Cancel call"
          title="Cancel"
          onClick={hangUp}
          className="flex size-7 items-center justify-center rounded-full bg-destructive text-white transition-transform hover:scale-105"
        >
          <PhoneOff className="size-3.5" />
        </button>
      </div>
    );
  }

  // Connected — the VoiceRoom strip below the header carries the controls.
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
      <span className="size-1.5 animate-pulse rounded-full bg-success" />
      On a call
      {call.answeredAt && now > 0
        ? ` · ${Math.floor((now - call.answeredAt) / 60_000)}:${String(
            Math.floor((now - call.answeredAt) / 1_000) % 60,
          ).padStart(2, "0")}`
        : ""}
    </span>
  );
}

/** Roster grid for a voice channel page. */
export function VoiceRoster({
  containerType,
  containerId,
}: {
  containerType: ContainerType;
  containerId: string;
}) {
  const roster = useQuery(api.voice.roster, { containerType, containerId });
  if (roster === undefined) {
    return <p className="text-sm text-muted-foreground">Loading voice…</p>;
  }
  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody's here yet — join to start talking.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roster.map((entry) => (
        <div
          key={entry.userId}
          className={cn(
            "flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3 transition-colors",
            entry.muted && "border-destructive/40",
          )}
        >
          {entry.user ? (
            <UserAvatar user={entry.user} size="md" />
          ) : (
            <span className="size-10 rounded-full bg-panel" />
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {entry.user?.name ?? "Member"}
              {entry.user && <DeviceBadge device={entry.user.device} />}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.muted ? "Muted" : "Voice connected"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {entry.sharing && (
              <span
                title="Sharing their screen"
                className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                <ScreenShare className="size-3" /> Sharing
              </span>
            )}
            {entry.camera && (
              <span
                title="Camera on"
                className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success"
              >
                <Video className="size-3" /> Camera
              </span>
            )}
            {entry.muted && <MicOff className="size-4 text-destructive" />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inline speaker glyph used by the sidebar for voice channels. */
export function VoiceChannelIcon({ className }: { className?: string }) {
  return <Volume2 className={className} />;
}

/**
 * Global ring banner: a DM call that's ringing surfaces over the whole app,
 * not just inside the conversation. Accept answers and jumps to the chat
 * (where the VoiceRoom mounts), decline hangs up and leaves a missed call.
 */
export function IncomingCallBanner() {
  const navigate = useNavigate();
  const incoming = useQuery(api.voice.incoming);
  const answerCall = useMutation(api.voice.answerCall);
  const endCall = useMutation(api.voice.endCall);

  const call = incoming && incoming.length > 0 ? incoming[0] : null;

  // One ping when a ring starts, honouring the notification-sound toggle.
  const wasRinging = useRef(false);
  useEffect(() => {
    const ringing = call !== null;
    if (ringing && !wasRinging.current) {
      if (useUiStore.getState().notificationSounds) playNotificationPing();
    }
    wasRinging.current = ringing;
  }, [call]);

  if (!call) return null;

  const accept = () => {
    void answerCall({ callId: call.callId as Id<"calls"> })
      .then(() => navigate(`/dashboard/dm/${call.conversationId}`))
      .catch(() => undefined);
  };
  const decline = () => {
    void endCall({ callId: call.callId as Id<"calls"> }).catch(() => undefined);
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-panel p-3 shadow-xl shadow-black/20 md:bottom-6">
      <div className="flex items-center gap-2.5">
        {call.caller ? (
          <UserAvatar user={call.caller} size="md" />
        ) : (
          <span className="size-10 rounded-full bg-surface" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {call.caller?.name ?? "Someone"}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Incoming voice call…
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={accept}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.02]"
        >
          <Phone className="size-3.5" /> Accept
        </button>
        <button
          type="button"
          onClick={decline}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.02]"
        >
          <PhoneOff className="size-3.5" /> Decline
        </button>
      </div>
    </div>
  );
}
