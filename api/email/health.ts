import { verifySmtpConnection } from "../../server/email/transport.js";
import { isAuthorized, safeErrorCode } from "../../server/email/validation.js";

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
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
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
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
  try {
    await verifySmtpConnection();
    return response.status(200).json({ ok: true });
  } catch (error) {
    const code = safeErrorCode(error);
    console.error("Kyro SMTP health check failed", { code });
    return response.status(502).json({ ok: false, code });
  }
}
