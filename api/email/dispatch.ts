import { renderEmailTemplate } from "../../server/email/templates.js";
import { sendTransactionalEmail } from "../../server/email/transport.js";
import {
  isAuthorized,
  safeErrorCode,
  validateDispatchRequest,
} from "../../server/email/validation.js";

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
  const secret = process.env.EMAIL_DISPATCH_SECRET;
  const authorization = request.headers.authorization;
  if (
    !secret ||
    !isAuthorized(
      Array.isArray(authorization) ? authorization[0] : authorization,
      secret,
    )
  ) {
    return response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }
  const lengthHeader = request.headers["content-length"];
  const contentLength = Number(
    Array.isArray(lengthHeader) ? lengthHeader[0] : (lengthHeader ?? 0),
  );
  if (contentLength > 64_000) {
    return response.status(413).json({ ok: false, code: "PAYLOAD_TOO_LARGE" });
  }
  let dispatch;
  try {
    const body =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
    dispatch = validateDispatchRequest(body);
  } catch {
    return response.status(400).json({ ok: false, code: "INVALID_REQUEST" });
  }

  try {
    const rendered = renderEmailTemplate(dispatch.template, dispatch.payload);
    const result = await sendTransactionalEmail({
      eventId: dispatch.eventId,
      to: dispatch.to,
      rendered,
    });
    return response.status(200).json({ ok: true, messageId: result.messageId });
  } catch (error) {
    const code = safeErrorCode(error);
    console.error("Kyro SMTP delivery failed", {
      eventId: dispatch.eventId,
      template: dispatch.template,
      code,
    });
    return response.status(502).json({ ok: false, code });
  }
}
