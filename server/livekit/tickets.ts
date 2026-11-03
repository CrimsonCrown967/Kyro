import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export interface ConsumedLiveKitTicket {
  roomName: string;
  identity: string;
  displayName: string;
  metadata: string;
  canPublishSources: Array<
    "microphone" | "camera" | "screen_share" | "screen_share_audio"
  >;
  canManage: boolean;
  action: "mute" | "disconnect" | null;
  targetIdentity: string | null;
  trackSid: string | null;
}

const consumeTicketRef = makeFunctionReference<
  "mutation",
  { ticket: string; purpose: "join" | "moderate" },
  ConsumedLiveKitTicket
>("voiceTickets:consume");

export async function consumeLiveKitTicket(
  ticket: string,
  purpose: "join" | "moderate",
) {
  if (!/^[a-zA-Z0-9_-]{40,80}$/.test(ticket)) {
    throw new Error("Invalid ticket.");
  }
  const convexUrl = process.env.VITE_CONVEX_URL?.trim();
  if (!convexUrl) throw new Error("Convex is not configured.");
  const client = new ConvexHttpClient(convexUrl);
  return await client.mutation(consumeTicketRef, { ticket, purpose });
}
