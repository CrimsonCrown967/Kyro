import { useMutation, useQuery } from "convex/react";
import { Bell, Home, Loader2, Menu, Search, User } from "@/components/icons";
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
import { UserPreviewPanel } from "@/components/app/UserPreviewPanel";
import { SearchOverlay } from "@/components/app/SearchOverlay";
import { ServerRail } from "@/components/app/ServerRail";
import { SettingsDialog } from "@/components/app/Settings";
import { Sidebar } from "@/components/app/Sidebar";
import { IncomingCallBanner } from "@/components/app/Voice";
import { ConnectionBanner } from "@/components/app/ConnectionBanner";
import { QuickAppearance } from "@/components/app/QuickAppearance";
import { KyroMark } from "@/components/KyroMark";
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
  const mentionSummary = useQuery(
    api.notifications.mentionSummary,
    isAuthenticated ? {} : "skip",
  );
  const mentionCount = mentionSummary?.count;
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
  const voiceMatch = useMatch("/dashboard/s/:serverId/v/:channelId");
  const forumMatch = useMatch("/dashboard/s/:serverId/f/:channelId");
  const serverSettingsMatch = useMatch("/dashboard/s/:serverId/settings/*");
  const serverMatch = useMatch("/dashboard/s/:serverId");
  const activeServerId =
    channelMatch?.params.serverId ??
    voiceMatch?.params.serverId ??
    forumMatch?.params.serverId ??
    serverSettingsMatch?.params.serverId ??
    serverMatch?.params.serverId;
  const settingsOpen = searchParams.get("settings") !== null;

  // Presence heartbeat: keeps this account visible as online for others.
  // Fires immediately, every 60s, and whenever the tab comes back to the
  // foreground so idle background tabs never look offline to other people.
  // Each tick also reports which device we're on, powering the platform
  // indicator (phone / tablet / desktop) shown next to every profile.
  useEffect(() => {
    if (!isAuthenticated) return;
    let inFlight = false;
    let lastSent = 0;
    const tick = () => {
      const now = Date.now();
      if (inFlight || now - lastSent < 45_000) return;
      inFlight = true;
      lastSent = now;
      void heartbeat({ device: detectDevice() })
        .catch(() => {
          lastSent = 0;
        })
        .finally(() => {
          inFlight = false;
        });
    };
    tick();
    const interval = window.setInterval(tick, 60_000);
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

  // Mention ping: only direct mentions/replies make a sound. Unlike the old
  // unread counter this also works while the tab is visible, Discord-style.
  const previousMentionEvent = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (mentionSummary === undefined) return;
    const latest = mentionSummary.latestCreationTime;
    const previous = previousMentionEvent.current;
    previousMentionEvent.current = latest;
    if (
      previous !== undefined &&
      latest !== null &&
      (previous === null || latest > previous) &&
      useUiStore.getState().notificationSounds
    ) {
      playNotificationPing();
    }
  }, [mentionSummary]);

  // Browser tab title mirrors unread mentions only, Discord-style: "(6) Kyro".
  // Ordinary unread DMs and system notes deliberately stay out of the count.
  useEffect(() => {
    document.title =
      mentionCount !== undefined && mentionCount > 0
        ? `(${mentionCount}) Kyro`
        : "Kyro";
  }, [mentionCount]);

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

  // A selected destination should be visible immediately on phones.
  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname, location.search, setMobileNav]);

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
  const desktopTitle = location.pathname.startsWith("/dashboard/admin")
    ? "Admin Portal"
    : location.pathname.startsWith("/dashboard/discover")
      ? "Discover"
      : location.pathname.startsWith("/dashboard/developers")
        ? "Developer portal"
        : location.pathname.startsWith("/dashboard/bots")
          ? "Bot directory"
          : location.pathname === "/dashboard"
            ? "Friends"
            : activeServerId
              ? "Community"
              : "Direct Messages";

  return (
    <div className="kyro-app-shell flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="hidden h-14 shrink-0 items-center gap-5 border-b border-border/70 bg-rail px-5 md:flex">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          aria-label="Kyro home"
          className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"
        >
          <KyroMark className="size-7" /> kyro
          <span className="text-primary">.</span>
        </button>
        <span className="h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground">{desktopTitle}</span>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-auto flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Search Kyro"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Find your next conversation</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px]">
            Ctrl K
          </kbd>
        </button>
        <span className="hidden text-[10px] font-medium tracking-[.16em] text-muted-foreground xl:block">
          YOUR PEOPLE. YOUR PLACE.
        </span>
        <QuickAppearance />
        <button
          type="button"
          aria-label="Inbox"
          title="Inbox"
          onClick={() => setInboxOpen(!inboxOpen)}
          className="relative rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Bell className="size-4" />
          {(unread ?? 0) > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive" />
          ) : null}
        </button>
      </div>
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">{rail}</div>
        <div className="hidden md:flex">{sidebar}</div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-panel/90 px-2 backdrop-blur-xl md:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              onClick={() => setMobileNav(true)}
            >
              <Menu className="size-5" />
            </button>

            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold">
              <KyroMark className="size-6" /> Kyro
            </span>

            <div className="ml-auto flex items-center gap-1">
              <QuickAppearance />
              <button
                type="button"
                aria-label="Search Kyro"
                onClick={() => setSearchOpen(true)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Search className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Inbox"
                onClick={() => setInboxOpen(!inboxOpen)}
                className="relative rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                <Bell className="size-5" />
                {(unread ?? 0) > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {unread! > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 bg-background">{children}</main>

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
      </div>

      {/* Mobile navigation drawer keeps the rail + sidebar reachable. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNav}>
        <SheetContent
          side="left"
          className="w-[92vw] max-w-sm gap-0 border-r-border/70 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full">
            <div className="w-[76px] shrink-0 overflow-y-auto">{rail}</div>
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
      <UserPreviewPanel />
      <ProfileCard />
      {/* A ringing DM call surfaces over every view of the app. */}
      <IncomingCallBanner />
    </div>
  );
}
