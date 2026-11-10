import { defineTable } from "convex/server";
import { v } from "convex/values";

export const botTables = {
  botApplications: defineTable({
    ownerId: v.id("users"),
    botUserId: v.id("users"),
    name: v.string(),
    description: v.string(),
    iconStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    enabled: v.boolean(),
    discoverable: v.boolean(),
    category: v.string(),
    verified: v.boolean(),
    featured: v.boolean(),
    suspended: v.boolean(),
    suspensionReason: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    tokenHash: v.optional(v.string()),
    tokenUpdatedAt: v.number(),
    permissions: v.array(v.string()),
    events: v.array(v.string()),
    webhookUrl: v.optional(v.string()),
    deliveryMode: v.union(v.literal("poll"), v.literal("webhook")),
    apiRequests: v.number(),
    commandsExecuted: v.number(),
    lastActiveAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["tokenHash"])
    .index("by_public", ["discoverable", "createdAt"]),
  botInstallations: defineTable({
    applicationId: v.id("botApplications"),
    serverId: v.id("servers"),
    roleId: v.id("serverRoles"),
    installedBy: v.id("users"),
    permissions: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_app", ["applicationId"])
    .index("by_server", ["serverId"])
    .index("by_app_server", ["applicationId", "serverId"]),
  botCommands: defineTable({
    applicationId: v.id("botApplications"),
    serverId: v.optional(v.id("servers")),
    name: v.string(),
    description: v.string(),
    permissions: v.array(v.string()),
    options: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        type: v.union(
          v.literal("string"),
          v.literal("integer"),
          v.literal("boolean"),
          v.literal("user"),
        ),
        required: v.boolean(),
        choices: v.optional(v.array(v.string())),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_app", ["applicationId"])
    .index("by_app_scope_name", ["applicationId", "serverId", "name"]),
  botInteractions: defineTable({
    applicationId: v.id("botApplications"),
    commandId: v.id("botCommands"),
    userId: v.id("users"),
    serverId: v.id("servers"),
    channelId: v.id("channels"),
    options: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    respondedAt: v.optional(v.number()),
    ephemeral: v.optional(v.boolean()),
    response: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
  })
    .index("by_user_channel", ["userId", "channelId", "createdAt"])
    .index("by_app", ["applicationId", "createdAt"])
    .index("by_expiry", ["expiresAt"]),
  botEvents: defineTable({
    applicationId: v.id("botApplications"),
    deliveryMode: v.optional(v.union(v.literal("poll"), v.literal("webhook"))),
    serverId: v.id("servers"),
    channelId: v.optional(v.id("channels")),
    type: v.string(),
    payload: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("leased"),
      v.literal("delivered"),
      v.literal("dead"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    leaseUntil: v.optional(v.number()),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_app_status_due", ["applicationId", "status", "nextAttemptAt"])
    .index("by_status_due", ["status", "nextAttemptAt"])
    .index("by_delivery_status_due", [
      "deliveryMode",
      "status",
      "nextAttemptAt",
    ])
    .index("by_app_delivery", ["applicationId", "deliveryMode"])
    .index("by_app_created", ["applicationId", "createdAt"])
    .index("by_expiry", ["expiresAt"]),
  botRateLimits: defineTable({
    key: v.string(),
    window: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_window", ["window"]),
  botAuditLogs: defineTable({
    applicationId: v.id("botApplications"),
    actorId: v.optional(v.id("users")),
    action: v.string(),
    details: v.string(),
    createdAt: v.number(),
  }).index("by_app", ["applicationId", "createdAt"]),
};
