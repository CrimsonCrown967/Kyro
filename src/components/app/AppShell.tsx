import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Home,
  Loader2,
  Menu,
  PanelRight,
  Search,
  User,
} from "@/components/icons";
import { useEffect, useRef, type ReactNode } from "react";
import {
  useLocation,
  useMatch,
  useNavigate,
  useSearchParams,
} from "react-router";
import { api } from "@/convex/_generated/api";
import { ClaimUsername } from "@/components/app/ClaimUsername";
import { Inbox } from "@/components/app/Inbox";
import { ProfileCard } from "@/components/app/ProfileCard";
import { SearchOverlay } from "@/components/app/SearchOverlay";
import { ServerRail } from "@/components/app/ServerRail";
import { SettingsDialog } from "@/components/app/Settings";
import { Sidebar } from "@/components/app/Sidebar";
import { IncomingCallBanner } from "@/components/app/Voice";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useUiStore } from "@/lib/store";
import { playNotificationPing } from "@/lib/sound";
import { cn } from "@/lib/utils";

/**
 * Best-effort device class for the platform indicator. Tablet first, since
 * large Android/iPad tablets report neither `Mobile` nor a phone UA.
 */
function detectDevice(): "desktop" | "mobile" | "tablet" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua))
  ) {
    return "tablet";
  }
  if (/Mobi|Android|iPhone|iPod|Windows Phone|webOS|BlackBerry/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * The application frame: community rail, channel sidebar and the routed
 * conversation area. It also owns global concerns — presence heartbeat,
 * keyboard shortcuts, search, the inbox and user settings.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const heartbeat = useMutation(api.users.heartbeat);
  const unread = useQuery(
    api.notifications.unreadCount,
    isAuthenticated ? {} : "skip",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    mobileNavOpen,
    setMobileNav,
    searchOpen,
    setSearchOpen,
    inboxOpen,
    setInboxOpen,
  } = useUiStore();

  const channelMatch = useMatch("/dashboard/s/:serverId/c/:channelId");
  const serverMatch = useMatch("/dashboard/s/:serverId");
  const activeServerId =
    channelMatch?.params.serverId ?? serverMatch?.params.serverId;
  const settingsOpen = searchParams.get("settings") !== null;

  // Presence heartbeat: keeps this account visible as online for others.
  // Fires immediately, every 15s, and whenever the tab comes back to the
  // foreground so idle background tabs never look offline to other people.
  // Each tick also reports which device we're on, powering the platform
  // indicator (phone / tablet / desktop) shown next to every profile.
  useEffect(() => {
    if (!isAuthenticated) return;
    const tick = () => {
      void heartbeat({ device: detectDevice() }).catch(() => undefined);
    };
    tick();
    const interval = window.setInterval(tick, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [heartbeat, isAuthenticated]);

  // Notification ping: fires when unread notifications arrive while the tab
  // is in the background — gated by the "Notification sounds" menu toggle.
  const prevUnread = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (unread === undefined) return;
    const previous = prevUnread.current;
    prevUnread.current = unread;
    if (
      previous !== undefined &&
      unread > previous &&
      document.hidden &&
      useUiStore.getState().notificationSounds
    ) {
      playNotificationPing();
    }
  }, [unread]);

  // Global shortcuts: ⌘K opens search, Esc closes overlays.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(!useUiStore.getState().searchOpen);
      }
      if (event.key === "Escape") {
        const state = useUiStore.getState();
        state.setSearchOpen(false);
        state.setInboxOpen(false);
        state.setMobileNav(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSearchOpen]);

  if (isLoading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Onboarding gate: Kyro needs a unique handle before you can talk.
  if (me && !me.hasUsername) return <ClaimUsername />;

  const openSettings = () => {
    const next = new URLSearchParams(searchParams);
    next.set("settings", "1");
    setSearchParams(next, { replace: false });
  };

  const rail = <ServerRail activeServerId={activeServerId} />;
  const sidebar = (
    <Sidebar activeServerId={activeServerId} onOpenSettings={openSettings} />
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:flex">{rail}</div>
      <div className="hidden md:flex">{sidebar}</div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-panel/95 px-2 backdrop-blur sm:px-3">
          <button
            type="button"
            aria-label="Open navigation"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground md:hidden"
            onClick={() => setMobileNav(true)}
          >
            <Menu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 flex-1 items-center gap-2 rounded-full border border-border/70 bg-surface px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:max-w-md sm:rounded-md"
          >
            <Search className="size-4" />
            <span className="truncate">Search Kyro</span>
            <span className="ml-auto hidden rounded border border-border/70 px-1.5 text-[11px] sm:inline">
              ⌘K
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Inbox"
              onClick={() => setInboxOpen(!inboxOpen)}
              className="relative rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <Bell className="size-5" />
              {(unread ?? 0) > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {unread! > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="Toggle member list"
              onClick={() => useUiStore.getState().toggleMemberList()}
              className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground md:block"
            >
              <PanelRight className="size-5" />
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="hidden md:inline-flex"
              onClick={openSettings}
            >
              Settings
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>

        {/* Phone-first dock: large touch targets, safe-area padding and one
            thumb-reachable route to every core surface. Account/status tools
            remain in the navigation sheet's UserBar. */}
        <nav className="grid shrink-0 grid-cols-5 border-t border-border/70 bg-panel/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden">
          {[
            {
              label: "Home",
              icon: Home,
              active: location.pathname === "/dashboard",
              action: () => navigate("/dashboard"),
            },
            {
              label: "Servers",
              icon: Menu,
              active: location.pathname.includes("/dashboard/s/"),
              action: () => setMobileNav(true),
            },
            {
              label: "Inbox",
              icon: Bell,
              active: inboxOpen,
              action: () => setInboxOpen(true),
            },
            {
              label: "Search",
              icon: Search,
              active: searchOpen,
              action: () => setSearchOpen(true),
            },
            {
              label: "You",
              icon: User,
              active: settingsOpen,
              action: openSettings,
            },
          ].map((entry) => (
            <button
              key={entry.label}
              type="button"
              onClick={entry.action}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors",
                entry.active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground active:bg-surface active:text-foreground",
              )}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Mobile navigation drawer keeps the rail + sidebar reachable. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNav}>
        <SheetContent
          side="left"
          className="w-[92vw] max-w-sm gap-0 border-r-border/70 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full">
            <div className="w-14 shrink-0 overflow-y-auto">{rail}</div>
            <div className="min-w-0 flex-1">{sidebar}</div>
          </div>
        </SheetContent>
      </Sheet>

      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
      <Inbox open={inboxOpen} onOpenChange={setInboxOpen} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            const next = new URLSearchParams(searchParams);
            next.delete("settings");
            setSearchParams(next, { replace: true });
          }
        }}
      />
      {/* Profile popups are opened by adding ?user=<id> anywhere in the app. */}
      <ProfileCard />
      {/* A ringing DM call surfaces over every view of the app. */}
      <IncomingCallBanner />
    </div>
  );
}
