import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";

export const createVoiceJoinTicketRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    ticketHash: string;
    containerType: "channel" | "conversation";
    containerId: string;
  },
  {
    roomName: string;
    canManage: boolean;
    expiresAt: number;
  }
>("voiceAuthInternal:createJoinTicket");

export const createVoiceModerationTicketRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    ticketHash: string;
    channelId: Id<"channels">;
    targetUserId: Id<"users">;
    action: "mute" | "disconnect";
    trackSid?: string;
  },
  { expiresAt: number }
>("voiceAuthInternal:createModerationTicket");
