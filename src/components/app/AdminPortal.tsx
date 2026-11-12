import { useMutation, useQuery } from "convex/react";
import type {
  DefaultFunctionArgs,
  FunctionReference,
  FunctionVisibility,
} from "convex/server";
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Copy,
  Globe,
  Hash,
  Loader2,
  Mail,
  Monitor,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Users,
  Wrench,
  X,
} from "@/components/icons";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GLOBAL_BADGE_META,
  GlobalBadgeIcon,
  type GlobalBadgeKey,
} from "@/components/app/GlobalBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUG_CATEGORY_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

type AdminTab =
  | "overview"
  | "badges"
  | "reports"
  | "bugs"
  | "bans"
  | "warnings"
  | "email"
  | "activity"
  | "ips";

const TABS: { id: AdminTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "ips", label: "IP detector", icon: Globe },
  { id: "badges", label: "Badges", icon: Shield },
  { id: "reports", label: "Reports", icon: AlertTriangle },
  { id: "bugs", label: "Bugs", icon: Wrench },
  { id: "bans", label: "Bans", icon: Ban },
  { id: "warnings", label: "Warnings", icon: ShieldAlert },
  { id: "email", label: "Email", icon: Mail },
  { id: "activity", label: "Activity", icon: Clock },
];

/** Badge ids that can be granted from the portal, with their mutation key. */
type GrantableBadgeId =
  | "founder"
  | "cofounder"
  | "manager"
  | "admin"
  | "moderator"
  | "staff"
  | "trialstaff"
  | "verified"
  | "partner"
  | "donator"
  | "supporter"
  | "vip"
  | "bughunter"
  | "og";

const BADGE_FIELDS: {
  id: GrantableBadgeId;
  field:
    | "coFounder"
    | "manager"
    | "admin"
    | "moderator"
    | "staff"
    | "trialStaff"
    | "verified"
    | "partner"
    | "donator"
    | "supporter"
    | "vip"
    | "bugHunter"
    | "og"
    | "founder";
}[] = [
  { id: "founder", field: "founder" },
  { id: "cofounder", field: "coFounder" },
  { id: "manager", field: "manager" },
  { id: "admin", field: "admin" },
  { id: "moderator", field: "moderator" },
  { id: "staff", field: "staff" },
  { id: "trialstaff", field: "trialStaff" },
  { id: "verified", field: "verified" },
  { id: "partner", field: "partner" },
  { id: "donator", field: "donator" },
  { id: "supporter", field: "supporter" },
  { id: "vip", field: "vip" },
  { id: "bughunter", field: "bugHunter" },
  { id: "og", field: "og" },
];

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Kyro Admin Portal (`/dashboard/admin`).
 *
 * Signed-in staff — admins by role, moderators by badge — get badge
 * management, the report queue for users/messages/servers, bug triage,
 * platform bans, warnings and a full staff audit trail.
 */
export function AdminPortal() {
  const data = useQuery(api.admin.overview);
  // The badge and the Bugs tab read the same query result, so the indicator
  // can never advertise reports the tab refuses to show.
  const bugs = useQuery(api.bugReports.list);
  const [tab, setTab] = useState<AdminTab>("overview");
  const navigate = useNavigate();

  if (data === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data.allowed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" />
        </span>
        <p className="text-lg font-semibold">Staff only</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          The Admin Portal is available to Kyro admins and moderators. Sign in
          with a staff Kyro account to continue.
        </p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to Kyro
        </Button>
      </div>
    );
  }

  const openBugs =
    bugs === undefined
      ? data.counts.openBugs
      : bugs.filter(
          (bug) => bug.status === "open" || bug.status === "acknowledged",
        ).length;
  // The IP detector is a two-person tool, stricter than staff access.
  const visibleTabs = TABS.filter(
    (entry) => entry.id !== "ips" || data.canViewIps,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Portal header */}
      <div className="relative shrink-0 overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-brand/20 via-transparent to-cyan/15"
        />
        <div className="relative flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/30">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
              Kyro Staff
            </p>
            <h1 className="truncate text-lg font-semibold leading-tight">
              Admin Portal
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {data.me.platformRole === "founder" ? (
              <RolePill label="Founder" tone="brand" />
            ) : data.me.platformRole === "cofounder" ? (
              <RolePill label="Co Founder" tone="brand" />
            ) : data.me.platformRole === "manager" ? (
              <RolePill label="Manager" tone="rose" />
            ) : data.me.platformRole === "admin" ? (
              <RolePill label="Admin" tone="rose" />
            ) : data.me.platformRole === "moderator" ? (
              <RolePill label="Moderator" tone="emerald" />
            ) : data.me.platformRole === "staff" ? (
              <RolePill label="Staff" tone="emerald" />
            ) : (
              <RolePill label="Trial Staff · read only" tone="zinc" />
            )}
          </div>
        </div>
        <nav className="relative flex gap-1 overflow-x-auto px-3 pb-2">
          {visibleTabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === entry.id
                  ? "bg-surface font-medium text-foreground shadow-sm ring-1 ring-border/70"
                  : "text-muted-foreground hover:bg-surface/60 hover:text-foreground",
              )}
            >
              <entry.icon className="size-4" />
              {entry.label}
              {entry.id === "reports" && data.counts.openReports > 0 && (
                <span className="ml-0.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                  {data.counts.openReports}
                </span>
              )}
              {entry.id === "bugs" && openBugs > 0 && (
                <span className="ml-0.5 rounded-full bg-warning px-1.5 text-[10px] font-bold text-black/80">
                  {openBugs}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "overview" && <OverviewTab data={data} openBugs={openBugs} />}
        {tab === "ips" && data.canViewIps && <IpDetectorTab />}
        {tab === "badges" && (
          <BadgesTab isAdmin={data.me.isAdmin} isFounder={data.me.isFounder} />
        )}
        {tab === "reports" && (
          <ReportsTab isAdmin={data.me.isAdmin} canModerate={data.me.isStaff} />
        )}
        {tab === "bugs" && (
          <BugsTab
            isAdmin={data.me.isAdmin}
            canTriage={data.me.isStaff}
            bugs={bugs}
          />
        )}
        {tab === "bans" && <BansTab canModerate={data.me.isStaff} />}
        {tab === "warnings" && <WarningsTab canModerate={data.me.isStaff} />}
        {tab === "email" && <EmailDeliveryTab canModerate={data.me.isStaff} />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  );
}

function IpDetectorTab() {
  const directory = useQuery(api.admin.ipDirectory);
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  if (directory === undefined) return <Loading />;

  const needle = term.trim().toLowerCase();
  const users = directory.users.filter((entry) => {
    if (!needle) return true;
    return [entry.name, entry.username ?? "", entry.lastIp ?? ""].some(
      (value) => value.toLowerCase().includes(needle),
    );
  });

  const copyIp = (ip: string) => {
    void navigator.clipboard
      .writeText(ip)
      .then(() => {
        setCopied(ip);
        toast.success("IP address copied.");
        window.setTimeout(() => {
          setCopied((current) => (current === ip ? null : current));
        }, 2000);
      })
      .catch(() => toast.error("Could not copy the IP address."));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/30">
          <Globe className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">IP detector</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Client IP addresses captured on the heartbeat of real Kyro accounts.
            This section is restricted to Kyro and adrianeosyne; seeded accounts
            and staff viewers are never listed.
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-panel px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
          {directory.captured}/{directory.total} captured
        </span>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search name, username or IP…"
          className="pl-8"
        />
      </div>

      {users.length === 0 ? (
        <Empty
          text={
            needle
              ? "No real accounts match that search."
              : "No real accounts are available to list."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border/60 bg-panel/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Account</th>
                <th className="px-4 py-2.5 font-semibold">IP address</th>
                <th className="px-4 py-2.5 font-semibold">Captured</th>
                <th className="px-4 py-2.5 font-semibold">Last seen</th>
                <th className="px-4 py-2.5 font-semibold">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {users.map((entry) => {
                const ip = entry.lastIp;
                const DeviceIcon =
                  entry.device === "mobile"
                    ? Smartphone
                    : entry.device === "tablet"
                      ? Tablet
                      : Monitor;
                return (
                  <tr key={entry.id} className="hover:bg-panel/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            entry.online
                              ? "bg-success shadow-[0_0_0_3px] shadow-success/15"
                              : "bg-muted-foreground/30",
                          )}
                          title={entry.online ? "Online" : "Offline"}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{entry.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {entry.username
                              ? `@${entry.username}`
                              : "No username"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ip ? (
                        <button
                          type="button"
                          onClick={() => copyIp(ip)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-panel px-2 py-1 font-mono text-xs transition-colors hover:border-brand/50 hover:bg-brand/5"
                          title="Copy IP address"
                        >
                          <Globe className="size-3.5 text-muted-foreground" />
                          {ip}
                          {copied === ip ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Copy className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <span
                          className="text-xs font-medium text-warning"
                          title="This account has not sent an authenticated heartbeat since IP capture was enabled."
                        >
                          Awaiting heartbeat
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {entry.lastIpAt ? timeAgo(entry.lastIpAt) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {entry.online
                        ? "Online now"
                        : entry.lastSeen
                          ? timeAgo(entry.lastSeen)
                          : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                        <DeviceIcon className="size-4" />
                        {entry.device ?? "unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmailDeliveryTab({ canModerate }: { canModerate: boolean }) {
  const failures = useQuery(api.emailOutbox.failures);
  const retry = useMutation(api.emailOutbox.retry);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Email delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Failed SMTP deliveries are retained without exposing message content
          or recipient addresses. Retrying reuses the original event id so each
          delivery can be traced to its moderation action.
        </p>
      </div>
      {failures === undefined ? (
        <Loading />
      ) : failures.length === 0 ? (
        <Empty text="No failed transactional emails." />
      ) : (
        <div className="space-y-2">
          {failures.map((failure) => (
            <div
              key={failure.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-panel p-3"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {failure.template.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {failure.eventKey} · {failure.lastErrorCode} ·{" "}
                  {failure.attempts} attempt{failure.attempts === 1 ? "" : "s"}{" "}
                  · {timeAgo(failure.updatedAt)}
                </p>
              </div>
              <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                {failure.status}
              </span>
              {canModerate &&
              !["CODE_EXPIRED", "CODE_SUPERSEDED"].includes(
                failure.lastErrorCode,
              ) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => {
                    setBusyId(failure.id);
                    void retry({
                      outboxId: failure.id as Id<"emailOutbox">,
                    })
                      .then(() => toast.success("Email queued for retry."))
                      .catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not retry that email.",
                        ),
                      )
                      .finally(() => setBusyId(null));
                  }}
                >
                  {busyId === failure.id && (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Retry
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RolePill({
  label,
  tone,
}: {
  label: string;
  tone: "brand" | "rose" | "emerald" | "zinc";
}) {
  const tones = {
    brand: "border-brand/40 bg-brand/10 text-brand",
    rose: "border-destructive/40 bg-destructive/10 text-destructive",
    emerald: "border-success/40 bg-success/10 text-success",
    zinc: "border-border/70 bg-surface text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: typeof Users;
  tone?: "brand" | "rose" | "emerald" | "amber";
}) {
  const tones = {
    brand: "bg-brand/10 text-brand",
    rose: "bg-destructive/10 text-destructive",
    emerald: "bg-success/10 text-success",
    amber: "bg-warning/10 text-warning",
  } as const;
  return (
    <div className="rounded-xl border border-border/70 bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("rounded-md p-1.5", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Pull the return type out of a generated query reference, keeping overview
 * data typed straight from the backend without a runtime helper function.
 */
type QueryReturns<Ref> =
  Ref extends FunctionReference<
    "query",
    FunctionVisibility,
    DefaultFunctionArgs,
    infer Returns
  >
    ? Returns
    : never;

type OverviewData = Extract<
  NonNullable<QueryReturns<typeof api.admin.overview>>,
  { allowed: true }
>;

function OverviewTab({
  data,
  openBugs,
}: {
  data: OverviewData;
  /** Open + acknowledged bugs from the same list the Bugs tab renders. */
  openBugs: number;
}) {
  const me = useQuery(api.users.me);
  const removeAdmin = useMutation(api.users.removeMyAdminBadge);
  const restoreAdmin = useMutation(api.admin.restoreMyAdminBadge);
  const setFounderBadge = useMutation(api.users.setMyFounderBadge);
  const holdsAdmin = data.me.isAdmin && (me?.badges ?? []).includes("admin");
  const holdsFounder = (me?.badges ?? []).includes("founder");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Accounts"
          value={data.counts.users}
          hint={`${data.counts.online} online right now`}
          icon={Users}
        />
        <StatCard
          label="Communities"
          value={data.counts.servers}
          hint="across Kyro"
          icon={Hash}
          tone="emerald"
        />
        <StatCard
          label="Open reports"
          value={data.counts.openReports}
          hint="users, messages and servers"
          icon={AlertTriangle}
          tone="rose"
        />
        <StatCard
          label="Open bugs"
          value={openBugs}
          hint="from Bug Hunting"
          icon={Wrench}
          tone="amber"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active bans"
          value={data.counts.activeBans}
          hint="platform-wide"
          icon={Ban}
          tone="rose"
        />
        <StatCard
          label="Active warnings"
          value={data.counts.activeWarnings}
          hint="expire after 3 days"
          icon={ShieldAlert}
          tone="amber"
        />
        <StatCard label="Admins" value={data.counts.admins} icon={Shield} />
        <StatCard
          label="Moderators"
          value={data.counts.moderators}
          icon={ShieldCheck}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-xl border border-border/70 bg-surface">
          <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent staff activity</h2>
            <span className="text-xs text-muted-foreground">
              {data.recentActions.length} entries
            </span>
          </header>
          <ul className="divide-y divide-border/60">
            {data.recentActions.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">
                No staff actions logged yet.
              </li>
            )}
            {data.recentActions.map((action) => (
              <li key={action.id} className="flex gap-3 px-4 py-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">
                      {action.actor?.name ?? "Kyro staff"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {action.action.replace(/_/g, " ")}
                    </span>
                  </p>
                  {action.details && (
                    <p className="truncate text-xs text-muted-foreground">
                      {action.details}
                    </p>
                  )}
                </div>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {timeAgo(action.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border/70 bg-surface p-4">
          <h2 className="text-sm font-semibold">Your staff identity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Badges on your Kyro profile. Founder controls are exclusive to the
            Kyro founder account.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(me?.badges ?? []).map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-300/15 bg-[#11182a]/85 px-2.5 py-1.5 text-xs text-indigo-50 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
              >
                <GlobalBadgeIcon
                  badge={badge as GlobalBadgeKey}
                  className="size-4"
                />
                {GLOBAL_BADGE_META[badge as GlobalBadgeKey]?.label ?? badge}
              </span>
            ))}
            {(me?.badges ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">
                No global badges yet.
              </span>
            )}
          </div>

          {data.me.isFounder && (
            <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 p-3">
              <p className="text-sm font-semibold">Founder: Admin badge</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {holdsAdmin
                  ? "Your Admin badge is showing. You can hide it from your profile without giving up access."
                  : "Your Admin badge is hidden. Staff powers stay active — restore it whenever you like."}
              </p>
              <Button
                size="sm"
                variant={holdsAdmin ? "outline" : "default"}
                className="mt-2"
                onClick={() => {
                  const action = holdsAdmin
                    ? removeAdmin({}).then(() =>
                        toast.success("Admin badge hidden from your profile."),
                      )
                    : restoreAdmin({}).then(() =>
                        toast.success("Admin badge restored."),
                      );
                  void action.catch((error: unknown) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not update the badge.",
                    ),
                  );
                }}
              >
                {holdsAdmin ? "Remove from my profile" : "Restore Admin badge"}
              </Button>
            </div>
          )}

          {data.me.isFounder && (
            <div className="mt-3 rounded-lg border border-blue-400/30 bg-blue-500/5 p-3">
              <p className="text-sm font-semibold">Founder: Founder badge</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {holdsFounder
                  ? "Your Founder badge is showing. Hide it whenever you like — and grant it to members from the Badges tab."
                  : "Your Founder badge is hidden. Only you can ever hold or hand out this badge."}
              </p>
              <Button
                size="sm"
                variant={holdsFounder ? "outline" : "default"}
                className="mt-2"
                onClick={() => {
                  void setFounderBadge({ visible: !holdsFounder })
                    .then(() =>
                      toast.success(
                        holdsFounder
                          ? "Founder badge hidden from your profile."
                          : "Founder badge restored.",
                      ),
                    )
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not update the badge.",
                      ),
                    );
                }}
              >
                {holdsFounder
                  ? "Remove from my profile"
                  : "Restore Founder badge"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge management                                                    */
/* ------------------------------------------------------------------ */

function BadgesTab({
  isAdmin,
  isFounder,
}: {
  isAdmin: boolean;
  /** Only the Kyro founder can grant or revoke the Founder badge. */
  isFounder: boolean;
}) {
  const [term, setTerm] = useState("");
  const members = useQuery(api.admin.searchMembers, { term });
  const setBadges = useMutation(api.users.setBadges);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (
    userId: string,
    field: (typeof BADGE_FIELDS)[number]["field"],
    next: boolean,
  ) => {
    setBusyId(userId);
    try {
      await setBadges({
        userId: userId as Id<"users">,
        [field]: next,
      });
      toast.success("Badges updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update badges.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name or @username"
            className="pl-8"
            aria-label="Search accounts"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? "Grant or revoke platform badges. Founder accounts are protected."
            : "Badge changes are admin-only — you can review who holds what."}
        </p>
      </div>

      {members === undefined ? (
        <Loading />
      ) : members.length === 0 ? (
        <Empty text="No accounts matched that search." />
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-border/70 bg-surface p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {member.name}
                    {member.isFounder && (
                      <RolePill label="Founder" tone="brand" />
                    )}
                    {member.ban && <RolePill label="Banned" tone="rose" />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{member.username ?? "no username"} ·{" "}
                    {member.activeWarnings} active warning
                    {member.activeWarnings === 1 ? "" : "s"}
                    {member.lastSeen
                      ? ` · seen ${timeAgo(member.lastSeen)}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BADGE_FIELDS.map((badge) => {
                  const held = member.badges.includes(badge.id);
                  // The Founder badge is the founder's to hand out; nobody else
                  // — including other admins — can grant or strip it. Their own
                  // account badges are theirs to change too.
                  const locked = isFounder
                    ? false
                    : badge.id === "founder" || member.isFounder
                      ? true
                      : !isAdmin;
                  return (
                    <button
                      key={badge.id}
                      type="button"
                      disabled={locked || busyId === member.id}
                      onClick={() => void toggle(member.id, badge.field, !held)}
                      title={
                        locked
                          ? badge.id === "founder" || member.isFounder
                            ? "Only Kyro's founder can change these badges"
                            : "Only admins can change badges"
                          : held
                            ? "Revoke badge"
                            : "Grant badge"
                      }
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                        held
                          ? "border-indigo-300/25 bg-[#151d32] text-indigo-50 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
                          : "border-indigo-300/10 bg-[#11182a]/35 text-muted-foreground hover:border-indigo-300/25 hover:bg-[#151d32]/80 hover:text-indigo-50",
                        locked && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <GlobalBadgeIcon badge={badge.id} className="size-4" />
                      {GLOBAL_BADGE_META[badge.id].label}
                      {busyId === member.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : held ? (
                        <Check className="size-3" />
                      ) : (
                        <X className="size-3 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Report queue                                                        */
/* ------------------------------------------------------------------ */

function ReportsTab({
  isAdmin,
  canModerate,
}: {
  isAdmin: boolean;
  canModerate: boolean;
}) {
  const [status, setStatus] = useState<
    "open" | "reviewing" | "resolved" | "dismissed" | "all"
  >("open");
  const reports = useQuery(api.admin.reportQueue, {
    status: status === "all" ? undefined : status,
  });
  const resolve = useMutation(api.reports.resolve);
  const removeMessage = useMutation(api.admin.deleteMessage);
  const removeServer = useMutation(api.admin.removeServer);
  const banUser = useMutation(api.admin.banUser);

  const act = async (action: Promise<unknown>, message: string) => {
    try {
      await action;
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not complete that.",
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          aria-label="Filter reports"
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="open">Open</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All reports</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Reported users, messages and communities — resolve, remove or ban.
        </p>
      </div>

      {reports === undefined ? (
        <Loading />
      ) : reports.length === 0 ? (
        <Empty text="Nothing in this queue." />
      ) : (
        reports.map((report) => (
          <div
            key={report.id}
            className="rounded-xl border border-border/70 bg-surface p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  report.status === "open"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : report.status === "reviewing"
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : report.status === "resolved"
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border/70 bg-panel text-muted-foreground",
                )}
              >
                {report.status}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {report.reason}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(report.createdAt)}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {report.reporterName} reported{" "}
              {report.reportedName ??
                report.messageAuthorName ??
                (report.serverName
                  ? `community ${report.serverName}`
                  : "content")}
              {report.serverName ? ` in ${report.serverName}` : ""}
            </p>
            {report.details && (
              <p className="mt-1 rounded-md border border-border/60 bg-panel px-2 py-1.5 text-xs">
                {report.details}
              </p>
            )}
            {report.messageContent && (
              <p className="mt-1 rounded-md border border-border/60 bg-panel px-2 py-1.5 text-xs italic">
                “{report.messageContent.slice(0, 300)}”
              </p>
            )}

            {canModerate ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ActionButton
                  icon={Check}
                  label="Resolve"
                  tone="success"
                  onClick={() =>
                    void act(
                      resolve({
                        reportId: report.id as Id<"reports">,
                        status: "resolved",
                        resolution: "Reviewed by Kyro staff.",
                      }),
                      "Report resolved.",
                    )
                  }
                />
                <ActionButton
                  icon={X}
                  label="Dismiss"
                  onClick={() =>
                    void act(
                      resolve({
                        reportId: report.id as Id<"reports">,
                        status: "dismissed",
                        resolution: "No rule break found.",
                      }),
                      "Report dismissed.",
                    )
                  }
                />
                {report.messageId ? (
                  <ActionButton
                    icon={Trash2}
                    label="Delete message"
                    tone="danger"
                    onClick={() =>
                      void act(
                        removeMessage({
                          messageId: report.messageId as Id<"messages">,
                        }),
                        "Message deleted.",
                      )
                    }
                  />
                ) : null}
                {report.reportedId ? (
                  <ActionButton
                    icon={Ban}
                    label="Ban user"
                    tone="danger"
                    onClick={() =>
                      void act(
                        banUser({
                          userId: report.reportedId as Id<"users">,
                          reason: report.reason,
                          days: 7,
                        }),
                        "Account banned for 7 days.",
                      )
                    }
                  />
                ) : null}
                {report.serverId && isAdmin ? (
                  <ActionButton
                    icon={Trash2}
                    label="Delete community"
                    tone="danger"
                    onClick={() => {
                      if (!window.confirm("Delete this community permanently?"))
                        return;
                      void act(
                        removeServer({
                          serverId: report.serverId as Id<"servers">,
                        }),
                        "Community deleted.",
                      );
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Trial Staff access is read-only.
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bug triage                                                          */
/* ------------------------------------------------------------------ */

const BUG_STATUS = {
  open: { label: "Open", chip: "border-warning/40 bg-warning/10 text-warning" },
  acknowledged: {
    label: "Acknowledged",
    chip: "border-brand/40 bg-brand/10 text-brand",
  },
  fixed: {
    label: "Fixed",
    chip: "border-success/40 bg-success/10 text-success",
  },
  not_a_bug: {
    label: "Not a bug",
    chip: "border-border/70 bg-panel text-muted-foreground",
  },
} as const;

type BugStatus = keyof typeof BUG_STATUS;

function BugsTab({
  isAdmin,
  canTriage,
  bugs,
}: {
  isAdmin: boolean;
  canTriage: boolean;
  /** Shared with the tab badge so the count and the list always agree. */
  bugs: QueryReturns<typeof api.bugReports.list> | undefined;
}) {
  const update = useMutation(api.bugReports.updateStatus);
  const setBadges = useMutation(api.users.setBadges);

  if (bugs === undefined) return <Loading />;
  if (bugs.length === 0) return <Empty text="No bug reports found." />;

  return (
    <div className="space-y-2">
      {bugs.map((bug) => {
        const reporter = bug.reporter;
        return (
          <div
            key={bug.id}
            className="rounded-xl border border-border/70 bg-surface p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  BUG_STATUS[bug.status].chip,
                )}
              >
                {BUG_STATUS[bug.status].label}
              </span>
              <span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {BUG_CATEGORY_LABELS[bug.category] ?? "Other"}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {bug.title}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {bug.reporter ? `${bug.reporter.name} · ` : ""}
                {timeAgo(bug.createdAt)}
              </span>
            </div>
            {bug.details && (
              <p className="mt-1 text-xs text-muted-foreground">
                {bug.details}
              </p>
            )}
            {bug.staffNote && (
              <p className="mt-1 rounded-md border border-border/60 bg-panel px-2 py-1 text-xs">
                Staff note: {bug.staffNote}
              </p>
            )}
            {canTriage && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(BUG_STATUS) as BugStatus[]).map((next) => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => {
                      void update({
                        reportId: bug.id as Id<"bugReports">,
                        status: next,
                        staffNote: bug.staffNote ?? undefined,
                      })
                        .then(() => toast.success("Bug report updated."))
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not update that bug.",
                          ),
                        );
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      bug.status === next
                        ? "border-brand/50 bg-brand/10 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {BUG_STATUS[next].label}
                  </button>
                ))}
                {reporter && isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      void setBadges({
                        userId: reporter.id as Id<"users">,
                        bugHunter: true,
                      })
                        .then(() =>
                          toast.success(
                            `Bug Hunter badge granted to ${reporter.name}.`,
                          ),
                        )
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not grant that badge.",
                          ),
                        );
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning transition-colors hover:bg-warning/20"
                  >
                    <Wrench className="size-3" /> Grant Bug Hunter
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bans                                                                */
/* ------------------------------------------------------------------ */

function BansTab({ canModerate }: { canModerate: boolean }) {
  const bans = useQuery(api.admin.banList);
  const [term, setTerm] = useState("");
  const [target, setTarget] = useState<{
    id: string;
    name: string;
    username: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const results = useQuery(api.admin.searchMembers, {
    term: term.length >= 2 ? term : undefined,
  });
  const banUser = useMutation(api.admin.banUser);
  const unbanUser = useMutation(api.admin.unbanUser);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await banUser({
        userId: target.id as Id<"users">,
        reason,
        days: days === 0 ? undefined : days,
      });
      toast.success(`${target.name} was banned.`);
      setTarget(null);
      setTerm("");
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not ban that account.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "grid gap-4",
        canModerate ? "lg:grid-cols-[1fr_1.1fr]" : "",
      )}
    >
      {canModerate ? (
        <section className="rounded-xl border border-border/70 bg-surface p-4">
          <h2 className="text-sm font-semibold">Issue a platform ban</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bans stop messaging, community creation and friend requests until
            lifted or expired.
          </p>

          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={target ? `${target.name}` : term}
              onChange={(event) => {
                setTarget(null);
                setTerm(event.target.value);
              }}
              placeholder="Search an account"
              className="pl-8"
              aria-label="Find an account to ban"
            />
          </div>

          {!target && term.length >= 2 && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/70 bg-panel">
              {results === undefined ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Searching…
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No accounts matched.
                </p>
              ) : (
                results.slice(0, 8).map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setTarget({
                        id: member.id,
                        name: member.name,
                        username: member.username,
                      });
                      setTerm("");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {member.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      @{member.username ?? "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="mt-3 grid gap-2">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason shown to the member"
              maxLength={300}
              aria-label="Ban reason"
            />
            <div className="flex items-center gap-2">
              <select
                value={days}
                aria-label="Ban length"
                onChange={(event) => setDays(Number(event.target.value))}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={0}>Permanent</option>
              </select>
              <Button
                disabled={!target || busy || reason.trim().length < 3}
                onClick={() => void submit()}
              >
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Ban account
              </Button>
            </div>
            {target && (
              <p className="text-xs text-muted-foreground">
                Target: <span className="font-medium">{target.name}</span>
                {target.username ? ` (@${target.username})` : ""}
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border/70 bg-surface">
        <header className="border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold">Ban history</h2>
        </header>
        {bans === undefined ? (
          <Loading />
        ) : bans.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No platform bans have been issued.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {bans.map((ban) => (
              <li key={ban.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {ban.userName}
                    {ban.username ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        @{ban.username}
                      </span>
                    ) : null}
                  </p>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      ban.active
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border/70 text-muted-foreground",
                    )}
                  >
                    {ban.active
                      ? ban.expiresAt
                        ? "Temporary"
                        : "Permanent"
                      : "Lifted"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ban.reason} · by {ban.bannedByName} ·{" "}
                  {timeAgo(ban.createdAt)}
                </p>
                {ban.active && canModerate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1.5"
                    onClick={() => {
                      void unbanUser({ banId: ban.id as Id<"siteBans"> })
                        .then(() => toast.success("Ban lifted."))
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not lift that ban.",
                          ),
                        );
                    }}
                  >
                    Lift ban
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Warnings + activity                                                 */
/* ------------------------------------------------------------------ */

function WarningsTab({ canModerate }: { canModerate: boolean }) {
  const warnings = useQuery(api.admin.warningList);
  const lift = useMutation(api.admin.liftWarning);
  if (warnings === undefined) return <Loading />;
  if (warnings.length === 0) {
    return <Empty text="No active warnings across Kyro." />;
  }
  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <div
          key={warning.id}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {warning.userName}
              {warning.username ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  @{warning.username}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {warning.reason} · by {warning.issuedByName} · expires{" "}
              {new Date(warning.expiresAt).toLocaleDateString()}
            </p>
          </div>
          {canModerate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void lift({ warningId: warning.id as Id<"warnings"> })
                  .then(() => toast.success("Warning cleared."))
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not clear that warning.",
                    ),
                  );
              }}
            >
              Clear warning
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActivityTab() {
  const actions = useQuery(api.admin.actionLog);
  if (actions === undefined) return <Loading />;
  if (actions.length === 0)
    return <Empty text="No staff actions logged yet." />;
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
      <ul className="divide-y divide-border/60">
        {actions.map((action) => (
          <li key={action.id} className="flex flex-wrap gap-2 px-4 py-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{action.actorName}</span>{" "}
                <span className="text-muted-foreground">
                  {action.action.replace(/_/g, " ")}
                </span>
                {action.targetType ? ` · ${action.targetType}` : ""}
              </p>
              {action.details && (
                <p className="truncate text-xs text-muted-foreground">
                  {action.details}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {new Date(action.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "success" | "danger";
}) {
  const tones = {
    neutral: "border-border/70 text-muted-foreground hover:text-foreground",
    success: "border-success/40 text-success hover:bg-success/10",
    danger: "border-destructive/40 text-destructive hover:bg-destructive/10",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        tones[tone],
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
