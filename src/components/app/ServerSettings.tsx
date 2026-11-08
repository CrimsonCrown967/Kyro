import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Hash,
  Link2,
  Loader2,
  MessagesSquare,
  Palette,
  Pencil,
  Plus,
  Settings,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from "@/components/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import { StyledDisplayName } from "@/components/app/StyledDisplayName";
import { ImageCropDialog } from "@/components/app/ImageCropDialog";
import { CrownBadge } from "@/components/app/CrownBadge";
import {
  AutoModEvents,
  AutoModSettings,
  JoinApplicationSettings,
} from "@/components/app/ServerSafetySettings";
import {
  ModerateMemberDialog,
  ModerationCaseActivity,
} from "@/components/app/ServerModeration";
import { ServerConfigurationExport } from "@/components/app/ServerConfigurationExport";
import { BotSettings } from "@/components/app/BotSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNow } from "@/hooks/use-now";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { InviteDialog } from "@/components/app/dialogs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import {
  ALL_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  DEFAULT_ROLE_COLORS,
  PERMISSIONS,
  PERMISSION_META,
  hasPermission,
} from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, useUploadFile } from "@/lib/upload";
import { inviteUrl, siteOrigin } from "@/lib/site";
import { cn } from "@/lib/utils";

type TabId =
  | "overview"
  | "theme"
  | "channels"
  | "roles"
  | "emojis"
  | "bots"
  | "members"
  | "invites"
  | "bans"
  | "reports"
  | "audit"
  | "danger";

const SETTINGS_TABS: readonly TabId[] = [
  "overview",
  "theme",
  "channels",
  "roles",
  "emojis",
  "bots",
  "members",
  "invites",
  "bans",
  "reports",
  "audit",
  "danger",
];

function settingsTabFromPath(pathname: string): TabId {
  const parts = pathname.split("/").filter(Boolean);
  const segment = parts[parts.length - 1] ?? "";
  return SETTINGS_TABS.includes(segment as TabId)
    ? (segment as TabId)
    : "overview";
}

/**
 * Server settings (`/dashboard/s/:id/settings/*`). Every tab hits the real
 * backend: overview edits, icon/banner uploads, roles with permissions,
 * invite links, bans, the audit log and deletion.
 */
export function ServerSettings({ serverId }: { serverId: string }) {
  const server = useQuery(api.servers.get, {
    serverId: serverId as Id<"servers">,
  });
  const now = useNow(30_000);
  const update = useMutation(api.servers.update);
  const remove = useMutation(api.servers.remove);
  const setVanity = useMutation(api.servers.setVanity);
  const setLocked = useMutation(api.servers.setLocked);
  const navigate = useNavigate();
  const location = useLocation();
  const channels = useQuery(api.channels.list, {
    serverId: serverId as Id<"servers">,
  });
  const upload = useUploadFile();

  const [form, setForm] = useState({
    name: "",
    description: "",
    rules: "",
    welcomeMessage: "",
    isPublic: true,
    tags: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"icon" | "banner" | null>(null);
  const [cropRequest, setCropRequest] = useState<{
    file: File;
    kind: "icon" | "banner";
  } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [vanityDraft, setVanityDraft] = useState("");
  const [vanityBusy, setVanityBusy] = useState(false);
  const [serverTagDraft, setServerTagDraft] = useState("");
  const [linksDraft, setLinksDraft] = useState<
    { label: string; url: string }[]
  >([]);
  const [linksBusy, setLinksBusy] = useState(false);

  // Seed the form whenever the query resolves or the server changes. Done
  // during render (React's supported "adjust state on prop change" pattern)
  // so switching servers never keeps the previous server's edits.
  const seedKey = server
    ? `${server.id}:${server.name}:${server.isPublic}:${server.tags.join("|")}:${server.vanityCode ?? ""}`
    : "";
  const [seededKey, setSeededKey] = useState("");
  if (server && seededKey !== seedKey) {
    setSeededKey(seedKey);
    setForm({
      name: server.name,
      description: server.description ?? "",
      rules: server.rules ?? "",
      welcomeMessage: server.welcomeMessage ?? "",
      isPublic: server.isPublic,
      tags: [...server.tags],
    });
    setVanityDraft(server.vanityCode ?? "");
    setServerTagDraft(server.tag ?? "");
    setLinksDraft(server.links);
  }

  if (server === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canManage = hasPermission(
    server.permissions,
    PERMISSIONS.MANAGE_SERVER,
  );
  const canRoles = hasPermission(server.permissions, PERMISSIONS.MANAGE_ROLES);
  const canKick = hasPermission(server.permissions, PERMISSIONS.KICK_MEMBERS);
  const canBans = hasPermission(server.permissions, PERMISSIONS.BAN_MEMBERS);
  const canModerate =
    canManage ||
    canBans ||
    hasPermission(server.permissions, PERMISSIONS.MANAGE_MESSAGES);
  const canChannels = hasPermission(
    server.permissions,
    PERMISSIONS.MANAGE_CHANNELS,
  );
  const canInvites = hasPermission(
    server.permissions,
    PERMISSIONS.CREATE_INVITES,
  );
  const canAudit = hasPermission(
    server.permissions,
    PERMISSIONS.VIEW_AUDIT_LOG,
  );
  const canEmojis =
    hasPermission(server.permissions, PERMISSIONS.MANAGE_EMOJIS) || canManage;

  const TABS: {
    id: TabId;
    label: string;
    show: boolean;
    icon: typeof Settings;
  }[] = [
    { id: "overview", label: "Overview", show: canManage, icon: Settings },
    { id: "theme", label: "Theme", show: canManage, icon: Palette },
    { id: "channels", label: "Channels", show: canChannels, icon: Hash },
    { id: "roles", label: "Roles", show: canRoles, icon: Shield },
    { id: "emojis", label: "Emojis", show: canEmojis, icon: MessagesSquare },
    { id: "bots", label: "Bots & commands", show: canManage, icon: Bot },
    {
      id: "members",
      label: "Members",
      show: canRoles || canKick || canModerate,
      icon: Users,
    },
    { id: "invites", label: "Invites", show: canInvites, icon: Link2 },
    { id: "bans", label: "Bans", show: canBans, icon: Ban },
    {
      id: "reports",
      label: "Reports",
      show: canModerate,
      icon: MessagesSquare,
    },
    { id: "audit", label: "Audit log", show: canAudit, icon: Eye },
    {
      id: "danger",
      label: "Danger zone",
      show: server.isOwner,
      icon: AlertTriangle,
    },
  ];
  const visibleTabs = TABS.filter((entry) => entry.show);
  const requestedTab = settingsTabFromPath(location.pathname);
  const activeTab = visibleTabs.some((entry) => entry.id === requestedTab)
    ? requestedTab
    : (visibleTabs[0]?.id ?? "overview");
  const openTab = (nextTab: TabId) => {
    navigate(`/dashboard/s/${serverId}/settings/${nextTab}`);
  };

  const save = async () => {
    if (saving) return;
    if (form.name.trim().length < 2) {
      toast.error("Server names are 2–64 characters.");
      return;
    }
    setSaving(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        name: form.name.trim(),
        description: form.description.trim(),
        rules: form.rules.trim(),
        welcomeMessage: form.welcomeMessage.trim(),
        isPublic: form.isPublic,
        tags: form.tags,
      });
      toast.success("Server updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (
    kind: "icon" | "banner",
    file: File | undefined,
  ) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Images must be under 10 MB.");
      return;
    }
    setUploading(kind);
    try {
      const attachment = await upload(file);
      await update({
        serverId: serverId as Id<"servers">,
        [kind === "icon" ? "iconStorageId" : "bannerStorageId"]:
          attachment.storageId,
      });
      toast.success(
        kind === "icon" ? "Server icon updated." : "Banner updated.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const requestImageCrop = (
    kind: "icon" | "banner",
    file: File | undefined,
  ) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Images must be under 10 MB.");
      return;
    }
    setCropRequest({ file, kind });
  };

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase();
    if (!tag) return;
    if (form.tags.length >= 5) {
      toast.error("Servers can have up to 5 tags.");
      return;
    }
    if (form.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    setForm({ ...form, tags: [...form.tags, tag] });
    setTagDraft("");
  };

  const saveVanity = async () => {
    if (vanityBusy) return;
    setVanityBusy(true);
    try {
      await setVanity({
        serverId: serverId as Id<"servers">,
        code: vanityDraft,
      });
      toast.success(
        vanityDraft.trim()
          ? `Custom invite link saved: /invite/${vanityDraft.trim().toLowerCase()}`
          : "Custom invite link removed.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that link.",
      );
    } finally {
      setVanityBusy(false);
    }
  };

  const saveTag = async (override?: string) => {
    const tag = (override ?? serverTagDraft).trim();
    try {
      await update({
        serverId: serverId as Id<"servers">,
        tag: tag || null,
      });
      toast.success(tag ? "Server tag saved." : "Server tag removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that tag.",
      );
    }
  };

  const saveLinks = async () => {
    if (linksBusy) return;
    const rows = linksDraft
      .filter((link) => link.label.trim() && link.url.trim())
      .map((link) => {
        const url = link.url.trim();
        return {
          label: link.label.trim(),
          url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
        };
      });
    setLinksBusy(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        links: rows,
      });
      toast.success("Links saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save links.",
      );
    } finally {
      setLinksBusy(false);
    }
  };

  const lockFor = async (durationMs?: number) => {
    try {
      await setLocked({
        serverId: serverId as Id<"servers">,
        locked: true,
        durationMs,
      });
      toast.success(
        durationMs ? "Community locked." : "Locked until you unlock it.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not lock the community.",
      );
    }
  };

  const unlockNow = async () => {
    try {
      await setLocked({ serverId: serverId as Id<"servers">, locked: false });
      toast.success("Community unlocked.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not unlock the community.",
      );
    }
  };

  const updateServer = async (
    patch: {
      verificationLevel?: "none" | "low" | "medium" | "high";
      minAccountAgeMs?: number | null;
      rulesChannelId?: Id<"channels"> | null;
    },
    success: string,
  ) => {
    try {
      await update({ serverId: serverId as Id<"servers">, ...patch });
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that.",
      );
    }
  };

  const destroy = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await remove({
        serverId: serverId as Id<"servers">,
        confirm: confirmName.trim(),
      });
      toast.success(`${server.name} was deleted.`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete server.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Community hero: identity, live numbers and the way back. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative overflow-hidden border-b border-border/60"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-brand/20 via-transparent to-cyan/15"
        />
        {server.bannerUrl && (
          <img
            src={server.bannerUrl}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-30"
          />
        )}
        <div className="relative mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(`/dashboard/s/${serverId}`)}
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to {server.name}
          </button>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-cyan text-lg font-bold text-white shadow-md">
              {server.iconUrl ? (
                <img
                  src={server.iconUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                server.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold leading-tight">
                  {server.name}
                </h1>
                {server.tag && (
                  <span className="rounded border border-border/70 bg-panel px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {server.tag}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    server.locked
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border/70 text-muted-foreground",
                  )}
                >
                  {server.locked
                    ? "Locked"
                    : server.isPublic
                      ? "Public"
                      : "Private"}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" />
                  {server.onlineCount} online
                </span>
                <span className="flex items-center gap-1">
                  <User className="size-3.5" /> {server.memberCount} members
                </span>
                <span>
                  {server.isOwner
                    ? "You own this community"
                    : "You can manage this community"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 py-6 sm:px-6">
        {/* Section rail */}
        <nav className="hidden w-56 shrink-0 flex-col gap-1.5 md:flex">
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Community settings
          </p>
          <div className="flex flex-col gap-0.5 rounded-2xl border border-border/60 bg-panel p-1.5">
            {visibleTabs.map((entry) => {
              const Icon = entry.icon;
              const active = activeTab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => openTab(entry.id)}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="server-settings-active-tab"
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 42,
                      }}
                      className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-border/70"
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative size-4 shrink-0 transition-colors",
                      active
                        ? entry.id === "danger"
                          ? "text-destructive"
                          : "text-brand"
                        : "text-muted-foreground",
                    )}
                  />
                  <span className="relative truncate">{entry.label}</span>
                  {active && (
                    <ChevronRight className="relative ml-auto size-3.5 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="min-w-0 flex-1"
        >
          {/* Mobile section picker */}
          {visibleTabs.length > 0 && (
            <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
              {visibleTabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => openTab(entry.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    activeTab === entry.id
                      ? "border-brand/40 bg-brand/10 font-medium text-foreground"
                      : "border-border/70 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === "overview" && (
            <section className="rounded-xl border border-border/70 bg-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Quick actions</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    The places you visit most, one click away.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/dashboard/s/${serverId}`)}
                  >
                    <Eye className="mr-1.5 size-4" /> Open community
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openTab("invites")}
                  >
                    <Link2 className="mr-1.5 size-4" /> Invite people
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openTab("theme")}
                  >
                    <Palette className="mr-1.5 size-4" /> Appearance
                  </Button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "overview" && (
            <section className="rounded-xl border border-border/70 bg-panel p-5">
              <h2 className="text-sm font-semibold">Images</h2>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand to-cyan text-sm font-bold text-white">
                  {server.iconUrl ? (
                    <img
                      src={server.iconUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    server.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-surface px-3 py-2 text-sm hover:bg-surface/70">
                  {uploading === "icon" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {server.iconUrl ? "Change icon" : "Upload icon"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      requestImageCrop("icon", event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {server.iconUrl && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void update({
                        serverId: serverId as Id<"servers">,
                        iconStorageId: null,
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="mt-4">
                <div className="h-24 w-full overflow-hidden rounded-lg border border-border/70 bg-gradient-to-br from-brand to-cyan">
                  {server.bannerUrl && (
                    <img
                      src={server.bannerUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-surface px-3 py-2 text-sm hover:bg-surface/70">
                  {uploading === "banner" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {server.bannerUrl ? "Change banner" : "Upload banner"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      requestImageCrop("banner", event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                {server.bannerUrl && (
                  <Button
                    variant="outline"
                    className="ml-2"
                    onClick={() =>
                      void update({
                        serverId: serverId as Id<"servers">,
                        bannerStorageId: null,
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>

              <h2 className="mt-7 text-sm font-semibold">Overview</h2>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="server-name">Name</Label>
                  <Input
                    id="server-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    maxLength={64}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="server-description">Description</Label>
                  <Textarea
                    id="server-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder="What is this server about?"
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="server-welcome">Welcome message</Label>
                  <Textarea
                    id="server-welcome"
                    value={form.welcomeMessage}
                    onChange={(event) =>
                      setForm({ ...form, welcomeMessage: event.target.value })
                    }
                    placeholder="Shown to new members after they join."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="server-rules">Rules</Label>
                  <Textarea
                    id="server-rules"
                    value={form.rules}
                    onChange={(event) =>
                      setForm({ ...form, rules: event.target.value })
                    }
                    placeholder="One rule per line."
                    rows={4}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Discoverable</p>
                    <p className="text-xs text-muted-foreground">
                      Anyone can find and join this server.
                    </p>
                  </div>
                  <Switch
                    checked={form.isPublic}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, isPublic: checked })
                    }
                    aria-label="Discoverable"
                  />
                </div>

                {/* Preview stats: exactly what Discovery cards show. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-surface px-3 py-2.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-success" />
                    {server.onlineCount} online
                  </span>
                  <span>{server.memberCount} members</span>
                  <span>
                    Est.{" "}
                    {new Date(server.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <h2 className="mt-7 text-sm font-semibold">Discovery tags</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                How your server appears in invite links and Discovery. People
                search these — up to 5.
              </p>
              <div className="mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface px-2.5 py-1 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                        onClick={() =>
                          setForm({
                            ...form,
                            tags: form.tags.filter((t) => t !== tag),
                          })
                        }
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {form.tags.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No tags yet — add a few below.
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="e.g. gaming, coding, chill"
                    maxLength={24}
                    className="flex-1"
                    aria-label="New tag"
                  />
                  <Button variant="outline" onClick={addTag}>
                    <Plus className="mr-1 size-4" /> Add tag
                  </Button>
                </div>
              </div>

              <h2 className="mt-7 text-sm font-semibold">Custom invite link</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a memorable link for your server. Letters, numbers, dashes
                and underscores.
              </p>
              <div className="mt-3 rounded-md border border-border/60 bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {siteOrigin()}/invite/
                  </span>
                  <Input
                    value={vanityDraft}
                    onChange={(event) =>
                      setVanityDraft(event.target.value.toLowerCase())
                    }
                    placeholder="my-server"
                    maxLength={24}
                    className="h-8 w-44 flex-1"
                    aria-label="Custom invite code"
                  />
                  <Button
                    size="sm"
                    onClick={() => void saveVanity()}
                    disabled={
                      vanityBusy ||
                      (vanityDraft ?? "") === (server.vanityCode ?? "")
                    }
                  >
                    {vanityBusy && (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    )}
                    Save link
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {server.vanityCode
                      ? `Current: ${inviteUrl(server.vanityCode)}`
                      : "No custom link yet — your default invite code still works."}
                  </span>
                  {server.vanityCode && (
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-1 hover:text-foreground"
                      onClick={() => {
                        const vanity = server.vanityCode;
                        if (!vanity) return;
                        void navigator.clipboard
                          .writeText(inviteUrl(vanity))
                          .then(() => toast.success("Link copied."))
                          .catch(() =>
                            toast.error(
                              "Clipboard access was blocked by the browser.",
                            ),
                          );
                      }}
                    >
                      <Copy className="size-3.5" /> Copy
                    </button>
                  )}
                </div>
              </div>
              <h2 className="mt-7 text-sm font-semibold">Server tag</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                2 to 4 letters or numbers. Members can wear it next to their
                name everywhere on Kyro (Settings → Profile).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider">
                  {server.tag ?? "—"}
                </span>
                <Input
                  value={serverTagDraft}
                  onChange={(event) =>
                    setServerTagDraft(event.target.value.toUpperCase())
                  }
                  placeholder="HTML"
                  maxLength={4}
                  className="h-9 w-32"
                  aria-label="Server tag"
                />
                <Button
                  size="sm"
                  disabled={
                    serverTagDraft.trim().length < 2 ||
                    serverTagDraft === (server.tag ?? "")
                  }
                  onClick={() => void saveTag()}
                >
                  Save
                </Button>
                {server.tag && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void saveTag("")}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <h2 className="mt-7 text-sm font-semibold">Links</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Shown on your community profile and Discovery card — up to 5.
              </p>
              <div className="mt-3 space-y-2">
                {linksDraft.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={link.label}
                      placeholder="Label (e.g. Website)"
                      maxLength={32}
                      className="w-40 flex-none"
                      onChange={(event) => {
                        const next = [...linksDraft];
                        next[index] = {
                          ...next[index],
                          label: event.target.value,
                        };
                        setLinksDraft(next);
                      }}
                    />
                    <Input
                      value={link.url}
                      placeholder="https://…"
                      maxLength={200}
                      className="flex-1"
                      onChange={(event) => {
                        const next = [...linksDraft];
                        next[index] = {
                          ...next[index],
                          url: event.target.value,
                        };
                        setLinksDraft(next);
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Remove link ${index + 1}`}
                      className="rounded-md border border-border/70 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setLinksDraft(linksDraft.filter((_, i) => i !== index))
                      }
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={linksDraft.length >= 5}
                    onClick={() =>
                      setLinksDraft([...linksDraft, { label: "", url: "" }])
                    }
                  >
                    <Plus className="mr-1.5 size-4" /> Add link
                  </Button>
                  <Button
                    size="sm"
                    disabled={linksBusy}
                    onClick={() => void saveLinks()}
                  >
                    {linksBusy && (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    )}
                    Save links
                  </Button>
                </div>
              </div>

              <h2 className="mt-7 text-sm font-semibold">Raid protection</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Locked: nobody new can join and only people who can manage
                messages can post. Pick a timed lock, or lock it until you open
                it again.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void lockFor(15 * 60 * 1000)}
                >
                  Lock for 15 min
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void lockFor(60 * 60 * 1000)}
                >
                  Lock for 1 hour
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void lockFor(24 * 60 * 60 * 1000)}
                >
                  Lock for a day
                </Button>
                <Button size="sm" onClick={() => void lockFor()}>
                  Lock until unlocked
                </Button>
                {server.locked && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void unlockNow()}
                  >
                    Unlock now
                  </Button>
                )}
              </div>
              {server.locked && (
                <p className="mt-2 text-xs text-warning">
                  Currently locked
                  {server.lockedUntil && now > 0 && server.lockedUntil > now
                    ? ` — unlocks ${new Date(server.lockedUntil).toLocaleString()}.`
                    : " until you unlock it."}
                </p>
              )}

              <h2 className="mt-7 text-sm font-semibold">Verification level</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                What people need before they can talk here. The owner, staff and
                people with roles skip it.
              </p>
              <select
                value={server.verificationLevel}
                aria-label="Verification level"
                className="mt-3 rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(event) =>
                  void updateServer(
                    {
                      verificationLevel: event.target.value as
                        | "none"
                        | "low"
                        | "medium"
                        | "high",
                    },
                    "Verification level updated.",
                  )
                }
              >
                <option value="none">None</option>
                <option value="low">Low — 5 minute old accounts</option>
                <option value="medium">Medium — 1 hour old accounts</option>
                <option value="high">High — 1 day old accounts</option>
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                {server.verificationLevel === "low"
                  ? "Accounts need to be at least 5 minutes old."
                  : server.verificationLevel === "medium"
                    ? "Accounts need to be at least 1 hour old."
                    : server.verificationLevel === "high"
                      ? "Accounts need to be at least 1 day old."
                      : "Anyone in the community can talk right away."}
              </p>

              <h2 className="mt-7 text-sm font-semibold">New accounts</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Stops raids from freshly made accounts. Only accounts older than
                the gate can join; existing members are never re-checked.
              </p>
              <select
                value={
                  server.minAccountAgeMs === 604800000
                    ? "7d"
                    : server.minAccountAgeMs === 86400000
                      ? "1d"
                      : "off"
                }
                aria-label="New accounts"
                className="mt-3 rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(event) => {
                  const value =
                    event.target.value === "7d"
                      ? 604800000
                      : event.target.value === "1d"
                        ? 86400000
                        : 0;
                  void updateServer(
                    { minAccountAgeMs: value },
                    "New-account gate updated.",
                  );
                }}
              >
                <option value="off">Off</option>
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
              </select>

              <h2 className="mt-7 text-sm font-semibold">Rules channel</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Gets a book icon, only people who can manage the server can post
                in it, and new members know where to start.
              </p>
              <select
                value={server.rulesChannelId ?? ""}
                aria-label="Rules channel"
                className="mt-3 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(event) =>
                  void updateServer(
                    {
                      rulesChannelId: (event.target.value ||
                        null) as Id<"channels"> | null,
                    },
                    "Rules channel updated.",
                  )
                }
              >
                <option value="">No rules channel</option>
                {(channels?.channels ?? []).map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>

              <JoinApplicationSettings
                serverId={serverId}
                isPublic={server.isPublic}
                applyToJoin={server.applyToJoin}
                applicationQuestions={server.applicationQuestions}
              />

              <AutoModSettings
                serverId={serverId}
                channels={channels?.channels ?? []}
                roles={server.roles}
              />

              <ServerConfigurationExport
                serverId={serverId}
                serverName={server.name}
              />

              <div className="mt-4 flex justify-end">
                <Button onClick={() => void save()} disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </section>
          )}

          {activeTab === "roles" && (
            <RolesTab
              serverId={serverId}
              isOwner={server.isOwner}
              canManageRoles={canRoles}
            />
          )}

          {activeTab === "invites" && (
            <section className="rounded-xl border border-border/70 bg-panel p-5">
              <h2 className="text-sm font-semibold">Invite links</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create invite links with expiry and use limits, then share them
                with the people you want in this server.
              </p>
              <div className="mt-3">
                <InvitesInline serverId={serverId} />
              </div>
            </section>
          )}

          {activeTab === "channels" && (
            <ChannelsTab serverId={serverId} canManage={canChannels} />
          )}
          {activeTab === "emojis" && (
            <EmojisTab serverId={serverId} canManage={canEmojis} />
          )}
          {activeTab === "bots" && <BotSettings serverId={serverId} />}

          {activeTab === "theme" && canManage && (
            <ThemeTab
              serverId={serverId}
              initialAccent={server.themeAccent}
              initialTint={server.themeTint}
            />
          )}

          {activeTab === "members" && (
            <MembersTab
              serverId={serverId}
              canRoles={canRoles}
              canKick={canKick}
              canBans={canBans}
              canModerate={canModerate}
              canApplications={canBans || canManage}
            />
          )}

          {activeTab === "reports" && <ReportsTab serverId={serverId} />}

          {activeTab === "bans" && <BansTab serverId={serverId} />}

          {activeTab === "audit" && <AuditTab serverId={serverId} />}

          {activeTab === "danger" && server.isOwner && (
            <section className="rounded-xl border border-destructive/40 bg-panel p-5">
              <h2 className="text-sm font-semibold text-destructive">
                Delete server
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This permanently removes {server.name}, every channel, and all
                messages inside it. It cannot be undone.
              </p>
              <div className="mt-3 space-y-2">
                <Input
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  placeholder={`Type “${server.name}” to confirm`}
                  aria-label="Confirm server name"
                />
                <Button
                  variant="destructive"
                  disabled={saving || confirmName.trim() !== server.name}
                  onClick={() => void destroy()}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete server
                </Button>
              </div>
            </section>
          )}

          {visibleTabs.length === 0 && (
            <p className="rounded-xl border border-border/60 bg-panel p-4 text-sm text-muted-foreground">
              You don't have permission to manage this server.
            </p>
          )}
        </motion.div>
        {cropRequest && (
          <ImageCropDialog
            file={cropRequest.file}
            title={
              cropRequest.kind === "icon"
                ? "Crop server icon"
                : "Crop server banner"
            }
            aspect={cropRequest.kind === "icon" ? 1 : 16 / 5}
            outputWidth={cropRequest.kind === "icon" ? 512 : 1600}
            outputHeight={cropRequest.kind === "icon" ? 512 : 500}
            rounded={cropRequest.kind === "icon"}
            onCancel={() => setCropRequest(null)}
            onComplete={async (file) => {
              await uploadImage(cropRequest.kind, file);
              setCropRequest(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

/** Checkbox list of every permission bit, with the admin shortcut. */
function PermissionToggles({
  value,
  onChange,
  allowAdmin,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  allowAdmin: boolean;
}) {
  return (
    <div className="grid gap-2">
      {ALL_PERMISSIONS.map((permission) => {
        const meta = PERMISSION_META[permission];
        const isAdmin = permission === PERMISSIONS.ADMINISTRATOR;
        if (isAdmin && !allowAdmin) return null;
        return (
          <label
            key={permission}
            className="flex items-start justify-between gap-4 rounded-md border border-border/60 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{meta.label}</span>
              <span className="block text-xs text-muted-foreground">
                {meta.description}
              </span>
            </span>
            <Switch
              checked={value.includes(permission)}
              onCheckedChange={(checked) => {
                if (isAdmin) {
                  onChange(checked ? [PERMISSIONS.ADMINISTRATOR] : []);
                  return;
                }
                const base = value.filter(
                  (entry) =>
                    entry !== permission && entry !== PERMISSIONS.ADMINISTRATOR,
                );
                onChange(checked ? [...base, permission] : base);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

function RolesTab({
  serverId,
  isOwner,
  canManageRoles,
}: {
  serverId: string;
  isOwner: boolean;
  canManageRoles: boolean;
}) {
  const roles = useQuery(api.roles.list, {
    serverId: serverId as Id<"servers">,
  });
  const createRole = useMutation(api.roles.create);
  const updateRole = useMutation(api.roles.update);
  const deleteRole = useMutation(api.roles.remove);
  const moveRole = useMutation(api.roles.move);
  const normalizeRolePositions = useMutation(api.roles.normalizePositions);

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_ROLE_COLORS[0]);
  const [permissions, setPermissions] = useState<string[]>([
    PERMISSIONS.SEND_MESSAGES,
  ]);
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_ROLE_COLORS[0]);
  const [editHoist, setEditHoist] = useState(false);
  const [editMentionable, setEditMentionable] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageRoles) return;
    void normalizeRolePositions({
      serverId: serverId as Id<"servers">,
    }).catch((error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not prepare role editing.",
      );
    });
  }, [canManageRoles, normalizeRolePositions, serverId]);

  const run = async (
    action: () => Promise<unknown>,
    success?: string,
    onSuccess?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onSuccess?.();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  if (!canManageRoles) {
    return (
      <section className="rounded-xl border border-border/70 bg-panel p-5 text-sm text-muted-foreground">
        You don't have permission to manage roles.
      </section>
    );
  }

  const defaultRole = roles?.find((role) => role.isDefault) ?? null;
  /** Highest rank first — the top row is the colour members see first. */
  const ordered = (roles ?? [])
    .filter((role) => !role.isDefault)
    .sort((a, b) => b.position - a.position);
  const editingRole = editingId
    ? (ordered.find((role) => role.id === editingId) ?? null)
    : null;

  const openEdit = (role: { id: string }) => {
    const source = (roles ?? []).find((entry) => entry.id === role.id);
    if (!source) return;
    setEditingId(editingId === source.id ? null : source.id);
    setEditPerms([...source.permissions]);
    setEditName(source.name);
    setEditColor(source.color ?? DEFAULT_ROLE_COLORS[0]);
    setEditHoist(source.hoist);
    setEditMentionable(source.mentionable);
  };

  /** Arrow buttons: one rank at a time, straight to the backend. */
  const nudge = async (index: number, direction: "up" | "down") => {
    const target = ordered[index];
    if (!target) return;
    await run(
      () => moveRole({ roleId: target.id as Id<"serverRoles">, direction }),
      direction === "up" ? "Role moved up." : "Role moved down.",
    );
  };

  /** Drag ended: move the row by the whole gap in one mutation. */
  const drop = async () => {
    const fromId = dragId;
    const toId = dragOverId;
    setDragId(null);
    setDragOverId(null);
    if (!fromId || !toId || fromId === toId) return;
    const from = ordered.findIndex((role) => role.id === fromId);
    const to = ordered.findIndex((role) => role.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    await run(
      () =>
        moveRole({
          roleId: fromId as Id<"serverRoles">,
          direction: to < from ? "up" : "down",
          steps: Math.abs(to - from),
        }),
      "Role order saved.",
    );
  };

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-lg border border-border/60 bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Roles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use roles to group your server members and assign permissions.
            </p>
          </div>
          <Button onClick={() => document.getElementById("role-name")?.focus()}>
            Create role
          </Button>
        </div>

        {/* @everyone: the permissions every member holds. */}
        <button
          type="button"
          className="mt-4 flex w-full items-center gap-3 rounded-lg border border-border/60 bg-surface px-3 py-3 text-left transition-colors hover:border-primary/40"
          onClick={() => defaultRole && openEdit(defaultRole)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-muted-foreground">
            <User className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Default permissions
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              @everyone · applies to all server members
            </span>
          </span>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              editingId === defaultRole?.id && "rotate-90",
            )}
          />
        </button>

        {defaultRole && editingId === defaultRole.id && (
          <div className="mt-3 rounded-md border border-primary/40 bg-surface p-4">
            <h3 className="text-sm font-medium">Default permissions</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Every member holds these, even with no roles of their own.
            </p>
            <div className="mt-3">
              <PermissionToggles
                value={editPerms}
                onChange={setEditPerms}
                allowAdmin={isOwner}
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setEditingId(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      updateRole({
                        roleId: defaultRole.id as Id<"serverRoles">,
                        permissions: editPerms,
                      }),
                    "Default permissions updated.",
                    () => setEditingId(null),
                  )
                }
              >
                Save permissions
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Members use the colour of the highest role they have on this list —
          the top row wins. Drag a row to align it, or use the arrows.
        </p>

        {/* Column header, aligned with the rows below. */}
        <div className="mt-2 flex items-center gap-3 border-b border-border/60 bg-surface/60 px-3 py-2">
          <span className="w-4" aria-hidden="true" />
          <span className="size-3" aria-hidden="true" />
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Roles · {ordered.length}
          </span>
          <span className="w-16 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Members
          </span>
          <span className="w-32" aria-hidden="true" />
        </div>

        <div className="overflow-hidden rounded-b-lg border-x border-b border-border/60">
          {roles === undefined ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Loading roles…
            </p>
          ) : ordered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No roles yet — create the first one below.
            </p>
          ) : (
            ordered.map((role, index) => (
              <div
                key={role.id}
                draggable={!busy}
                onDragStart={() => setDragId(role.id)}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragId && dragId !== role.id) setDragOverId(role.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void drop();
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  "flex items-center gap-3 border-b border-border/50 bg-panel px-3 py-2.5 transition-colors last:border-b-0",
                  dragId === role.id && "opacity-50",
                  dragOverId === role.id &&
                    dragId &&
                    dragId !== role.id &&
                    "ring-1 ring-inset ring-primary",
                )}
              >
                <GripVertical
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/50"
                />
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: role.color ?? "#9CA3AF" }}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {role.name}
                  </span>
                  {role.hoist || role.mentionable ? (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {[
                        role.hoist ? "separate member section" : null,
                        role.mentionable ? "mentionable" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
                <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground">
                  <User className="size-3.5" aria-hidden="true" />
                  {role.memberCount}
                </span>
                <span className="flex w-32 shrink-0 items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${role.name} up`}
                    disabled={busy || index === 0}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    onClick={() => void nudge(index, "up")}
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${role.name} down`}
                    disabled={busy || index === ordered.length - 1}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    onClick={() => void nudge(index, "down")}
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-1.5 text-xs"
                    title="Copy role ID"
                    onClick={() => {
                      void navigator.clipboard.writeText(role.id);
                      toast.success("Role ID copied.");
                    }}
                  >
                    ID
                  </Button>
                  <button
                    type="button"
                    aria-label={`Edit ${role.name}`}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                    onClick={() => openEdit(role)}
                  >
                    <Pencil className="size-4" />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        {editingRole ? (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setEditingId(null);
            }}
          >
            <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit {editingRole.name}</DialogTitle>
                <DialogDescription>
                  Change how this role looks and exactly what its members can
                  do.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-role-name">Role name</Label>
                    <Input
                      id="edit-role-name"
                      autoFocus
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-role-colour">Custom colour</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="edit-role-colour"
                        type="color"
                        value={
                          /^#[0-9a-f]{6}$/i.test(editColor)
                            ? editColor
                            : DEFAULT_ROLE_COLORS[0]
                        }
                        onChange={(event) => setEditColor(event.target.value)}
                        className="size-10 cursor-pointer rounded-md border border-input bg-background p-1"
                      />
                      <Input
                        value={editColor}
                        onChange={(event) => setEditColor(event.target.value)}
                        maxLength={7}
                        className="w-28 font-mono uppercase"
                        aria-label="Role colour hex value"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Colour presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_ROLE_COLORS.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        aria-label={`Colour ${entry}`}
                        onClick={() => setEditColor(entry)}
                        className={cn(
                          "size-8 rounded-full transition-transform",
                          editColor.toLowerCase() === entry.toLowerCase()
                            ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-panel"
                            : "hover:scale-105",
                        )}
                        style={{ background: entry }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3">
                    <span>
                      <span className="block text-sm font-medium">
                        Separate member section
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Show this role as its own group in the member list.
                      </span>
                    </span>
                    <Switch
                      checked={editHoist}
                      onCheckedChange={setEditHoist}
                    />
                  </label>
                  <label className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3">
                    <span>
                      <span className="block text-sm font-medium">
                        Allow role mentions
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Let members notify everyone who has this role.
                      </span>
                    </span>
                    <Switch
                      checked={editMentionable}
                      onCheckedChange={setEditMentionable}
                    />
                  </label>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Permissions</p>
                  <PermissionToggles
                    value={editPerms}
                    onChange={setEditPerms}
                    allowAdmin={isOwner}
                  />
                </div>
              </div>

              <DialogFooter className="mt-1 gap-2 sm:items-center sm:justify-between">
                <Button
                  variant="ghost"
                  disabled={busy}
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => {
                    if (
                      !window.confirm(`Delete the ${editingRole.name} role?`)
                    ) {
                      return;
                    }
                    void run(
                      () =>
                        deleteRole({
                          roleId: editingRole.id as Id<"serverRoles">,
                        }),
                      "Role deleted.",
                      () => setEditingId(null),
                    );
                  }}
                >
                  <Trash2 className="mr-1.5 size-4" /> Delete role
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    busy ||
                    editName.trim().length < 2 ||
                    !/^#[0-9a-f]{6}$/i.test(editColor)
                  }
                  onClick={() =>
                    void run(
                      () =>
                        updateRole({
                          roleId: editingRole.id as Id<"serverRoles">,
                          name: editName.trim(),
                          color: editColor.toUpperCase(),
                          permissions: editPerms,
                          hoist: editHoist,
                          mentionable: editMentionable,
                        }),
                      "Role updated.",
                      () => setEditingId(null),
                    )
                  }
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <div className="rounded-lg border border-border/60 bg-panel p-5">
        <h2 className="text-sm font-semibold">Create a role</h2>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Moderators"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ROLE_COLORS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-label={`Colour ${entry}`}
                  onClick={() => setColor(entry)}
                  className={cn(
                    "size-7 rounded-full transition-transform",
                    color === entry
                      ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-panel"
                      : "hover:scale-105",
                  )}
                  style={{ background: entry }}
                />
              ))}
            </div>
          </div>
          <PermissionToggles
            value={permissions}
            onChange={setPermissions}
            allowAdmin={isOwner}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3">
              <span>
                <span className="block text-sm font-medium">
                  Separate member section
                </span>
                <span className="block text-xs text-muted-foreground">
                  Group members with this role in the roster.
                </span>
              </span>
              <Switch checked={hoist} onCheckedChange={setHoist} />
            </label>
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border/70 p-3">
              <span>
                <span className="block text-sm font-medium">
                  Allow role mentions
                </span>
                <span className="block text-xs text-muted-foreground">
                  Let members mention everyone with this role.
                </span>
              </span>
              <Switch checked={mentionable} onCheckedChange={setMentionable} />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={busy || name.trim().length < 2}
              onClick={() =>
                void run(
                  () =>
                    createRole({
                      serverId: serverId as Id<"servers">,
                      name: name.trim(),
                      color,
                      permissions,
                      hoist,
                      mentionable,
                    }),
                  "Role created.",
                  () => {
                    setName("");
                    setPermissions([PERMISSIONS.SEND_MESSAGES]);
                    setHoist(false);
                    setMentionable(false);
                  },
                )
              }
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Create role
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */

/** Invite manager rendered inline on its own settings tab. */
function InvitesInline({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Manage invite links
      </Button>
      <InviteDialog serverId={serverId} open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bans                                                                */
/* ------------------------------------------------------------------ */

function BansTab({ serverId }: { serverId: string }) {
  const bans = useQuery(api.servers.listBans, {
    serverId: serverId as Id<"servers">,
  });
  const unban = useMutation(api.servers.unban);

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <h2 className="text-sm font-semibold">Bans</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Banned members can't rejoin until you lift the ban.
      </p>
      <div className="mt-4 space-y-2">
        {bans === undefined ? (
          <p className="text-sm text-muted-foreground">Loading bans…</p>
        ) : bans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bans in this server.
          </p>
        ) : (
          bans.map((ban) => (
            <div
              key={ban.userId}
              className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {ban.user?.name ?? "Unknown user"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ban.reason ? `Reason: ${ban.reason} · ` : ""}
                  {new Date(ban.createdAt).toLocaleDateString()}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void unban({
                    serverId: serverId as Id<"servers">,
                    userId: ban.userId as Id<"users">,
                  })
                    .then(() => toast.success("Member unbanned."))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not unban.",
                      ),
                    )
                }
              >
                Unban
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

function AuditTab({ serverId }: { serverId: string }) {
  const entries = useQuery(api.servers.auditLog, {
    serverId: serverId as Id<"servers">,
  });

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <h2 className="text-sm font-semibold">Audit log</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The last 60 administrative actions in this server.
      </p>
      <div className="mt-4 space-y-2">
        {entries === undefined ? (
          <p className="text-sm text-muted-foreground">Loading audit log…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border border-border/60 px-3 py-2"
            >
              <p className="text-sm">
                <span className="font-medium">
                  {entry.actor?.name ?? "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">{entry.action}</span>
              </p>
              {entry.details && (
                <p className="text-xs text-muted-foreground">{entry.details}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Custom emojis                                                       */
/* ------------------------------------------------------------------ */

type ServerEmojiData = {
  canManage: boolean;
  emojis: {
    id: string;
    name: string;
    url: string | null;
    animated: boolean;
    serverId: string;
    serverName: string;
  }[];
};

function EmojisTab({
  serverId,
  canManage,
}: {
  serverId: string;
  canManage: boolean;
}) {
  const convex = useConvex();
  const upload = useUploadFile({ requireRegistration: true });
  const createEmoji = useMutation(api.emojis.create);
  const removeEmoji = useMutation(api.emojis.remove);
  const [data, setData] = useState<ServerEmojiData | null>(null);
  const [backendMissing, setBackendMissing] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const next = await convex.query(api.emojis.forServer, {
        serverId: serverId as Id<"servers">,
      });
      setData(next);
      setBackendMissing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not find public function")) {
        setBackendMissing(true);
        setData({ canManage: false, emojis: [] });
      } else {
        toast.error(message);
      }
    }
  };

  useEffect(() => {
    // `load` awaits the Convex query before touching state; the lint rule
    // cannot see through the helper call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // `load` intentionally tracks the active server and stable Convex client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, serverId]);

  const create = async () => {
    if (!file || busy) return;
    if (file.size > 1024 * 1024) {
      toast.error("Custom emoji files must be 1 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const stored = await upload(file);
      await createEmoji({
        serverId: serverId as Id<"servers">,
        name: name.trim(),
        storageId: stored.storageId,
      });
      setName("");
      setFile(null);
      await load();
      toast.success("Custom emoji uploaded.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload emoji.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <section className="rounded-xl border border-border/70 bg-panel p-5 text-sm text-muted-foreground">
        You don't have permission to manage custom emojis.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-panel p-5">
      <div>
        <h2 className="text-base font-semibold">Custom emojis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload PNG, WebP, APNG, or animated GIF emoji up to 1 MB. Members can
          use them in any Kyro conversation.
        </p>
      </div>

      {backendMissing ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          The custom-emoji backend is ready in the repository but still needs
          deployment to this server's live Convex project.
        </div>
      ) : (
        <div className="grid gap-3 rounded-lg border border-border/60 bg-surface p-4 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emoji-name">Emoji name</Label>
              <Input
                id="emoji-name"
                value={name}
                onChange={(event) => setName(event.target.value.toLowerCase())}
                placeholder="party_blob"
                maxLength={32}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emoji-file">Image or GIF</Label>
              <Input
                id="emoji-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/apng"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <Button
            className="self-end"
            disabled={busy || !file || !/^[a-z0-9_]{2,32}$/.test(name.trim())}
            onClick={() => void create()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Upload
          </Button>
        </div>
      )}

      {data === null ? (
        <div className="flex h-28 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : data.emojis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          No custom emojis yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.emojis.map((emoji) => (
            <div
              key={emoji.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-3"
            >
              {emoji.url ? (
                <img
                  src={emoji.url}
                  alt={`:${emoji.name}:`}
                  className="size-10 object-contain"
                />
              ) : (
                <span className="size-10 rounded bg-panel" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">:{emoji.name}:</p>
                <p className="text-xs text-muted-foreground">
                  {emoji.animated ? "Animated" : "Static"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete ${emoji.name}`}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void removeEmoji({ emojiId: emoji.id as Id<"serverEmojis"> })
                    .then(load)
                    .then(() => toast.success("Emoji deleted."))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Could not delete emoji.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Channels — order and categories, exactly like the sidebar.          */
/* ------------------------------------------------------------------ */

function ChannelsTab({
  serverId,
  canManage,
}: {
  serverId: string;
  canManage: boolean;
}) {
  const channels = useQuery(api.channels.list, {
    serverId: serverId as Id<"servers">,
  });
  const roles = useQuery(api.roles.list, {
    serverId: serverId as Id<"servers">,
  });
  const reorder = useMutation(api.channels.reorder);
  const updateChannel = useMutation(api.channels.update);
  const createCategory = useMutation(api.channels.createCategory);
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overwrites, setOverwrites] = useState<
    { roleId: string; allow: string[]; deny: string[] }[]
  >([]);

  const run = async (action: Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action;
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
      setDragIndex(null);
      setOverIndex(null);
    }
  };

  if (!canManage) {
    return (
      <section className="rounded-xl border border-border/70 bg-panel p-5 text-sm text-muted-foreground">
        You don't have permission to manage channels.
      </section>
    );
  }
  if (!channels) {
    return (
      <section className="rounded-xl border border-border/70 bg-panel p-5 text-sm text-muted-foreground">
        Loading channels…
      </section>
    );
  }

  const uncategorised = channels.channels
    .filter((channel) => !channel.categoryId)
    .sort((a, b) => a.position - b.position);
  const groups = channels.categories.map((category) => ({
    category,
    channels: channels.channels
      .filter((channel) => channel.categoryId === category.id)
      .sort((a, b) => a.position - b.position),
  }));
  const flat = [...uncategorised, ...groups.flatMap((group) => group.channels)];

  const saveOrder = async (next: typeof flat) =>
    run(
      reorder({
        serverId: serverId as Id<"servers">,
        categories: [],
        channels: next.map((channel, position) => ({
          id: channel.id as Id<"channels">,
          position,
          categoryId: (channel.categoryId as Id<"categories"> | null) ?? null,
        })),
      }),
      "Channel order saved.",
    );

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= flat.length) return;
    const next = [...flat];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    await saveOrder(next);
  };

  const drop = async (target: number) => {
    const source = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (source === null || source === target) return;
    const next = [...flat];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    await saveOrder(next);
  };

  type Row =
    | { kind: "category"; id: string; name: string }
    | { kind: "channel"; channel: (typeof flat)[number]; index: number };
  const rows: Row[] = [];
  for (const channel of uncategorised) {
    rows.push({ kind: "channel", channel, index: flat.indexOf(channel) });
  }
  const editingChannel = editingId
    ? (channels.channels.find((channel) => channel.id === editingId) ?? null)
    : null;

  const setOverride = (
    roleId: string,
    permission: string,
    state: "inherit" | "allow" | "deny",
  ) => {
    setOverwrites((current) => {
      const existing = current.find((entry) => entry.roleId === roleId) ?? {
        roleId,
        allow: [],
        deny: [],
      };
      const next = {
        ...existing,
        allow: existing.allow.filter((entry) => entry !== permission),
        deny: existing.deny.filter((entry) => entry !== permission),
      };
      if (state === "allow") next.allow.push(permission);
      if (state === "deny") next.deny.push(permission);
      const rest = current.filter((entry) => entry.roleId !== roleId);
      return next.allow.length || next.deny.length ? [...rest, next] : rest;
    });
  };
  for (const group of groups) {
    rows.push({
      kind: "category",
      id: group.category.id,
      name: group.category.name,
    });
    for (const channel of group.channels) {
      rows.push({ kind: "channel", channel, index: flat.indexOf(channel) });
    }
  }

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Channels</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag channels to change the order people see.
          </p>
        </div>
        <Button onClick={() => setCreating((value) => !value)}>
          Create Category
        </Button>
      </div>

      {channels.categories.length === 0 && !creating && (
        <p className="mt-2 text-sm text-muted-foreground">No categories yet.</p>
      )}

      {creating && (
        <div className="mt-3 flex gap-2">
          <Input
            autoFocus
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newCategory.trim().length >= 2) {
                event.preventDefault();
                void run(
                  createCategory({
                    serverId: serverId as Id<"servers">,
                    name: newCategory.trim(),
                  }).then(() => {
                    setNewCategory("");
                    setCreating(false);
                  }),
                  "Category created.",
                );
              }
            }}
            placeholder="Category name"
            maxLength={60}
            className="flex-1"
            aria-label="Category name"
          />
          <Button
            disabled={busy || newCategory.trim().length < 2}
            onClick={() =>
              void run(
                createCategory({
                  serverId: serverId as Id<"servers">,
                  name: newCategory.trim(),
                }).then(() => {
                  setNewCategory("");
                  setCreating(false);
                }),
                "Category created.",
              )
            }
          >
            Create
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-border/60">
        {rows.map((row) =>
          row.kind === "category" ? (
            <div
              key={row.id}
              className="border-b border-border/50 bg-surface/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {row.name}
            </div>
          ) : (
            <div
              key={row.channel.id}
              draggable={!busy}
              onDragStart={() => setDragIndex(row.index)}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== row.index) {
                  setOverIndex(row.index);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                void drop(row.index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex items-center gap-3 border-b border-border/50 bg-panel px-3 py-2.5 transition-colors last:border-b-0",
                dragIndex === row.index && "opacity-50",
                overIndex === row.index &&
                  dragIndex !== null &&
                  dragIndex !== row.index &&
                  "ring-1 ring-inset ring-primary",
              )}
            >
              <GripVertical
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground/50"
              />
              <Hash className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.channel.name}
              </span>
              <button
                type="button"
                aria-label={`Move ${row.channel.name} up`}
                disabled={busy || row.index === 0}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                onClick={() => void move(row.index, -1)}
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Move ${row.channel.name} down`}
                disabled={busy || row.index === flat.length - 1}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                onClick={() => void move(row.index, 1)}
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Edit ${row.channel.name} permissions`}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                onClick={() => {
                  setEditingId(row.channel.id);
                  setOverwrites(
                    (row.channel.permissionOverwrites ?? []).map((entry) => ({
                      roleId: entry.roleId,
                      allow: [...entry.allow],
                      deny: [...entry.deny],
                    })),
                  );
                }}
              >
                <Pencil className="size-4" />
              </button>
            </div>
          ),
        )}
        {rows.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No channels yet — create one from the sidebar.
          </p>
        )}
      </div>

      {editingChannel && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                #{editingChannel.name} permissions
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Allow, deny, or inherit each permission for a role. Deny wins
                when a member has multiple conflicting roles.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close channel permissions"
              onClick={() => setEditingId(null)}
              className="rounded p-1 text-muted-foreground hover:bg-panel"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {(roles ?? [])
              .slice()
              .sort(
                (a, b) =>
                  Number(b.isDefault) - Number(a.isDefault) ||
                  b.position - a.position,
              )
              .map((role) => {
                const overwrite = overwrites.find(
                  (entry) => entry.roleId === role.id,
                );
                return (
                  <div
                    key={role.id}
                    className="rounded-lg border border-border/60 bg-panel p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: role.color ?? "#94a3b8" }}
                      />
                      <p className="text-sm font-semibold">{role.name}</p>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      {CHANNEL_PERMISSIONS.map((permission) => {
                        const state = overwrite?.allow.includes(permission)
                          ? "allow"
                          : overwrite?.deny.includes(permission)
                            ? "deny"
                            : "inherit";
                        return (
                          <label
                            key={permission}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">
                                {PERMISSION_META[permission].label}
                              </span>
                            </span>
                            <select
                              value={state}
                              onChange={(event) =>
                                setOverride(
                                  role.id,
                                  permission,
                                  event.target.value as
                                    | "inherit"
                                    | "allow"
                                    | "deny",
                                )
                              }
                              className={cn(
                                "h-7 rounded border border-input bg-background px-1.5 text-xs",
                                state === "allow" && "text-success",
                                state === "deny" && "text-destructive",
                              )}
                            >
                              <option value="inherit">Inherit</option>
                              <option value="allow">Allow</option>
                              <option value="deny">Deny</option>
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setEditingId(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  updateChannel({
                    channelId: editingChannel.id as Id<"channels">,
                    permissionOverwrites: overwrites.map((entry) => ({
                      roleId: entry.roleId as Id<"serverRoles">,
                      allow: entry.allow,
                      deny: entry.deny,
                    })),
                  }).then(() => setEditingId(null)),
                  "Channel permissions saved.",
                )
              }
            >
              Save permissions
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Theme — community accent + background tint.                          */
/* ------------------------------------------------------------------ */

const THEME_SWATCHES = [
  "#f97316",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#facc15",
];

function ThemeSwatches({
  value,
  onPick,
  label,
}: {
  value: string;
  onPick: (hex: string) => void;
  label: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label={`No ${label}`}
        onClick={() => onPick("")}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border text-xs text-muted-foreground",
          !value ? "border-foreground" : "border-border",
        )}
      >
        ∅
      </button>
      {THEME_SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`${label} ${hex}`}
          onClick={() => onPick(hex)}
          className={cn(
            "size-7 rounded-full transition-transform",
            value === hex
              ? "ring-2 ring-foreground ring-offset-2 ring-offset-panel"
              : "hover:scale-105",
          )}
          style={{ background: hex }}
        />
      ))}
      <label
        className="relative flex size-7 items-center justify-center overflow-hidden rounded-full border border-border text-sm font-bold text-muted-foreground"
        style={value ? { background: value } : undefined}
        title={`Custom ${label}`}
      >
        <input
          type="color"
          value={value || "#6b59f3"}
          aria-label={`Custom ${label}`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => onPick(event.target.value)}
        />
        {!value && <span aria-hidden="true">+</span>}
      </label>
      <Input
        value={value}
        onChange={(event) => onPick(event.target.value)}
        placeholder="#18a5af"
        maxLength={7}
        className="h-8 w-28 font-mono text-xs"
        aria-label={`${label} hex value`}
      />
    </div>
  );
}

function ThemeTab({
  serverId,
  initialAccent,
  initialTint,
}: {
  serverId: string;
  initialAccent: string | null;
  initialTint: string | null;
}) {
  const update = useMutation(api.servers.update);
  const [accent, setAccent] = useState(initialAccent ?? "");
  const [tint, setTint] = useState(initialTint ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) {
      toast.error("Accent must look like #67E8F9.");
      return;
    }
    if (tint && !/^#[0-9a-fA-F]{6}$/.test(tint)) {
      toast.error("Tint must look like #6b59f3.");
      return;
    }
    setBusy(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        themeAccent: accent || null,
        themeTint: tint || null,
      });
      toast.success("Theme saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the theme.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await update({
        serverId: serverId as Id<"servers">,
        themeAccent: null,
        themeTint: null,
      });
      setAccent("");
      setTint("");
      toast.success("Theme removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove the theme.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <h2 className="text-base font-semibold">Theme</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Give your server its own colours. Everyone sees them while they're here,
        unless they turned server colours off in their Appearance settings.
      </p>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Accent colour
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Buttons, links and highlights. Very light or very dark picks get nudged
        so text stays readable.
      </p>
      <ThemeSwatches value={accent} onPick={setAccent} label="accent" />

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Background tint
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        A light wash of colour over the background.
      </p>
      <ThemeSwatches value={tint} onPick={setTint} label="background tint" />

      {/* Live preview: exactly what a message row looks like with the theme. */}
      <div className="mt-5 rounded-xl border border-border/60 bg-surface p-4">
        <div className="flex gap-3 rounded-lg bg-background/60 p-3">
          <span
            className="size-9 shrink-0 rounded-full"
            style={{ background: accent || "var(--brand)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">yapper</span> check out{" "}
              <span
                className="underline"
                style={{ color: accent || undefined }}
              >
                this link
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Looks like this for everyone in the community.
            </p>
            <span
              className="mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: accent || "var(--brand)" }}
            >
              Button
            </span>
          </div>
        </div>
        {tint && (
          <div
            className="mt-2 rounded-lg px-3 py-2 text-xs"
            style={{ background: `${tint}26` }}
          >
            Background tint wash preview.
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
          Remove theme
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Members — applications, search, role chips, kick and ban.           */
/* ------------------------------------------------------------------ */

function ApplicationReview({ serverId }: { serverId: string }) {
  const applications = useQuery(api.applications.list, {
    serverId: serverId as Id<"servers">,
  });
  const decide = useMutation(api.applications.decide);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = (applications ?? []).filter(
    (application) => application.status === "pending",
  );

  if (pending.length === 0) return null;

  const review = async (applicationId: string, approve: boolean) => {
    if (busyId) return;
    setBusyId(applicationId);
    try {
      await decide({
        applicationId: applicationId as Id<"joinApplications">,
        approve,
        note: notes[applicationId]?.trim() || undefined,
      });
      toast.success(
        approve ? "Application approved." : "Application declined.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not review application.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold">
        Pending applications · {pending.length}
      </h3>
      <div className="mt-3 space-y-3">
        {pending.map((application) => (
          <div
            key={application.id}
            className="rounded-lg border border-border/70 bg-panel p-3"
          >
            <div className="flex items-center gap-2">
              {application.applicant ? (
                <UserAvatar user={application.applicant} size="sm" />
              ) : (
                <span className="size-8 rounded-full bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                {application.applicant ? (
                  <StyledDisplayName
                    user={application.applicant}
                    className="text-sm"
                  />
                ) : (
                  <p className="text-sm font-semibold">Unknown applicant</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Applied {new Date(application.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {application.answers.map((answer) => (
                <div key={answer.question}>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {answer.question}
                  </p>
                  <p className="mt-0.5 text-sm">{answer.answer}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={notes[application.id] ?? ""}
                onChange={(event) =>
                  setNotes((current) => ({
                    ...current,
                    [application.id]: event.target.value,
                  }))
                }
                placeholder="Optional note to the applicant"
                maxLength={500}
                className="h-8 flex-1 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void review(application.id, true)}
                >
                  {busyId === application.id && (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void review(application.id, false)}
                >
                  Decline
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersTab({
  serverId,
  canRoles,
  canKick,
  canBans,
  canModerate,
  canApplications,
}: {
  serverId: string;
  canRoles: boolean;
  canKick: boolean;
  canBans: boolean;
  canModerate: boolean;
  canApplications: boolean;
}) {
  const members = useQuery(api.servers.members, {
    serverId: serverId as Id<"servers">,
  });
  const roles = useQuery(api.roles.list, {
    serverId: serverId as Id<"servers">,
  });
  const me = useQuery(api.users.me);
  const updateMemberRoles = useMutation(api.servers.updateMemberRoles);
  const kick = useMutation(api.servers.kick);
  const ban = useMutation(api.servers.ban);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const run = async (action: Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action;
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const needle = term.trim().toLowerCase();
  const all =
    members === undefined ? [] : [...members.online, ...members.offline];
  const filtered = all.filter(
    (member) =>
      !needle ||
      [
        member.user.name,
        member.nickname ?? "",
        member.user.username ?? "",
      ].some((value) => value.toLowerCase().includes(needle)),
  );

  const setRoles = (member: (typeof filtered)[number], roleIds: string[]) =>
    run(
      updateMemberRoles({
        serverId: serverId as Id<"servers">,
        userId: member.user.id as Id<"users">,
        roleIds: roleIds as Id<"serverRoles">[],
      }),
      "Roles updated.",
    );

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      {canApplications && <ApplicationReview serverId={serverId} />}
      <h2 className="text-base font-semibold">
        Members
        {members ? ` · ${members.online.length + members.offline.length}` : ""}
      </h2>
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search members"
        className="mt-3"
        aria-label="Search members"
      />

      <div className="mt-3 divide-y divide-border/50">
        {members === undefined ? (
          <p className="py-3 text-sm text-muted-foreground">Loading members…</p>
        ) : filtered.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No members match that search.
          </p>
        ) : (
          filtered.map((member) => {
            const heldRoles = member.roles.filter((role) => !role.isDefault);
            const addable = (roles ?? []).filter(
              (role) =>
                !role.isDefault &&
                !heldRoles.some((held) => held.id === role.id),
            );
            return (
              <div
                key={member.user.id}
                className="flex items-center gap-3 py-2.5"
              >
                <div className="relative shrink-0">
                  <UserAvatar user={member.user} size="md" />
                  {member.isOwner && (
                    <span className="absolute -right-1.5 -top-1.5">
                      <CrownBadge
                        variant="owner"
                        label="Owner"
                        size="size-3.5"
                      />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline gap-1.5 truncate text-sm font-semibold">
                    <StyledDisplayName
                      user={member.user}
                      name={member.nickname ?? member.user.name}
                      className="truncate"
                    />
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      @{member.user.username}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {canRoles && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Add a role to ${member.user.name}`}
                            className="flex size-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="size-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          {addable.length > 0 ? (
                            addable.map((role) => (
                              <DropdownMenuItem
                                key={role.id}
                                disabled={busy}
                                onClick={() =>
                                  void setRoles(member, [
                                    ...heldRoles.map((held) => held.id),
                                    role.id,
                                  ])
                                }
                              >
                                <span
                                  className="size-2.5 shrink-0 rounded-full"
                                  style={{
                                    background: role.color ?? "#9CA3AF",
                                  }}
                                />
                                <span className="truncate">{role.name}</span>
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>
                              Every role is already assigned
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {heldRoles.map((role) => (
                      <span
                        key={role.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface px-2 py-0.5 text-[11px]"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: role.color ?? "#9CA3AF" }}
                        />
                        {role.name}
                        {canRoles && (
                          <button
                            type="button"
                            aria-label={`Remove ${role.name} from ${member.user.name}`}
                            disabled={busy}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void setRoles(
                                member,
                                heldRoles
                                  .filter((held) => held.id !== role.id)
                                  .map((held) => held.id),
                              )
                            }
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {heldRoles.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        No roles
                      </span>
                    )}
                  </div>
                </div>
                {(canKick || canBans || canModerate) &&
                  !member.isOwner &&
                  member.user.id !== me?.id && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-3">
                      {canModerate && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          onClick={() => setModeratingId(member.user.id)}
                        >
                          Moderate
                        </button>
                      )}
                      {canKick && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                          onClick={() =>
                            void run(
                              kick({
                                serverId: serverId as Id<"servers">,
                                userId: member.user.id as Id<"users">,
                              }),
                              `${member.user.name} was kicked.`,
                            )
                          }
                        >
                          Kick
                        </button>
                      )}
                      {canBans && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                          onClick={() =>
                            void run(
                              ban({
                                serverId: serverId as Id<"servers">,
                                userId: member.user.id as Id<"users">,
                              }),
                              `${member.user.name} was banned.`,
                            )
                          }
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  )}
              </div>
            );
          })
        )}
      </div>
      {moderatingId &&
        all.find((member) => member.user.id === moderatingId) && (
          <ModerateMemberDialog
            serverId={serverId}
            member={all.find((member) => member.user.id === moderatingId)!}
            onOpenChange={(open) => {
              if (!open) setModeratingId(null);
            }}
          />
        )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Reports — the moderation queue, surfaced where staff look.           */
/* ------------------------------------------------------------------ */

function ReportRow({
  report,
  isAdmin,
}: {
  report: {
    id: string;
    reason: string;
    details: string | null;
    status: "open" | "reviewing" | "resolved" | "dismissed";
    createdAt: number;
    reporter: { name: string } | null;
    reported: { name: string } | null;
  };
  isAdmin: boolean;
}) {
  const resolve = useMutation(api.reports.resolve);
  const [status, setStatus] = useState<string>(
    report.status === "open" ? "reviewing" : report.status,
  );
  const [note, setNote] = useState("");
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resolve({
        reportId: report.id as Id<"reports">,
        status: status as "reviewing" | "resolved" | "dismissed",
        resolution: note.trim() || undefined,
        warn: warn && isAdmin ? true : undefined,
      });
      toast.success("Report updated.");
      setWarn(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update that.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {report.status}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {report.reason}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(report.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {report.reporter?.name ?? "Someone"} reported{" "}
        {report.reported?.name ?? "a message"}
        {report.details ? ` — ${report.details}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={status}
          aria-label={`Status for ${report.reason}`}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          onChange={(event) => setStatus(event.target.value)}
          disabled={busy}
        >
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Resolution note…"
          maxLength={500}
          className="h-8 flex-1 text-xs"
        />
        {isAdmin && report.reported && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={warn}
              onChange={(event) => setWarn(event.target.checked)}
            />
            Also warn (3 days)
          </label>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy && <Loader2 className="mr-1 size-3 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}

function ReportsTab({ serverId }: { serverId: string }) {
  const queue = useQuery(api.reports.queue, {
    serverId: serverId as Id<"servers">,
  });
  const me = useQuery(api.users.me);
  const isAdmin = me?.isPlatformAdmin === true;

  return (
    <section className="rounded-xl border border-border/70 bg-panel p-5">
      <h2 className="text-base font-semibold">Reports</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        People and messages reported in this community. Resolve them with a note
        so the reporter knows what happened.
      </p>
      <div className="mt-4 space-y-2">
        {queue === undefined ? (
          <p className="text-sm text-muted-foreground">Loading reports…</p>
        ) : queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to review — reports from this community land here.
          </p>
        ) : (
          queue.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              isAdmin={isAdmin === true}
            />
          ))
        )}
      </div>
      <ModerationCaseActivity serverId={serverId} />
      <AutoModEvents serverId={serverId} />
    </section>
  );
}
