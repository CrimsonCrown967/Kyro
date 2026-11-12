import { useQuery } from "convex/react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import { ArrowLeft, Hash, Loader2 } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPortal } from "@/components/app/AdminPortal";
import { AppShell } from "@/components/app/AppShell";
import { ChannelChat, DirectChat } from "@/components/app/ChatView";
import { DiscoverView } from "@/components/app/DiscoverView";
import { FriendsView } from "@/components/app/Friends";
import { ForumChannelPage } from "@/components/app/ForumChannelPage";
import { MembershipGate } from "@/components/app/MembershipGate";
import { ServerSettings } from "@/components/app/ServerSettings";
import { ServerThemeScope } from "@/components/app/ServerThemeScope";
import { VoiceChannelPage } from "@/components/app/VoiceChannelPage";
import { Button } from "@/components/ui/button";
import Developers from "./Developers";
import BotDirectory, { BotAuthorization } from "./BotDirectory";

/** The signed-in product: everything lives inside the AppShell frame and is
 *  routed underneath it — friends home, DMs, community channels and the
 *  community settings panel.
 */
export default function Dashboard() {
  return (
    // Boundary outside the shell so a crash in the frame itself (rail,
    // sidebar, user bar) also lands on a friendly card instead of the raw
    // preview-runtime-error stack.
    <RouteErrorBoundary>
      <AppShell>
        <Routes>
          <Route index element={<FriendsView />} />
          <Route path="discover" element={<DiscoverView />} />
          <Route path="developers/:applicationId?" element={<Developers />} />
          <Route
            path="bots/authorize/:applicationId"
            element={<BotAuthorization />}
          />
          <Route path="bots/:applicationId?" element={<BotDirectory />} />
          {/* Staff console — admins and moderators sign in with their Kyro
            account; the page itself gates access server-side. */}
          <Route path="admin" element={<AdminPortal />} />
          <Route path="dm" element={<Navigate to="/dashboard" replace />} />
          <Route path="dm/:conversationId" element={<DirectChatRoute />} />
          <Route path="s/:serverId" element={<ServerIndexRoute />} />
          <Route path="s/:serverId/c/:channelId" element={<ChannelRoute />} />
          <Route
            path="s/:serverId/v/:channelId"
            element={<VoiceChannelRoute />}
          />
          <Route
            path="s/:serverId/f/:channelId"
            element={<ForumChannelRoute />}
          />
          <Route
            path="s/:serverId/settings/*"
            element={<ServerSettingsRoute />}
          />
          {/* Wildcard must be last: any unknown slug within the dashboard falls back
            to the current community instead of a hard 404. */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>
    </RouteErrorBoundary>
  );
}

/**
 * Route-scoped error boundary: a friendly card with a way out, keyed by path
 * so navigating away clears the failure.
 */
class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Route] render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-semibold">This page hit an error</p>
        <p className="max-w-md break-words text-xs text-muted-foreground">
          {this.state.error.message || "Something went wrong while loading it."}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
          <Button
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign("/dashboard");
            }}
          >
            <ArrowLeft className="mr-1.5 size-4" /> Back to Kyro
          </Button>
        </div>
      </div>
    );
  }
}

function DirectChatRoute() {
  const { conversationId } = useParams();
  if (!conversationId) return <Navigate to="/dashboard" replace />;
  return <DirectChat conversationId={conversationId} />;
}

function ChannelRoute() {
  const { serverId, channelId } = useParams();
  if (!serverId || !channelId) return <Navigate to="/dashboard" replace />;
  return (
    // The gate sits outside the theme scope: the theme query itself demands
    // membership, so it must not run until the gate has confirmed it.
    <MembershipGate serverId={serverId}>
      <ServerThemeScope serverId={serverId as Id<"servers">}>
        <ChannelChat serverId={serverId} channelId={channelId} />
      </ServerThemeScope>
    </MembershipGate>
  );
}

function VoiceChannelRoute() {
  const { serverId, channelId } = useParams();
  if (!serverId || !channelId) return <Navigate to="/dashboard" replace />;
  return (
    <MembershipGate serverId={serverId}>
      <ServerThemeScope serverId={serverId as Id<"servers">}>
        <VoiceChannelPage
          key={channelId}
          serverId={serverId}
          channelId={channelId}
        />
      </ServerThemeScope>
    </MembershipGate>
  );
}

function ForumChannelRoute() {
  const { serverId, channelId } = useParams();
  if (!serverId || !channelId) return <Navigate to="/dashboard" replace />;
  return (
    <MembershipGate serverId={serverId}>
      <ServerThemeScope serverId={serverId as Id<"servers">}>
        <ForumChannelPage serverId={serverId} channelId={channelId} />
      </ServerThemeScope>
    </MembershipGate>
  );
}

function ServerSettingsRoute() {
  const { serverId } = useParams();
  if (!serverId) return <Navigate to="/dashboard" replace />;
  return (
    <MembershipGate serverId={serverId}>
      <ServerThemeScope serverId={serverId as Id<"servers">}>
        <ServerSettings serverId={serverId} />
      </ServerThemeScope>
    </MembershipGate>
  );
}

/** Landing on a community drops you into its first readable channel. */
function ServerIndexRoute() {
  const { serverId } = useParams();
  if (!serverId) return <Navigate to="/dashboard" replace />;
  // Gate first — `channels.list` throws for anyone who isn't a member yet.
  return (
    <MembershipGate serverId={serverId}>
      <ServerIndexContent />
    </MembershipGate>
  );
}

function ServerIndexContent() {
  const { serverId } = useParams();
  const channels = useQuery(
    api.channels.list,
    serverId ? { serverId: serverId as Id<"servers"> } : "skip",
  );

  if (!serverId) return <Navigate to="/dashboard" replace />;

  if (channels === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Prefer a text channel as the landing view; fall back to the first voice
  // channel (routed through /v/) when that's all the community has.
  const firstText = channels.channels.find(
    (channel) => channel.kind === "text",
  );
  const firstForum = channels.channels.find(
    (channel) => channel.kind === "forum",
  );
  const first = firstText ?? firstForum ?? channels.channels[0];
  if (first)
    return (
      <Navigate
        to={`/dashboard/s/${serverId}/${first.kind === "voice" ? "v" : first.kind === "forum" ? "f" : "c"}/${first.id}`}
        replace
      />
    );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Hash className="size-6 text-muted-foreground" />
      <p className="text-sm font-semibold">No channels yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        This community doesn't have any channels. Create the first one from the
        sidebar, or invite people to start the conversation.
      </p>
    </div>
  );
}
