import { useQuery } from "convex/react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar, DeviceBadge } from "@/components/app/UserAvatar";
import { ServerTagChip } from "@/components/app/ServerTag";
import { CrownBadge } from "@/components/app/CrownBadge";
import { InlineBadge } from "@/components/app/GlobalBadges";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { Input } from "@/components/ui/input";
import type { PresenceState } from "@/lib/format";
import { cn } from "@/lib/utils";

type Member = {
  user: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    presence: PresenceState;
    customStatus: string | null;
    isFounder?: boolean;
    /** Global badges (hydrated server-side) — chosen/highest shown inline. */
    badges?: string[];
    /** The badge this member picked to show next to their name. */
    primaryBadge?: string | null;
    /** Community tag worn next to the name, e.g. "HTML". */
    serverTag?: string | null;
    /** Device this member is on, for the platform indicator. */
    device?: string | null;
    displayNameFont?: string | null;
    displayNameColorMode?: "none" | "solid" | "gradient" | null;
    displayNameColor?: string | null;
    displayNameColor2?: string | null;
  };
  nickname: string | null;
  isOwner: boolean;
  topRoleColor: string | null;
  topRoleName: string;
};

/** Right-hand roster for a community. Clicking someone opens their profile. */
export function MemberList({ serverId }: { serverId: string }) {
  const data = useQuery(api.servers.members, {
    serverId: serverId as Id<"servers">,
  });
  const [term, setTerm] = useState("");
  const [, setParams] = useSearchParams();

  const openProfile = (userId: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("previewUser", userId);
      return next;
    });
  };

  const matches = (member: Member) => {
    const needle = term.trim().toLowerCase();
    if (!needle) return true;
    return (
      member.user.name.toLowerCase().includes(needle) ||
      (member.user.username ?? "").toLowerCase().includes(needle) ||
      (member.nickname ?? "").toLowerCase().includes(needle)
    );
  };

  if (data === undefined) {
    return (
      <aside className="hidden w-72 shrink-0 border-l border-border/70 bg-panel/90 p-4 text-sm text-muted-foreground lg:block">
        Loading members…
      </aside>
    );
  }

  const online = data.online.filter(matches);
  const offline = data.offline.filter(matches);

  const row = (member: Member) => (
    // A div (not a button) because the tag chip inside is its own button —
    // nested buttons are invalid HTML and made clicks miss the row.
    <div
      key={member.user.id}
      role="button"
      tabIndex={0}
      aria-label={`Open ${member.nickname ?? member.user.name}'s profile`}
      data-profile-user={member.user.id}
      onClick={() => openProfile(member.user.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProfile(member.user.id);
        }
      }}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <UserAvatar user={member.user} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <StyledDisplayName
            user={member.user}
            name={member.nickname ?? member.user.name}
            roleColor={member.topRoleColor}
            className="truncate text-sm"
          />
          {member.user.badges && member.user.badges.length > 0 ? (
            <InlineBadge
              badges={member.user.badges}
              primaryBadge={member.user.primaryBadge}
            />
          ) : member.isOwner ? (
            <CrownBadge label="Server owner" />
          ) : null}
          {member.user.serverTag && (
            <ServerTagChip
              tag={member.user.serverTag}
              ownerName={member.user.name}
            />
          )}
          <DeviceBadge device={member.user.device} />
        </span>
        {member.user.customStatus && (
          <span className="block truncate text-xs text-muted-foreground">
            {member.user.customStatus}
          </span>
        )}
      </span>
    </div>
  );

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-border/70 bg-panel/90 shadow-[-6px_0_24px_rgba(0,0,0,.06)] backdrop-blur-xl lg:flex">
      <div className="border-b border-border/60 p-3.5">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search members"
          className="h-8 text-xs"
          aria-label="Search members"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          online · {online.length}
        </p>
        {online.map(row)}
        {offline.length > 0 && (
          <p className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            offline · {offline.length}
          </p>
        )}
        {offline.map(row)}
        {online.length === 0 && offline.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No members matched.
          </p>
        )}
      </div>
      <p
        className={cn(
          "border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground",
        )}
      >
        {data.online.length + data.offline.length} member
        {data.online.length + data.offline.length === 1 ? "" : "s"}
      </p>
    </aside>
  );
}
