const STORAGE_KEY = "kyro.remembered-accounts.v1";

export interface RememberedAccount {
  email: string;
  name?: string;
  username?: string;
  avatarUrl?: string | null;
  lastUsedAt: number;
}

export function rememberedAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is RememberedAccount =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as RememberedAccount).email === "string" &&
          typeof (entry as RememberedAccount).lastUsedAt === "number",
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberAccount(
  account: Omit<RememberedAccount, "lastUsedAt">,
) {
  if (typeof window === "undefined") return;
  const email = account.email.trim().toLowerCase();
  if (!email) return;
  const remembered = rememberedAccounts();
  const previous = remembered.find((entry) => entry.email === email);
  const next = [
    {
      ...previous,
      ...account,
      email,
      // A password-only sign-in only knows the email; retain richer profile
      // details captured before sign-out instead of erasing them.
      name: account.name ?? previous?.name,
      username: account.username ?? previous?.username,
      avatarUrl: account.avatarUrl ?? previous?.avatarUrl,
      lastUsedAt: Date.now(),
    },
    ...remembered.filter((entry) => entry.email !== email),
  ].slice(0, 8);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Account switching remains usable as a normal sign-out when storage is
    // unavailable (private mode, a full quota, or a locked-down browser).
  }
}

export function forgetAccount(email: string) {
  if (typeof window === "undefined") return;
  const next = rememberedAccounts().filter(
    (entry) => entry.email !== email.trim().toLowerCase(),
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best effort only; no authentication material is stored here.
  }
}
