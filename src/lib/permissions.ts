/**
 * Permission bits used by communities (servers) in Kyro.
 *
 * This module is shared by the Convex backend (enforcement) and the React
 * frontend (affordances). The backend is always the source of truth: the UI
 * merely hides actions a member cannot perform.
 */

export const PERMISSIONS = {
  ADMINISTRATOR: "administrator",
  MANAGE_SERVER: "manage_server",
  MANAGE_CHANNELS: "manage_channels",
  MANAGE_ROLES: "manage_roles",
  MANAGE_MESSAGES: "manage_messages",
  KICK_MEMBERS: "kick_members",
  BAN_MEMBERS: "ban_members",
  CREATE_INVITES: "create_invites",
  VIEW_CHANNEL: "view_channel",
  SEND_MESSAGES: "send_messages",
  CONNECT_VOICE: "connect_voice",
  SPEAK_VOICE: "speak_voice",
  VIDEO: "video",
  SHARE_SCREEN: "share_screen",
  MANAGE_VOICE: "manage_voice",
  MENTION_EVERYONE: "mention_everyone",
  MANAGE_EMOJIS: "manage_emojis",
  VIEW_AUDIT_LOG: "view_audit_log",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/** Permission bits that make sense as a per-channel override. */
export const CHANNEL_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.CONNECT_VOICE,
  PERMISSIONS.SPEAK_VOICE,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SHARE_SCREEN,
  PERMISSIONS.MANAGE_VOICE,
  PERMISSIONS.MANAGE_MESSAGES,
  PERMISSIONS.MENTION_EVERYONE,
];

/** What the default @everyone role starts with on a new community. */
export const DEFAULT_EVERYONE_PERMISSIONS: Permission[] = [
  PERMISSIONS.CREATE_INVITES,
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.CONNECT_VOICE,
  PERMISSIONS.SPEAK_VOICE,
  PERMISSIONS.VIDEO,
  PERMISSIONS.SHARE_SCREEN,
];

/** Permissions granted to the community owner regardless of roles. */
export const OWNER_PERMISSIONS: Permission[] = ALL_PERMISSIONS;

export function hasPermission(
  permissions: readonly string[] | undefined,
  permission: Permission,
): boolean {
  if (!permissions) return false;
  return (
    permissions.includes(PERMISSIONS.ADMINISTRATOR) ||
    permissions.includes(permission)
  );
}

export function hasAnyPermission(
  permissions: readonly string[] | undefined,
  wanted: Permission[],
): boolean {
  return wanted.some((permission) => hasPermission(permissions, permission));
}

/**
 * Community staff may only delegate powers they already hold. Administrator
 * itself remains owner-only because it bypasses every individual check.
 */
export function canDelegatePermissions(
  granterPermissions: readonly string[] | undefined,
  requestedPermissions: readonly string[],
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  if (requestedPermissions.includes(PERMISSIONS.ADMINISTRATOR)) return false;
  return requestedPermissions.every((permission) =>
    hasPermission(granterPermissions, permission as Permission),
  );
}

export const PERMISSION_META: Record<
  Permission,
  { label: string; description: string }
> = {
  administrator: {
    label: "Administrator",
    description: "Grants every permission in this community.",
  },
  manage_server: {
    label: "Manage community",
    description: "Edit the name, icon, description and rules.",
  },
  manage_channels: {
    label: "Manage channels",
    description: "Create, rename, reorder and delete channels.",
  },
  manage_roles: {
    label: "Manage roles",
    description: "Create roles and change who has which permissions.",
  },
  manage_messages: {
    label: "Manage messages",
    description: "Delete other people's messages and slow a channel down.",
  },
  kick_members: {
    label: "Kick members",
    description: "Remove a member from this community.",
  },
  ban_members: {
    label: "Ban members",
    description: "Block a member from rejoining this community.",
  },
  create_invites: {
    label: "Create invites",
    description: "Generate invite links for this community.",
  },
  view_channel: {
    label: "View channels",
    description: "See channels unless a channel-specific override denies it.",
  },
  send_messages: {
    label: "Send messages",
    description: "Post messages in text channels.",
  },
  connect_voice: {
    label: "Connect to voice",
    description: "Join voice channels in this community.",
  },
  speak_voice: {
    label: "Speak in voice",
    description: "Publish microphone audio in voice channels.",
  },
  video: {
    label: "Use camera",
    description: "Publish camera video in voice channels.",
  },
  share_screen: {
    label: "Share screen",
    description: "Share a screen, application window or browser tab.",
  },
  manage_voice: {
    label: "Manage voice",
    description: "Mute or disconnect other voice participants.",
  },
  mention_everyone: {
    label: "Mention @everyone and @here",
    description: "Notify every member, or only members currently online.",
  },
  manage_emojis: {
    label: "Manage emojis",
    description: "Upload and remove this community's custom emojis.",
  },
  view_audit_log: {
    label: "View audit log",
    description: "See who changed what inside this community.",
  },
};

/** Default roles shown when a new community is created. */
export const DEFAULT_ROLE_COLORS = [
  "#5865F2",
  "#67E8F9",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#A78BFA",
];

/**
 * Extracts `@usernames` from a message body so the server can resolve them
 * to real users and create targeted notifications.
 */
export function parseMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_]{2,32})/g) ?? [];
  const names = matches.map((match) => match.slice(1).toLowerCase());
  return Array.from(new Set(names));
}

export interface ChannelPermissionOverwrite {
  roleId: string;
  allow: string[];
  deny: string[];
}

/**
 * Applies Discord-style role overwrites to the member's server permissions.
 * Existing communities predate `view_channel`, so visibility starts enabled
 * and can only be removed by an explicit channel deny.
 */
export function channelPermissions(
  base: readonly string[],
  roleIds: readonly string[],
  everyoneRoleId: string | null,
  overwrites: readonly ChannelPermissionOverwrite[] | undefined,
): string[] {
  if (base.includes(PERMISSIONS.ADMINISTRATOR)) return [...ALL_PERMISSIONS];
  const result = new Set<string>([...base, PERMISSIONS.VIEW_CHANNEL]);
  const relevant = new Set(roleIds);
  if (everyoneRoleId) relevant.add(everyoneRoleId);

  // Denies win across the member's combined roles; an explicit allow only
  // restores a permission when no relevant role denies it.
  const denied = new Set<string>();
  const allowed = new Set<string>();
  for (const overwrite of overwrites ?? []) {
    if (!relevant.has(overwrite.roleId)) continue;
    overwrite.deny.forEach((permission) => denied.add(permission));
    overwrite.allow.forEach((permission) => allowed.add(permission));
  }
  for (const permission of denied) result.delete(permission);
  for (const permission of allowed) {
    if (!denied.has(permission)) result.add(permission);
  }
  return Array.from(result);
}
