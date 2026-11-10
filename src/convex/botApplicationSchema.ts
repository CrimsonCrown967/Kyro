import { defineTable } from "convex/server";
import { v } from "convex/values";

export const botApplicationTables = {
  botApplications: defineTable({
    ownerId: v.id("users"),
    botUserId: v.id("users"),
    name: v.string(),
    description: v.string(),
    botDescription: v.string(),
    iconStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    enabled: v.boolean(),
    suspended: v.boolean(),
    deletedAt: v.optional(v.number()),
    discoverable: v.boolean(),
    verified: v.boolean(),
    featured: v.boolean(),
    category: v.string(),
    defaultPermissions: v.array(v.string()),
    tokenHash: v.optional(v.string()),
    tokenVersion: v.number(),
    tokenUpdatedAt: v.optional(v.number()),
    subscriptions: v.array(v.string()),
    webhookUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeen: v.optional(v.number()),
    apiRequests: v.optional(v.number()),
    commandsExecuted: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["tokenHash"])
    .index("by_bot_user", ["botUserId"])
    .index("by_presence", ["enabled", "lastSeen"])
    .index("by_directory", ["discoverable", "enabled", "createdAt"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["discoverable", "enabled", "category"],
    }),
  botInstallations: defineTable({
    applicationId: v.id("botApplications"),
    serverId: v.id("servers"),
    roleId: v.id("serverRoles"),
    permissions: v.array(v.string()),
    installedById: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_application", ["applicationId"])
    .index("by_server", ["serverId"])
    .index("by_application_server", ["applicationId", "serverId"]),
  botAuditLogs: defineTable({
    applicationId: v.id("botApplications"),
    actorId: v.id("users"),
    action: v.string(),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_application", ["applicationId", "createdAt"]),
  botReports: defineTable({
    applicationId: v.id("botApplications"),
    reporterId: v.id("users"),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    reviewedById: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_reporter", ["reporterId", "createdAt"]),
};
