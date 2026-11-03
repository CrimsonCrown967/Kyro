import { createParticipantToken } from "../../server/livekit/config.js";
import { consumeLiveKitTicket } from "../../server/livekit/tickets.js";

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(value: unknown): unknown;
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }
  const length = Number(request.headers["content-length"] ?? 0);
  if (length > 2_000) {
    return response.status(413).json({ ok: false, code: "PAYLOAD_TOO_LARGE" });
  }
  let ticket: string;
  try {
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    ticket = String((body as Record<string, unknown>).ticket ?? "");
  } catch {
    return response.status(400).json({ ok: false, code: "INVALID_REQUEST" });
  }

  try {
    const grant = await consumeLiveKitTicket(ticket, "join");
    const credentials = await createParticipantToken(grant);
    return response.status(200).json({
      ok: true,
      serverUrl: credentials.url,
      token: credentials.token,
      roomName: grant.roomName,
      canManage: grant.canManage,
      canPublishSources: grant.canPublishSources,
    });
  } catch (error) {
    console.warn("LiveKit token request denied", {
      code:
        error instanceof Error && error.message.includes("configured")
          ? "NOT_CONFIGURED"
          : "TICKET_DENIED",
    });
    return response.status(401).json({ ok: false, code: "TOKEN_DENIED" });
  }
}
