import { create } from "zustand";

const KEY = "kyro.conversation-favorites.v1";
type Favorites = Record<string, string[]>;
function readFavorites(): Favorites {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw)
        .filter(([id, values]) => id.length <= 200 && Array.isArray(values))
        .map(([id, values]) => [
          id,
          (values as unknown[])
            .filter(
              (value): value is string =>
                typeof value === "string" && value.length <= 200,
            )
            .slice(0, 100),
        ]),
    );
  } catch {
    return {};
  }
}
export const useConversationFavorites = create<{
  byUser: Favorites;
  toggle: (userId: string, conversationId: string) => void;
}>((set) => ({
  byUser: readFavorites(),
  toggle: (userId, conversationId) =>
    set((state) => {
      const current = state.byUser[userId] ?? [];
      const next = current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId].slice(-100);
      const byUser = { ...state.byUser, [userId]: next };
      try {
        localStorage.setItem(KEY, JSON.stringify(byUser));
      } catch {
        /* Session-only if storage is unavailable. */
      }
      return { byUser };
    }),
}));
