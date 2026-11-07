import { useQuery } from "convex/react";
import { useSearchParams } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserAvatar, DeviceBadge } from "@/components/app/UserAvatar";
import { ServerTagChip } from "@/components/app/ServerTag";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import type { PresenceState } from "@/lib/format";

type Member = {
  user: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    presence: PresenceState;
    customStatus: string | null;
    isFounder?: boolean;
    official?: boolean;
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
  const [, setParams] = useSearchParams();

  const openProfile = (userId: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("previewUser", userId);
      next.set("previewServer", serverId);
      return next;
    });
  };

  if (data === undefined) {
    return (
      <aside className="hidden w-[20.5rem] shrink-0 border-l border-border/70 bg-panel p-4 text-sm text-muted-foreground lg:block">
        Loading members…
      </aside>
    );
  }

  const groupedOnline = new Map<string, Member[]>();
  for (const member of data.online) {
    const label = member.isOwner ? "Owner" : member.topRoleName || "Online";
    const group = groupedOnline.get(label) ?? [];
    group.push(member);
    groupedOnline.set(label, group);
  }

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
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <UserAvatar user={member.user} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <StyledDisplayName
            user={member.user}
            name={member.nickname ?? member.user.name}
            roleColor={member.topRoleColor}
            className="truncate text-[15px] font-semibold"
          />
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
    <aside className="hidden w-[20.5rem] shrink-0 flex-col border-l border-border/70 bg-panel lg:flex">
      <div
        aria-hidden
        className="h-[3.75rem] shrink-0 border-b border-border/70"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        {[...groupedOnline.entries()].map(([label, members]) => (
          <section key={label} className="mb-4 last:mb-0">
            <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {label} — {members.length}
            </p>
            <div className="space-y-0.5">{members.map(row)}</div>
          </section>
        ))}
        {data.offline.length > 0 ? (
          <section className="mt-4">
            <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Offline — {data.offline.length}
            </p>
            <div className="space-y-0.5 opacity-55">
              {data.offline.map(row)}
            </div>
          </section>
        ) : null}
        {data.online.length === 0 && data.offline.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No members yet.
          </p>
        ) : null}
      </div>
      <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        {data.online.length + data.offline.length} member
        {data.online.length + data.offline.length === 1 ? "" : "s"}
      </p>
    </aside>
  );
}
