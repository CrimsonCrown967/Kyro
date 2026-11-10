import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

export function publicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function webhookPublicKey(encoded: string) {
  return createPublicKey(
    createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    }),
  )
    .export({ format: "pem", type: "spki" })
    .toString();
}
export function webhookSignature(
  encoded: string,
  timestamp: string,
  body: string,
) {
  return sign(
    null,
    Buffer.from(`${timestamp}.${body}`),
    createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    }),
  ).toString("base64");
}
/** Resolve and pin a public IP for this exact request to prevent DNS rebinding. */
export async function deliverWebhook(
  urlValue: string,
  body: string,
  signature: string,
  timestamp: string,
  eventId: string,
) {
  const url = new URL(urlValue);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("UNSAFE_WEBHOOK_URL");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("DNS_TIMEOUT")), 5000);
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
    throw new Error("UNSAFE_WEBHOOK_ADDRESS");
  const address = addresses[0].address;
  await new Promise<void>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        timeout: 10000,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Kyro-Signature": signature,
          "X-Kyro-Timestamp": timestamp,
          "X-Kyro-Event-Id": eventId,
          "User-Agent": "Kyro-Webhooks/1.0",
        },
      },
      (response) => {
        response.destroy();
        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        )
          resolve();
        else reject(new Error(`HTTP_${response.statusCode ?? 0}`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("DELIVERY_TIMEOUT")));
    req.on("error", () => reject(new Error("DELIVERY_FAILED")));
    req.end(body);
  });
}
