import { useMutation, useQuery } from "convex/react";
import { Bell, Check, Hash, Loader2, MessagesSquare } from "@/components/icons";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Composer } from "@/components/app/Composer";
import { MemberList } from "@/components/app/MemberList";
import {
  MessageList,
  type MessageDto,
  type ReplyTarget,
} from "@/components/app/MessageList";
import { ReportDialog } from "@/components/app/dialogs";
import { DmCallHeader } from "@/components/app/Voice";
import { LiveKitVoiceRoomLoader as VoiceRoom } from "@/components/app/LiveKitVoiceRoomLoader";
import { UserAvatar } from "@/components/app/UserAvatar";
import { WorkspaceActions } from "@/components/app/WorkspaceActions";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useUiStore } from "@/lib/store";

type SurfaceProps = {
  containerType: "channel" | "conversation";
  containerId: string;
  title: string;
  titleUser?: {
    name: string;
    displayNameFont?: string | null;
    displayNameColorMode?: "none" | "solid" | "gradient" | null;
    displayNameColor?: string | null;
    displayNameColor2?: string | null;
  };
  subtitle?: string | null;
  icon: ReactNode;
  /** Users shown in the header for a DM. */
  participants?: { id: string; name: string; avatarUrl?: string | null }[];
  canManageMessages: boolean;
  disabledReason?: string | null;
  roleColors?: Record<string, string>;
  /** Owner of the server (channel surfaces only) — their crown badge. */
  serverOwnerId?: string;
  /** Rendered to the right of the conversation header. */
  headerAction?: ReactNode;
  /** People offered after typing @, and used to open mentioned profiles. */
  mentionUsers?: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl?: string | null;
  }[];
  allowMassMentions?: boolean;
};

/** Shared conversation surface: header, history, typing strip and composer. */
function ChatSurface({
  containerType,
  containerId,
  title,
  titleUser,
  subtitle,
  icon,
  participants,
  canManageMessages,
  disabledReason,
  roleColors,
  serverOwnerId,
  headerAction,
  mentionUsers = [],
  allowMassMentions = false,
}: SurfaceProps) {
  const me = useQuery(api.users.me);
  const markRead = useMutation(api.messages.markContainerRead);
  // DMs can carry a live voice call; the header drives it and the strip below
  // the header carries the audio + controls while it's connected.
  const dmCall = useQuery(
    api.voice.currentCall,
    containerType === "conversation"
      ? { conversationId: containerId as Id<"conversations"> }
      : "skip",
  );
  const endCall = useMutation(api.voice.endCall);
  const callActive =
    dmCall !== null &&
    dmCall !== undefined &&
    (dmCall.isCaller || dmCall.answeredAt !== null);
  const typing = useQuery(api.messages.typingList, {
    containerType,
    containerId,
  });
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [report, setReport] = useState<{
    reportedUserId?: string;
    messageId?: string;
    targetLabel?: string;
  } | null>(null);
  const [, setParams] = useSearchParams();

  // Tapping a participant in a DM opens their full profile preview —
  // banner, bio, badges and mutual friends/communities.
  const openProfile = (userId: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("previewUser", userId);
      return next;
    });
  };

  // Opening (or switching) a conversation clears its unread badge.
  useEffect(() => {
    void markRead({ containerType, containerId }).catch(() => undefined);
  }, [containerType, containerId, markRead]);

  const typers = (typing ?? []).map((user) => user.name);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-panel/90 px-4 shadow-sm backdrop-blur-xl">
        <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-muted-foreground ring-1 ring-border/60">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-tight">
            {titleUser ? (
              <StyledDisplayName user={titleUser} name={title} />
            ) : (
              title
            )}
          </p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {participants && participants.length > 0 && (
          <div className="flex -space-x-2">
            {participants.slice(0, 5).map((user) => (
              <button
                key={user.id}
                type="button"
                title={`View ${user.name}'s profile`}
                onClick={() => openProfile(user.id)}
                className="rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <UserAvatar user={user} size="xs" />
              </button>
            ))}
          </div>
        )}
        {containerType === "conversation" && (
          <DmCallHeader conversationId={containerId} />
        )}
        {containerType === "channel" && (
          <ChannelNotificationControl channelId={containerId} />
        )}
        <WorkspaceActions showMemberToggle={containerType === "channel"} />
        {headerAction}
      </div>

      {containerType === "conversation" && callActive && dmCall && (
        <VoiceRoom
          containerType="conversation"
          containerId={containerId}
          active
          onLeave={() => {
            void endCall({ callId: dmCall.id as Id<"calls"> }).catch(
              () => undefined,
            );
          }}
        />
      )}

      <MessageList
        containerType={containerType}
        containerId={containerId}
        canManageMessages={canManageMessages}
        currentUserId={me?.id ?? ""}
        onReply={setReply}
        onReport={(message: MessageDto) =>
          setReport({
            reportedUserId: message.authorId,
            messageId: message.id,
            targetLabel: message.author?.name,
          })
        }
        roleColors={roleColors}
        serverOwnerId={serverOwnerId}
        mentionUsers={mentionUsers}
      />

      <div className="h-5 shrink-0 px-4 text-xs text-muted-foreground">
        {typers.length > 0 && (
          <span className="italic">
            {typers.slice(0, 3).join(", ")}
            {typers.length > 3 ? " and others" : ""}{" "}
            {typers.length === 1 ? "is" : "are"} typing…
          </span>
        )}
      </div>

      <Composer
        containerType={containerType}
        containerId={containerId}
        reply={reply}
        onCancelReply={() => setReply(null)}
        disabledReason={disabledReason ?? null}
        mentionUsers={mentionUsers}
        allowMassMentions={allowMassMentions}
      />

      <ReportDialog
        open={report !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setReport(null);
        }}
        reportedUserId={report?.reportedUserId}
        messageId={report?.messageId}
        targetLabel={report?.targetLabel}
      />

      {/* Keeps the report dialog mounted only while the surface is shown. */}
    </div>
  );
}

function ChannelNotificationControl({ channelId }: { channelId: string }) {
  const level = useQuery(api.notifications.channelPreference, {
    channelId: channelId as Id<"channels">,
  });
  const setLevel = useMutation(api.notifications.setChannelPreference);
  const options = [
    { id: "all", label: "Every message" },
    { id: "mentions", label: "Mentions only" },
    { id: "none", label: "Nothing" },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Channel notifications"
          title="Channel notifications"
          className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Bell className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() =>
              void setLevel({
                channelId: channelId as Id<"channels">,
                level: option.id,
              })
                .then(() => toast.success("Notification preference saved."))
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not save notifications.",
                  ),
                )
            }
          >
            <span className="flex-1">{option.label}</span>
            {level === option.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CenteredNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** A text channel inside a community. */
export function ChannelChat({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) {
  const channels = useQuery(api.channels.list, {
    serverId: serverId as Id<"servers">,
  });
  const members = useQuery(api.servers.members, {
    serverId: serverId as Id<"servers">,
  });
  const memberListOpen = useUiStore((state) => state.memberListOpen);

  if (channels === undefined) {
    return <CenteredNote>Loading channel…</CenteredNote>;
  }

  const channel = channels.channels.find((entry) => entry.id === channelId);
  if (!channel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Hash className="size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">Channel not found</p>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or you may no longer have access.
        </p>
      </div>
    );
  }

  // Voice channels have their own stage view — sending a text-channel URL
  // there (an old link, a shared invite) lands on /c/, so bounce to /v/.
  if (channel.kind === "voice") {
    return <Navigate to={`/dashboard/s/${serverId}/v/${channelId}`} replace />;
  }

  const canManageMessages = hasPermission(
    channel.permissions ?? channels.permissions,
    PERMISSIONS.MANAGE_MESSAGES,
  );
  const allowMassMentions =
    channels.isOwner ||
    hasPermission(
      channel.permissions ?? channels.permissions,
      PERMISSIONS.MENTION_EVERYONE,
    );
  const roleColors: Record<string, string> = {};
  let serverOwnerId: string | undefined;
  const serverMembers = [
    ...(members?.online ?? []),
    ...(members?.offline ?? []),
  ];
  for (const member of serverMembers) {
    if (member.topRoleColor) roleColors[member.user.id] = member.topRoleColor;
    if (member.isOwner) serverOwnerId = member.user.id;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <ChatSurface
          containerType="channel"
          containerId={channel.id}
          title={channel.name}
          subtitle={channel.topic}
          icon={<Hash className="size-4" />}
          canManageMessages={canManageMessages}
          serverOwnerId={serverOwnerId}
          disabledReason={
            channel.readOnly && !canManageMessages
              ? "This channel is read-only."
              : null
          }
          roleColors={roleColors}
          mentionUsers={serverMembers.map((member) => member.user)}
          allowMassMentions={allowMassMentions}
        />
      </div>
      {memberListOpen && <MemberList serverId={serverId} />}
    </div>
  );
}

/** A direct message (or group DM) conversation. */
export function DirectChat({ conversationId }: { conversationId: string }) {
  const conversation = useQuery(api.conversations.get, {
    conversationId: conversationId as Id<"conversations">,
  });
  const me = useQuery(api.users.me);

  if (conversation === undefined) {
    return <CenteredNote>Loading conversation…</CenteredNote>;
  }
  if (conversation === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <MessagesSquare className="size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">Conversation unavailable</p>
        <p className="text-sm text-muted-foreground">
          You are no longer a participant in this conversation.
        </p>
      </div>
    );
  }

  const others = conversation.participants.filter(
    (participant) => participant.id !== me?.id,
  );
  const title =
    conversation.name ??
    (others.length > 0
      ? others.map((user) => user.name).join(", ")
      : "Conversation");

  return (
    <ChatSurface
      containerType="conversation"
      containerId={conversation.id}
      title={title}
      titleUser={conversation.type === "dm" ? others[0] : undefined}
      subtitle={
        conversation.type === "group"
          ? `${conversation.participants.length} members`
          : null
      }
      icon={<MessagesSquare className="size-4" />}
      participants={others}
      mentionUsers={conversation.participants}
      canManageMessages
    />
  );
}
