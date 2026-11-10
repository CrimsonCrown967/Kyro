import { v } from "convex/values";
import { mutation, query } from "./functions";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  canDelegatePermissions,
} from "../lib/permissions";
import {
  can,
  logAudit,
  requireProfile,
  requireServerAccess,
  requireUser,
  type Ctx,
  type ServerAccess,
} from "./lib";
import type { Doc } from "./_generated/dataModel";

/**
 * Old role rows can share the same numeric position, which makes drag/drop and
 * hierarchy checks appear to do nothing. Preserve the order currently shown in
 * the UI, then assign stable unique ranks above @everyone.
 */
async function normalizeRolePositions(
  ctx: Parameters<typeof logAudit>[0],
  serverId: Doc<"servers">["_id"],
) {
  const roles = await ctx.db
    .query("serverRoles")
    .withIndex("by_server", (q) => q.eq("serverId", serverId))
    .collect();
  const defaults = roles
    .filter((role) => role.isDefault)
    .sort((a, b) => a._creationTime - b._creationTime);
  const primaryDefault = defaults[0] ?? null;
  const ordered = roles
    .filter((role) => role._id !== primaryDefault?._id)
    .sort(
      (a, b) => b.position - a.position || a._creationTime - b._creationTime,
    );
  let changed = false;
  const normalized: Doc<"serverRoles">[] = [];
  if (primaryDefault) {
    if (primaryDefault.position !== 0) {
      await ctx.db.patch(primaryDefault._id, { position: 0 });
      changed = true;
    }
    normalized.push({ ...primaryDefault, position: 0 });
  }
  for (const [index, role] of ordered.entries()) {
    const position = ordered.length - index;
    const patch: Partial<Doc<"serverRoles">> = {};
    if (role.position !== position) patch.position = position;
    if (role.isDefault) patch.isDefault = false;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(role._id, patch);
      changed = true;
    }
    normalized.push({ ...role, ...patch, position });
  }
  return { roles: normalized, changed };
}

export const list = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    await requireServerAccess(ctx, serverId, id);
    const [roles, members] = await Promise.all([
      ctx.db
        .query("serverRoles")
        .withIndex("by_server_position", (q) => q.eq("serverId", serverId))
        .collect(),
      ctx.db
        .query("serverMembers")
        .withIndex("by_server", (q) => q.eq("serverId", serverId))
        .take(5000),
    ]);
    const counts = new Map<string, number>();
    for (const member of members) {
      for (const roleId of member.roleIds) {
        counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      }
    }
    return roles.map((role) => ({
      id: role._id as string,
      name: role.name,
      color: role.color ?? null,
      position: role.position,
      isDefault: role.isDefault,
      hoist: role.hoist === true,
      mentionable: role.mentionable === true,
      permissions: role.permissions,
      // @everyone applies to every member; other roles count actual holders.
      memberCount: role.isDefault
        ? members.length
        : (counts.get(role._id) ?? 0),
    }));
  },
});

/** Repairs duplicate legacy ranks when a manager opens the role editor. */
export const normalizePositions = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    const result = await normalizeRolePositions(ctx, serverId);
    if (result.changed) {
      await logAudit(ctx, {
        serverId,
        actorId: id,
        action: "role.normalize_positions",
        targetType: "server",
        targetId: serverId,
        details: "Repaired duplicate or invalid role positions",
      });
    }
    return { changed: result.changed };
  },
});

/**
 * Align a role: move it up or down past `steps` neighbouring roles in the
 * rank order (higher position = higher rank). Positions are only ever
 * swapped between two existing roles, and never with a slot above the
 * actor's own highest role — mirroring the guards on update/remove — so
 * reordering can't be used to climb past your own rank.
 */
export const move = mutation({
  args: {
    roleId: v.id("serverRoles"),
    direction: v.union(v.literal("up"), v.literal("down")),
    steps: v.optional(v.number()),
  },
  handler: async (ctx, { roleId, direction, steps }) => {
    const { id } = await requireProfile(ctx);
    const role = await ctx.db.get(roleId);
    if (!role) throw new Error("That role doesn't exist.");
    const access = await requireServerAccess(ctx, role.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    if (role.isDefault) {
      throw new Error("The @everyone role stays at the bottom.");
    }
    const { roles } = await normalizeRolePositions(ctx, role.serverId);
    const normalizedRole = roles.find((entry) => entry._id === roleId) ?? role;
    const sorted = [...roles].sort((a, b) => a.position - b.position);
    const from = sorted.findIndex((entry) => entry._id === roleId);
    const distance = Math.max(
      1,
      Math.min(Math.trunc(steps ?? 1), sorted.length - 1),
    );
    // Index 0 belongs to @everyone, so nothing else can move below it.
    const to =
      direction === "up"
        ? Math.min(from + distance, sorted.length - 1)
        : Math.max(from - distance, 1);
    if (to === from) return;

    const myTop = await topPosition(ctx, access, roles);
    if (normalizedRole.position >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't move a role as high as your own.");
    }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (sorted[i].position >= myTop && access.server.ownerId !== id) {
        throw new Error("You can't move a role above your own.");
      }
    }

    // Bubble the role into place: adjacent position swaps, one transaction.
    const step = to > from ? 1 : -1;
    for (let i = from; i !== to; i += step) {
      const current = sorted[i];
      const neighbour = sorted[i + step];
      const currentPos = current.position;
      await ctx.db.patch(current._id, { position: neighbour.position });
      await ctx.db.patch(neighbour._id, { position: currentPos });
    }

    await logAudit(ctx, {
      serverId: role.serverId,
      actorId: id,
      action: "role.move",
      targetType: "role",
      targetId: roleId,
      details: `${role.name} moved ${direction}`,
    });
  },
});

export const create = mutation({
  args: {
    serverId: v.id("servers"),
    name: v.string(),
    color: v.optional(v.string()),
    permissions: v.array(v.string()),
    hoist: v.optional(v.boolean()),
    mentionable: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { serverId, name, color, permissions, hoist, mentionable },
  ) => {
    const { id } = await requireProfile(ctx);
    const access = await requireServerAccess(ctx, serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    const clean = name.trim().slice(0, 60);
    if (clean.length < 2) throw new Error("Role names need 2+ characters.");
    const { roles: existing } = await normalizeRolePositions(ctx, serverId);
    if (
      existing.some((role) => role.name.toLowerCase() === clean.toLowerCase())
    ) {
      throw new Error("A role with that name already exists.");
    }
    const myTop = await topPosition(ctx, access, existing);
    const requested = sanitizePermissions(permissions);
    const isOwner = access.server.ownerId === id;
    if (!canDelegatePermissions(access.permissions, requested, isOwner)) {
      throw new Error("You can only grant permissions you already have.");
    }
    const highestExisting = existing.reduce(
      (max, role) => Math.max(max, role.position),
      0,
    );
    const highestBelowMine = existing
      .filter((role) => role.position < myTop)
      .reduce((max, role) => Math.max(max, role.position), 0);
    const position = isOwner
      ? highestExisting + 1
      : (highestBelowMine + myTop) / 2;
    const roleId = await ctx.db.insert("serverRoles", {
      serverId,
      name: clean,
      color: color || undefined,
      position,
      permissions: requested,
      isDefault: false,
      hoist: hoist === true || undefined,
      mentionable: mentionable === true || undefined,
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "role.create",
      targetType: "role",
      targetId: roleId,
      details: clean,
    });
    return roleId;
  },
});

export const update = mutation({
  args: {
    roleId: v.id("serverRoles"),
    name: v.optional(v.string()),
    color: v.optional(v.union(v.string(), v.null())),
    permissions: v.optional(v.array(v.string())),
    hoist: v.optional(v.boolean()),
    mentionable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id } = await requireProfile(ctx);
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("That role doesn't exist.");
    const access = await requireServerAccess(ctx, role.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    const { roles } = await normalizeRolePositions(ctx, role.serverId);
    const normalizedRole =
      roles.find((entry) => entry._id === args.roleId) ?? role;
    const myTop = await topPosition(ctx, access, roles);
    if (
      !role.isDefault &&
      normalizedRole.position >= myTop &&
      access.server.ownerId !== id
    ) {
      throw new Error("You can't edit a role as high as your own.");
    }
    const patch: Partial<typeof role> = {};
    if (args.name !== undefined) {
      const clean = args.name.trim().slice(0, 60);
      if (clean.length < 2) throw new Error("Role names need 2+ characters.");
      if (
        roles.some(
          (entry) =>
            entry._id !== role._id &&
            entry.name.toLowerCase() === clean.toLowerCase(),
        )
      ) {
        throw new Error("A role with that name already exists.");
      }
      patch.name = clean;
    }
    if (args.color !== undefined) {
      if (args.color && !/^#[0-9a-fA-F]{6}$/.test(args.color)) {
        throw new Error("Colour must look like #67E8F9.");
      }
      patch.color = args.color || undefined;
    }
    if (args.permissions !== undefined) {
      const requested = sanitizePermissions(args.permissions);
      if (
        !canDelegatePermissions(
          access.permissions,
          requested,
          access.server.ownerId === id,
        )
      ) {
        throw new Error("You can only grant permissions you already have.");
      }
      patch.permissions = requested;
    }
    if (args.hoist !== undefined) patch.hoist = args.hoist || undefined;
    if (args.mentionable !== undefined) {
      patch.mentionable = args.mentionable || undefined;
    }
    await ctx.db.patch(args.roleId, patch);
    await logAudit(ctx, {
      serverId: role.serverId,
      actorId: id,
      action: "role.update",
      targetType: "role",
      targetId: args.roleId,
      details: Object.keys(args)
        .filter((key) => key !== "roleId")
        .join(", "),
    });
  },
});

export const remove = mutation({
  args: { roleId: v.id("serverRoles") },
  handler: async (ctx, { roleId }) => {
    const { id } = await requireProfile(ctx);
    const role = await ctx.db.get(roleId);
    if (!role) return;
    const access = await requireServerAccess(ctx, role.serverId, id);
    if (!can(access.permissions, PERMISSIONS.MANAGE_ROLES)) {
      throw new Error("You don't have permission to manage roles.");
    }
    if (role.isDefault) throw new Error("The @everyone role can't be deleted.");
    const { roles } = await normalizeRolePositions(ctx, role.serverId);
    const normalizedRole = roles.find((entry) => entry._id === roleId) ?? role;
    const myTop = await topPosition(ctx, access, roles);
    if (normalizedRole.position >= myTop && access.server.ownerId !== id) {
      throw new Error("You can't delete a role as high as your own.");
    }
    const members = await ctx.db
      .query("serverMembers")
      .withIndex("by_server", (q) => q.eq("serverId", role.serverId))
      .collect();
    for (const member of members) {
      if (member.roleIds.includes(roleId)) {
        await ctx.db.patch(member._id, {
          roleIds: member.roleIds.filter((existing) => existing !== roleId),
        });
      }
    }
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_server", (q) => q.eq("serverId", role.serverId))
      .collect();
    for (const channel of channels) {
      const next = (channel.permissionOverwrites ?? []).filter(
        (overwrite) => overwrite.roleId !== roleId,
      );
      if (next.length !== (channel.permissionOverwrites ?? []).length) {
        await ctx.db.patch(channel._id, {
          permissionOverwrites: next.length > 0 ? next : undefined,
        });
      }
    }
    await ctx.db.delete(roleId);
    await logAudit(ctx, {
      serverId: role.serverId,
      actorId: id,
      action: "role.delete",
      targetType: "role",
      targetId: roleId,
      details: role.name,
    });
  },
});

function sanitizePermissions(permissions: string[]): string[] {
  const valid = new Set<string>(ALL_PERMISSIONS);
  return Array.from(new Set(permissions)).filter((permission) =>
    valid.has(permission),
  );
}

async function topPosition(
  ctx: Ctx,
  access: ServerAccess,
  roles: Doc<"serverRoles">[],
): Promise<number> {
  if (access.server.ownerId === access.member.userId)
    return Number.MAX_SAFE_INTEGER;
  const assigned = roles.filter((role) =>
    access.member.roleIds.includes(role._id),
  );
  return assigned.length > 0
    ? Math.max(...assigned.map((role) => role.position))
    : 0;
}
