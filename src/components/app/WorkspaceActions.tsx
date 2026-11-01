import { useQuery } from "convex/react";
import { Bell, PanelRight, Search } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { useUiStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function WorkspaceActions({
  showMemberToggle = false,
  className,
}: {
  showMemberToggle?: boolean;
  className?: string;
}) {
  const unread = useQuery(api.notifications.unreadCount);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const inboxOpen = useUiStore((state) => state.inboxOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const setInboxOpen = useUiStore((state) => state.setInboxOpen);
  const toggleMemberList = useUiStore((state) => state.toggleMemberList);

  const button =
    "relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label="Search Kyro"
        title="Search Kyro"
        onClick={() => setSearchOpen(!searchOpen)}
        className={button}
      >
        <Search className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Inbox"
        title="Inbox"
        onClick={() => setInboxOpen(!inboxOpen)}
        className={button}
      >
        <Bell className="size-5" />
        {(unread ?? 0) > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {unread! > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {showMemberToggle && (
        <button
          type="button"
          aria-label="Toggle member list"
          title="Toggle member list"
          onClick={toggleMemberList}
          className={button}
        >
          <PanelRight className="size-5" />
        </button>
      )}
    </div>
  );
}
