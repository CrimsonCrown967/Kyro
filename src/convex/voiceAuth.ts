import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./functions";
import {
  createVoiceJoinTicketRef,
  createVoiceModerationTicketRef,
} from "./voiceAuthRefs";
import { sha256Hex } from "./sha256";

function newTicket(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const issueJoinTicket = action({
  args: {
    containerType: v.union(v.literal("channel"), v.literal("conversation")),
    containerId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You need to sign in to join voice.");
    const ticket = newTicket();
    const grant = await ctx.runMutation(createVoiceJoinTicketRef, {
      userId,
      ticketHash: sha256Hex(ticket),
      ...args,
    });
    return { ticket, ...grant };
  },
});

export const issueModerationTicket = action({
  args: {
    channelId: v.id("channels"),
    targetUserId: v.id("users"),
    action: v.union(v.literal("mute"), v.literal("disconnect")),
    trackSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You need to sign in to manage voice.");
    const ticket = newTicket();
    const grant = await ctx.runMutation(createVoiceModerationTicketRef, {
      userId,
      ticketHash: sha256Hex(ticket),
      ...args,
    });
    return { ticket, ...grant };
  },
});
