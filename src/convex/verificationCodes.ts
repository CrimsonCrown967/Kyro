import { sha256Hex } from "./sha256";

/** Cryptographically secure, uniformly distributed six-digit code. */
export function generateSixDigitCode(): string {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.getRandomValues) {
    throw new Error("Secure random-number generation is unavailable.");
  }
  const limit = Math.floor(0x1_0000_0000 / 900_000) * 900_000;
  const values = new Uint32Array(1);
  do {
    cryptoRef.getRandomValues(values);
  } while (values[0] >= limit);
  return String(100_000 + (values[0] % 900_000));
}

export function secureCodeHash(
  pepper: string,
  purpose: string,
  email: string,
  code: string,
): string {
  if (pepper.length < 32)
    throw new Error("Verification-code pepper is not configured.");
  return sha256Hex(`${pepper}:${purpose}:${email}:${code}`);
}
