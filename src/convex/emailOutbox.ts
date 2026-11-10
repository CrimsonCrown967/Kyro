import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./functions";
import { deliverEmailRef } from "./emailRefs";
import {
  isPlatformStaff,
  isPlatformTrialStaff,
  requireActiveUser,
} from "./lib";

export type EmailTemplate =
  | "password_reset"
  | "email_verification"
  | "temporary_ban"
  | "permanent_ban"
  | "warning"
  | "restoration";

const EMAIL_RE = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const EVENT_RE = /^[a-zA-Z0-9:_-]{1,200}$/;
const MAX_ATTEMPTS = 6;
const LOCK_MS = 10 * 60_000;
const RETRY_DELAYS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

function safeEmail(value: string): string | null {
  const clean = value.trim().toLowerCase();
  return clean.length <= 254 && EMAIL_RE.test(clean) ? clean : null;
}

function safePayload(value: Record<string, unknown>): string | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 50_000 ? serialized : null;
  } catch {
    return null;
  }
}

/**
 * Transactionally records an email after the product event is saved. The
 * helper never throws, so SMTP infrastructure can never roll back moderation.
 */
export async function enqueueEmail(
  ctx: MutationCtx,
  args: {
    eventKey: string;
    userId?: Id<"users">;
    to: string | null | undefined;
    template: EmailTemplate;
    payload: Record<string, unknown>;
  },
): Promise<Id<"emailOutbox"> | null> {
  try {
    const to = args.to ? safeEmail(args.to) : null;
    const payload = safePayload(args.payload);
    if (!to || !payload || !EVENT_RE.test(args.eventKey)) return null;
    const existing = await ctx.db
      .query("emailOutbox")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const outboxId = await ctx.db.insert("emailOutbox", {
      eventKey: args.eventKey,
      userId: args.userId,
      to,
      template: args.template,
      payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await ctx.scheduler.runAfter(0, deliverEmailRef, { outboxId });
    } catch {
      // The durable row remains pending; the five-minute sweeper will retry it.
    }
    return outboxId;
  } catch {
    return null;
  }
}

export async function enqueueUserEmail(
  ctx: MutationCtx,
  args: {
    eventKey: string;
    userId: Id<"users">;
    template: EmailTemplate;
    payload: Record<string, unknown>;
  },
) {
  const user = await ctx.db.get(args.userId);
  return await enqueueEmail(ctx, {
    ...args,
    to: user?.email,
    payload: {
      displayName: user?.name ?? user?.username ?? "Kyro member",
      username: user?.username ?? "unknown",
      ...args.payload,
    },
  });
}

export const claim = internalMutation({
  args: { outboxId: v.id("emailOutbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status === "sent" || row.status === "dead") return null;
    const now = Date.now();
    if (row.nextAttemptAt > now) return null;
    if (row.status === "sending" && (row.lockedAt ?? 0) > now - LOCK_MS) {
      return null;
    }
    await ctx.db.patch(outboxId, {
      status: "sending",
      attempts: row.attempts + 1,
      lockedAt: now,
      nextAttemptAt: now + LOCK_MS,
      updatedAt: now,
    });
    return {
      eventKey: row.eventKey,
      to: row.to,
      template: row.template,
      payload: row.payload,
    };
  },
});

export const markSent = internalMutation({
  args: {
    outboxId: v.id("emailOutbox"),
    providerMessageId: v.string(),
  },
  handler: async (ctx, { outboxId, providerMessageId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status === "sent") return;
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "sent",
      providerMessageId: providerMessageId.slice(0, 300),
      sentAt: now,
      lockedAt: undefined,
      lastErrorCode: undefined,
      updatedAt: now,
    });
  },
});

export const markFailed = internalMutation({
  args: { outboxId: v.id("emailOutbox"), errorCode: v.string() },
  handler: async (ctx, { outboxId, errorCode }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status === "sent" || row.status === "dead") {
      return { retrying: false };
    }
    const now = Date.now();
    const dead = row.attempts >= MAX_ATTEMPTS;
    const delay =
      RETRY_DELAYS[
        Math.min(Math.max(row.attempts - 1, 0), RETRY_DELAYS.length - 1)
      ];
    const nextAttemptAt = now + delay;
    await ctx.db.patch(outboxId, {
      status: dead ? "dead" : "failed",
      lastErrorCode: errorCode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80),
      nextAttemptAt,
      lockedAt: undefined,
      updatedAt: now,
    });
    if (!dead) {
      try {
        await ctx.scheduler.runAfter(delay, deliverEmailRef, { outboxId });
      } catch {
        // The periodic sweeper will recover it.
      }
    }
    return { retrying: !dead };
  },
});

export const kickDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const batches = await Promise.all(
      (["pending", "failed", "sending"] as const).map((status) =>
        ctx.db
          .query("emailOutbox")
          .withIndex("by_status_next", (q) =>
            q.eq("status", status).lte("nextAttemptAt", now),
          )
          .take(20),
      ),
    );
    const rows = batches.flat().slice(0, 30);
    for (const row of rows) {
      try {
        await ctx.scheduler.runAfter(0, deliverEmailRef, { outboxId: row._id });
      } catch {
        // Leave it due for the next sweep.
      }
    }
    return { scheduled: rows.length };
  },
});

export const cleanupExpiredRecords = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const resetCodes = await ctx.db
      .query("passwordResetCodes")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(200);
    const verificationCodes = await ctx.db
      .query("emailVerificationCodes")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(200);
    const resetHistory = await ctx.db
      .query("passwordResetRequests")
      .withIndex("by_created", (q) => q.lt("createdAt", now - 60 * 60_000))
      .take(200);
    const verificationHistory = await ctx.db
      .query("emailVerificationRequests")
      .withIndex("by_created", (q) => q.lt("createdAt", now - 60 * 60_000))
      .take(200);
    const rows = [
      ...resetCodes,
      ...verificationCodes,
      ...resetHistory,
      ...verificationHistory,
    ];
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

export const notifyExpiredBans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const bans = await ctx.db
      .query("siteBans")
      .filter((q) =>
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lte(q.field("expiresAt"), now),
          q.eq(q.field("liftedAt"), undefined),
        ),
      )
      .take(100);
    let queued = 0;
    for (const ban of bans) {
      const result = await enqueueUserEmail(ctx, {
        eventKey: `siteban:${ban._id}:expired`,
        userId: ban.userId,
        template: "restoration",
        payload: {
          reason: "Your temporary suspension expired.",
          actionAt: ban.expiresAt,
        },
      });
      if (result) queued += 1;
    }
    return { queued };
  },
});

async function requireEmailStaff(ctx: Parameters<typeof requireActiveUser>[0]) {
  const { id, user } = await requireActiveUser(ctx);
  if (!isPlatformStaff(user)) {
    throw new Error("Only Kyro staff can manage email delivery.");
  }
  return id;
}

async function requireEmailViewer(
  ctx: Parameters<typeof requireActiveUser>[0],
) {
  const { id, user } = await requireActiveUser(ctx);
  if (!isPlatformTrialStaff(user)) {
    throw new Error("The Admin Portal is only available to Kyro staff.");
  }
  return id;
}

export const failures = query({
  args: {},
  handler: async (ctx) => {
    await requireEmailViewer(ctx);
    const [failed, dead] = await Promise.all([
      ctx.db
        .query("emailOutbox")
        .withIndex("by_status_next", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(50),
      ctx.db
        .query("emailOutbox")
        .withIndex("by_status_next", (q) => q.eq("status", "dead"))
        .order("desc")
        .take(50),
    ]);
    return [...failed, ...dead]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
      .map((row) => ({
        id: row._id as string,
        eventKey: row.eventKey,
        template: row.template,
        status: row.status,
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt,
        lastErrorCode: row.lastErrorCode ?? "UNKNOWN",
        updatedAt: row.updatedAt,
      }));
  },
});

export const retry = mutation({
  args: { outboxId: v.id("emailOutbox") },
  handler: async (ctx, { outboxId }) => {
    await requireEmailStaff(ctx);
    const row = await ctx.db.get(outboxId);
    if (!row || (row.status !== "failed" && row.status !== "dead")) {
      throw new Error("That email is not available for retry.");
    }
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastErrorCode: undefined,
      lockedAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, deliverEmailRef, { outboxId });
  },
});
