import { useAction, useMutation, useQuery } from "convex/react";
import {
  ConnectionState,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackPublication,
  supportsAudioOutputSelection,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Ellipsis,
  Headphones,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  Volume2,
} from "@/components/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readableError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

type ContainerType = "channel" | "conversation";

/** Screen shares are capped at 720p/30fps to protect CPU and bandwidth. */
const SCREEN_SHARE_RESOLUTION = {
  width: 1280,
  height: 720,
  frameRate: 30,
} as const;

type TokenResponse = {
  ok: true;
  serverUrl: string;
  token: string;
  roomName: string;
  canManage: boolean;
  canPublishSources: Array<
    "microphone" | "camera" | "screen_share" | "screen_share_audio"
  >;
};

function participantUserId(participant: Participant): string {
  try {
    const metadata = JSON.parse(participant.metadata || "{}") as {
      userId?: unknown;
    };
    if (typeof metadata.userId === "string") return metadata.userId;
  } catch {
    // Identity is the authoritative fallback.
  }
  return participant.identity.startsWith("user_")
    ? participant.identity.slice(5)
    : participant.identity;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function VideoPublication({
  publication,
  className,
  muted = false,
}: {
  publication: TrackPublication;
  className?: string;
  muted?: boolean;
}) {
  const elementRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = elementRef.current;
    const track = publication.track;
    if (!element || !track || track.kind !== Track.Kind.Video) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication, publication.track]);
  return (
    <video
      ref={elementRef}
      autoPlay
      playsInline
      muted={muted}
      className={cn("size-full bg-black object-cover", className)}
    />
  );
}

export function LiveKitVoiceRoom({
  containerType,
  containerId,
  active,
  onLeave,
}: {
  containerType: ContainerType;
  containerId: string;
  active: boolean;
  onLeave: () => void;
}) {
  const me = useQuery(api.users.me);
  const roster = useQuery(
    api.voice.roster,
    active ? { containerType, containerId } : "skip",
  );
  const issueTicket = useAction(api.voiceAuth.issueJoinTicket);
  const issueModerationTicket = useAction(api.voiceAuth.issueModerationTicket);
  const join = useMutation(api.voice.join);
  const leave = useMutation(api.voice.leave);
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        stopLocalTrackOnUnpublish: true,
      }),
  );
  const [, setRevision] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [canManage, setCanManage] = useState(false);
  const [allowedSources, setAllowedSources] = useState<
    TokenResponse["canPublishSources"]
  >([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("");
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const roomRef = useRef<Room | null>(room);
  const onLeaveRef = useRef(onLeave);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const deafenedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const leaveSignaledRef = useRef(false);
  const stateRef = useRef({
    muted: false,
    deafened: false,
    camera: false,
    sharing: false,
  });
  const now = useNow(1_000);

  const refresh = () => setRevision((value) => value + 1);
  const signalLeave = () => {
    if (leaveSignaledRef.current) return;
    leaveSignaledRef.current = true;
    onLeaveRef.current();
  };

  useEffect(() => {
    onLeaveRef.current = onLeave;
  }, [onLeave]);

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioInputs(devices.filter((device) => device.kind === "audioinput"));
    setVideoInputs(devices.filter((device) => device.kind === "videoinput"));
    setAudioOutputs(devices.filter((device) => device.kind === "audiooutput"));
  };

  useEffect(() => {
    deafenedRef.current = deafened;
    audioContainerRef.current?.querySelectorAll("audio").forEach((element) => {
      element.muted = deafened;
    });
  }, [deafened]);

  useEffect(() => {
    stateRef.current = {
      muted,
      deafened,
      camera: cameraEnabled,
      sharing,
    };
  }, [muted, deafened, cameraEnabled, sharing]);

  useEffect(() => {
    if (!active) return;
    leaveSignaledRef.current = false;
    let disposed = false;
    let heartbeat = 0;
    const nextRoom = room;
    const audioContainer = audioContainerRef.current;
    roomRef.current = nextRoom;

    const onTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        element.autoplay = true;
        element.muted = deafenedRef.current;
        element.dataset.livekitAudio = "true";
        audioContainer?.appendChild(element);
      }
      refresh();
    };
    const onTrackUnsubscribed = (track: Track) => {
      track.detach().forEach((element) => element.remove());
      refresh();
    };
    const onDisconnected = () => {
      reconnectingRef.current = false;
      setConnection(ConnectionState.Disconnected);
      if (!disposed) {
        toast.error("Voice connection ended.");
        signalLeave();
      }
      refresh();
    };
    const onConnectionChanged = (state: ConnectionState) => {
      setConnection(
        state === ConnectionState.Disconnected && reconnectingRef.current
          ? ConnectionState.Reconnecting
          : state === ConnectionState.SignalReconnecting
            ? ConnectionState.Reconnecting
            : state,
      );
      refresh();
    };
    const onReconnecting = () => {
      reconnectingRef.current = true;
      setConnection(ConnectionState.Reconnecting);
      refresh();
    };
    const onReconnected = () => {
      reconnectingRef.current = false;
      setConnection(ConnectionState.Connected);
      refresh();
    };
    const onLocalTrackMuted = (publication: TrackPublication) => {
      if (
        nextRoom.localParticipant.getTrackPublication(publication.source) ===
        publication
      ) {
        if (publication.source === Track.Source.Microphone) setMuted(true);
        if (publication.source === Track.Source.Camera) setCameraEnabled(false);
        if (publication.source === Track.Source.ScreenShare) setSharing(false);
      }
      refresh();
    };
    const onLocalTrackUnmuted = (publication: TrackPublication) => {
      if (
        nextRoom.localParticipant.getTrackPublication(publication.source) ===
        publication
      ) {
        if (publication.source === Track.Source.Microphone) setMuted(false);
        if (publication.source === Track.Source.Camera) setCameraEnabled(true);
        if (publication.source === Track.Source.ScreenShare) setSharing(true);
      }
      refresh();
    };
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.MediaDevicesChanged,
    ] as const;
    events.forEach((event) => nextRoom.on(event, refresh));
    nextRoom.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    nextRoom.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    nextRoom.on(RoomEvent.TrackMuted, onLocalTrackMuted);
    nextRoom.on(RoomEvent.TrackUnmuted, onLocalTrackUnmuted);
    nextRoom.on(RoomEvent.Disconnected, onDisconnected);
    nextRoom.on(RoomEvent.ConnectionStateChanged, onConnectionChanged);
    nextRoom.on(RoomEvent.Reconnecting, onReconnecting);
    nextRoom.on(RoomEvent.Reconnected, onReconnected);
    nextRoom.on(RoomEvent.MediaDevicesChanged, refreshDevices);

    const connect = async () => {
      try {
        setConnection(ConnectionState.Connecting);
        const grant = await issueTicket({ containerType, containerId });
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: grant.ticket }),
        });
        const credentials = (await response.json()) as
          | TokenResponse
          | { ok: false; code?: string };
        if (!response.ok || credentials.ok !== true) {
          throw new Error("LiveKit token request was denied.");
        }
        if (disposed) return;
        setCanManage(credentials.canManage);
        setAllowedSources(credentials.canPublishSources);
        await nextRoom.connect(credentials.serverUrl, credentials.token, {
          autoSubscribe: true,
        });
        if (disposed) {
          await nextRoom.disconnect();
          return;
        }
        await nextRoom.startAudio().catch(() => undefined);
        const canUseMic = credentials.canPublishSources.includes("microphone");
        if (canUseMic) {
          try {
            await nextRoom.localParticipant.setMicrophoneEnabled(true, {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            });
          } catch (error) {
            const name = error instanceof DOMException ? error.name : "";
            toast.error(
              name === "NotAllowedError"
                ? "Microphone permission was denied. You joined as a listener."
                : "Microphone could not be started. You joined as a listener.",
            );
            setMuted(true);
          }
        } else {
          setMuted(true);
        }
        const current = stateRef.current;
        await join({
          containerType,
          containerId,
          muted: !nextRoom.localParticipant.isMicrophoneEnabled,
          deafened: current.deafened,
          camera: false,
          sharing: false,
        });
        setMuted(!nextRoom.localParticipant.isMicrophoneEnabled);
        setConnectedAt(Date.now());
        await refreshDevices();
        heartbeat = window.setInterval(() => {
          const state = stateRef.current;
          void join({
            containerType,
            containerId,
            muted: state.muted,
            deafened: state.deafened,
            camera: state.camera,
            sharing: state.sharing,
          }).catch(() => undefined);
        }, 15_000);
        refresh();
      } catch (error) {
        if (disposed) return;
        toast.error(
          readableError(error, "Could not connect to LiveKit voice."),
        );
        signalLeave();
      }
    };
    void connect();

    return () => {
      disposed = true;
      signalLeave();
      if (heartbeat) window.clearInterval(heartbeat);
      void leave({ containerType, containerId }).catch(() => undefined);
      nextRoom.removeAllListeners();
      void nextRoom.disconnect(true);
      audioContainer?.replaceChildren();
      roomRef.current = null;
      setConnectedAt(null);
    };
  }, [active, containerId, containerType, issueTicket, join, leave, room]);

  const updateSeat = (patch: {
    muted?: boolean;
    deafened?: boolean;
    camera?: boolean;
    sharing?: boolean;
  }) => {
    void join({ containerType, containerId, ...patch }).catch(() => undefined);
  };

  const toggleMicrophone = async () => {
    if (!room || !allowedSources.includes("microphone")) return;
    try {
      const enabled = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled, {
        deviceId: selectedAudioInput || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      setMuted(!enabled);
      updateSeat({ muted: !enabled });
      refresh();
    } catch (error) {
      toast.error(readableError(error, "Could not change microphone state."));
    }
  };

  const toggleDeafen = async () => {
    const next = !deafened;
    setDeafened(next);
    if (next && room?.localParticipant.isMicrophoneEnabled) {
      await room.localParticipant
        .setMicrophoneEnabled(false)
        .catch(() => undefined);
      setMuted(true);
      updateSeat({ muted: true, deafened: true });
    } else {
      updateSeat({ deafened: next });
    }
  };

  const toggleCamera = async () => {
    if (!room || !allowedSources.includes("camera")) return;
    try {
      const enabled = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(enabled, {
        deviceId: selectedVideoInput || undefined,
        facingMode: "user",
      });
      setCameraEnabled(enabled);
      updateSeat({ camera: enabled });
      await refreshDevices();
      refresh();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      toast.error(
        name === "NotAllowedError"
          ? "Camera permission was denied."
          : readableError(error, "Could not start the camera."),
      );
    }
  };

  const toggleScreenShare = async () => {
    if (!room || !allowedSources.includes("screen_share")) return;
    try {
      const enabled = !room.localParticipant.isScreenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(
        enabled,
        {
          audio: allowedSources.includes("screen_share_audio"),
          video: true,
          resolution: SCREEN_SHARE_RESOLUTION,
          selfBrowserSurface: "include",
          surfaceSwitching: "include",
          systemAudio: "include",
          contentHint: "detail",
        },
        {
          screenShareEncoding: ScreenSharePresets.h720fps30.encoding,
          degradationPreference: "maintain-resolution",
        },
      );
      setSharing(enabled);
      updateSeat({ sharing: enabled });
      refresh();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        toast.error(readableError(error, "Could not start screen sharing."));
      }
    }
  };

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;
    try {
      await currentRoom.switchActiveDevice(kind, deviceId);
      if (kind === "audioinput") setSelectedAudioInput(deviceId);
      if (kind === "videoinput") setSelectedVideoInput(deviceId);
      if (kind === "audiooutput") setSelectedAudioOutput(deviceId);
    } catch (error) {
      toast.error(readableError(error, "Could not switch that device."));
    }
  };

  const moderate = async (
    targetUserId: string,
    action: "mute" | "disconnect",
    trackSid?: string,
  ) => {
    if (containerType !== "channel") return;
    try {
      const grant = await issueModerationTicket({
        channelId: containerId as Id<"channels">,
        targetUserId: targetUserId as Id<"users">,
        action,
        trackSid,
      });
      const response = await fetch("/api/livekit/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: grant.ticket }),
      });
      if (!response.ok) throw new Error("Voice moderation was denied.");
      toast.success(
        action === "mute" ? "Participant muted." : "Participant disconnected.",
      );
    } catch (error) {
      toast.error(readableError(error, "Could not moderate that participant."));
    }
  };

  if (!active) return null;

  const participants: Participant[] = room
    ? [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    : [];
  const userFor = (participant: Participant) => {
    const userId = participantUserId(participant);
    if (userId === me?.id) return me;
    return (
      (roster ?? []).find((entry) => entry.userId === userId)?.user ?? null
    );
  };
  const screenShares = participants
    .map((participant) => ({
      participant,
      publication: participant.getTrackPublication(Track.Source.ScreenShare),
    }))
    .filter(
      (
        entry,
      ): entry is { participant: Participant; publication: TrackPublication } =>
        Boolean(entry.publication?.track && !entry.publication.isMuted),
    );
  const connected = connection === ConnectionState.Connected;
  const statusLabel =
    connection === ConnectionState.Reconnecting
      ? "Reconnecting…"
      : connection === ConnectionState.Connecting
        ? "Connecting…"
        : connected
          ? "Voice connected"
          : "Disconnected";

  return (
    <section className="border-t border-border/70 bg-panel/95 shadow-[0_-12px_40px_rgba(0,0,0,.12)]">
      {screenShares.length > 0 && (
        <div className="border-b border-border/60 bg-black/70 p-2 sm:p-3">
          <div className="grid gap-2 lg:grid-cols-2">
            {screenShares.map(({ participant, publication }) => {
              const user = userFor(participant);
              return (
                <div
                  key={publication.trackSid}
                  className="group relative aspect-video overflow-hidden rounded-xl border border-primary/40 bg-black"
                >
                  <VideoPublication
                    publication={publication}
                    muted={participant === room?.localParticipant}
                    className="object-contain"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
                    {user?.name ?? participant.name ?? "Member"} · sharing
                  </span>
                  <button
                    type="button"
                    aria-label="View shared screen fullscreen"
                    className="absolute right-2 top-2 rounded-lg bg-black/70 p-2 text-white opacity-80 hover:opacity-100"
                    onClick={(event) =>
                      void event.currentTarget.parentElement?.requestFullscreen()
                    }
                  >
                    <Maximize className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {participants.some(
        (participant) =>
          participant.getTrackPublication(Track.Source.Camera)?.track &&
          !participant.getTrackPublication(Track.Source.Camera)?.isMuted,
      ) && (
        <div className="grid max-h-[42vh] grid-cols-1 gap-2 overflow-y-auto border-b border-border/60 bg-background/60 p-2 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((participant) => {
            const publication = participant.getTrackPublication(
              Track.Source.Camera,
            );
            if (!publication?.track || publication.isMuted) return null;
            const user = userFor(participant);
            return (
              <div
                key={participant.identity}
                className={cn(
                  "relative aspect-video overflow-hidden rounded-xl border bg-black",
                  participant.isSpeaking
                    ? "border-success ring-2 ring-success/35"
                    : "border-border/70",
                )}
              >
                <VideoPublication
                  publication={publication}
                  muted={participant === room?.localParticipant}
                />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {user?.name ?? participant.name ?? "Member"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:px-5">
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold",
            connected ? "text-success" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              connected ? "animate-pulse bg-success" : "bg-muted-foreground",
            )}
          />
          {statusLabel}
          {connectedAt && now > 0
            ? ` · ${formatDuration(now - connectedAt)}`
            : ""}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {participants.map((participant) => {
            const userId = participantUserId(participant);
            const user = userFor(participant);
            const mic = participant.getTrackPublication(
              Track.Source.Microphone,
            );
            const volume = volumes[userId] ?? 1;
            return (
              <div
                key={participant.identity}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-surface px-2 py-1.5",
                  participant.isSpeaking
                    ? "border-success/70 shadow-[0_0_0_2px_rgba(34,197,94,.16)]"
                    : "border-border/70",
                )}
              >
                {user ? (
                  <UserAvatar user={user} size="xs" />
                ) : (
                  <span className="size-6 rounded-full bg-panel" />
                )}
                <span className="max-w-24 truncate text-xs font-semibold">
                  {user?.name ?? participant.name ?? "Member"}
                </span>
                {mic?.isMuted !== false && (
                  <MicOff className="size-3 text-destructive" />
                )}
                {participant instanceof RemoteParticipant && (
                  <label className="hidden items-center gap-1 xl:flex">
                    <Volume2 className="size-3 text-muted-foreground" />
                    <input
                      aria-label={`Volume for ${user?.name ?? participant.name}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        participant.setVolume(next);
                        setVolumes((state) => ({ ...state, [userId]: next }));
                      }}
                      className="w-16 accent-primary"
                    />
                  </label>
                )}
                {canManage && participant instanceof RemoteParticipant && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Manage ${user?.name ?? participant.name}`}
                        className="rounded-md p-1 text-muted-foreground hover:bg-panel hover:text-foreground"
                      >
                        <Ellipsis className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!mic?.trackSid || mic.isMuted}
                        onClick={() =>
                          void moderate(userId, "mute", mic?.trackSid)
                        }
                      >
                        <MicOff className="mr-2 size-4" /> Server mute
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => void moderate(userId, "disconnect")}
                      >
                        <PhoneOff className="mr-2 size-4" /> Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={muted ? "default" : "outline"}
            className="h-9 px-2.5"
            disabled={!connected || !allowedSources.includes("microphone")}
            onClick={() => void toggleMicrophone()}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          <Button
            size="sm"
            variant={deafened ? "default" : "outline"}
            className="h-9 px-2.5"
            disabled={!connected}
            onClick={() => void toggleDeafen()}
            aria-label={deafened ? "Undeafen" : "Deafen"}
          >
            <Headphones className="size-4" />
          </Button>
          <Button
            size="sm"
            variant={cameraEnabled ? "default" : "outline"}
            className="h-9 px-2.5"
            disabled={!connected || !allowedSources.includes("camera")}
            onClick={() => void toggleCamera()}
            aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {cameraEnabled ? (
              <Video className="size-4" />
            ) : (
              <VideoOff className="size-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant={sharing ? "default" : "outline"}
            className="h-9 px-2.5"
            disabled={!connected || !allowedSources.includes("screen_share")}
            onClick={() => void toggleScreenShare()}
            aria-label={sharing ? "Stop screen sharing" : "Share screen"}
          >
            {sharing ? (
              <ScreenShareOff className="size-4" />
            ) : (
              <ScreenShare className="size-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-9 px-2.5"
            onClick={signalLeave}
            aria-label="Disconnect from voice"
          >
            <PhoneOff className="size-4" />
          </Button>
        </div>
      </div>

      {connected && (audioInputs.length > 0 || videoInputs.length > 0) && (
        <div className="grid gap-2 border-t border-border/60 px-3 py-2 sm:grid-cols-3 sm:px-5">
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Microphone
            <select
              value={selectedAudioInput}
              onChange={(event) =>
                void switchDevice("audioinput", event.target.value)
              }
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs normal-case tracking-normal text-foreground"
            >
              <option value="">System default</option>
              {audioInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "Microphone"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Camera
            <select
              value={selectedVideoInput}
              onChange={(event) =>
                void switchDevice("videoinput", event.target.value)
              }
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs normal-case tracking-normal text-foreground"
            >
              <option value="">System default</option>
              {videoInputs.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "Camera"}
                </option>
              ))}
            </select>
          </label>
          {supportsAudioOutputSelection() && audioOutputs.length > 0 && (
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Speakers
              <select
                value={selectedAudioOutput}
                onChange={(event) =>
                  void switchDevice("audiooutput", event.target.value)
                }
                className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs normal-case tracking-normal text-foreground"
              >
                <option value="">System default</option>
                {audioOutputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Speakers"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />
      {connection === ConnectionState.Connecting && (
        <span className="sr-only">
          <Loader2 className="animate-spin" /> Connecting to LiveKit
        </span>
      )}
    </section>
  );
}
