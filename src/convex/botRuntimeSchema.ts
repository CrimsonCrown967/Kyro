import { defineTable } from "convex/server";
import { v } from "convex/values";

export const botOptionValidator = v.object({
  name: v.string(),
  description: v.string(),
  type: v.union(
    v.literal("string"),
    v.literal("integer"),
    v.literal("boolean"),
    v.literal("user"),
  ),
  required: v.optional(v.boolean()),
  choices: v.optional(
    v.array(
      v.object({ name: v.string(), value: v.union(v.string(), v.number()) }),
    ),
  ),
});
export const botCommandValidator = v.object({
  name: v.string(),
  description: v.string(),
  options: v.optional(v.array(botOptionValidator)),
  permissions: v.optional(v.array(v.string())),
});
export const botEmbedValidator = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  url: v.optional(v.string()),
  color: v.optional(v.string()),
  fields: v.optional(
    v.array(
      v.object({
        name: v.string(),
        value: v.string(),
        inline: v.optional(v.boolean()),
      }),
    ),
  ),
});
export const botRuntimeTables = {
  botCommands: defineTable({
    applicationId: v.id("botApplications"),
    serverId: v.optional(v.id("servers")),
    name: v.string(),
    description: v.string(),
    options: v.array(botOptionValidator),
    permissions: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_application", ["applicationId", "serverId"]),
  botInteractions: defineTable({
    applicationId: v.id("botApplications"),
    commandId: v.id("botCommands"),
    commandName: v.string(),
    channelId: v.id("channels"),
    serverId: v.id("servers"),
    userId: v.id("users"),
    optionsJson: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    respondedAt: v.optional(v.number()),
    response: v.optional(
      v.object({
        content: v.string(),
        ephemeral: v.boolean(),
        embeds: v.optional(v.array(botEmbedValidator)),
      }),
    ),
    responseMessageId: v.optional(v.id("messages")),
  })
    .index("by_user_channel", ["userId", "channelId", "createdAt"])
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_expiry", ["expiresAt"]),
  botEvents: defineTable({
    visibleToApplicationIds: v.optional(v.array(v.id("botApplications"))),
    type: v.string(),
    serverId: v.id("servers"),
    channelId: v.optional(v.id("channels")),
    applicationId: v.optional(v.id("botApplications")),
    dataJson: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),
  botEventDeliveries: defineTable({
    applicationId: v.id("botApplications"),
    eventId: v.id("botEvents"),
    status: v.union(
      v.literal("pending"),
      v.literal("inflight"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    leaseUntil: v.optional(v.number()),
    acknowledgedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_application_status", ["applicationId", "status", "createdAt"])
    .index("by_application_event", ["applicationId", "eventId"])
    .index("by_application_created", ["applicationId", "createdAt"])
    .index("by_status_due", ["status", "nextAttemptAt"])
    .index("by_created", ["createdAt"]),
  botRateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_window", ["windowStart"]),
  botApiUsage: defineTable({
    applicationId: v.id("botApplications"),
    day: v.string(),
    requests: v.number(),
    commands: v.number(),
  }).index("by_application_day", ["applicationId", "day"]),
};
