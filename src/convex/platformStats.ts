import { query } from "./_generated/server";
import { PRESENCE_TIMEOUT_MS } from "./lib";

/** Public, live counters used by the marketing homepage. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const [users, communities] = await Promise.all([
      ctx.db.query("users").take(10_000),
      ctx.db.query("servers").take(10_000),
    ]);
    const activeUsers = users.filter((user) => user.deletedAt === undefined);
    const now = Date.now();
    const onlineMembers = activeUsers.filter(
      (user) =>
        user.showPresence !== false &&
        user.status !== "offline" &&
        user.status !== "invisible" &&
        user.lastSeen !== undefined &&
        now - user.lastSeen < PRESENCE_TIMEOUT_MS,
    ).length;
    return {
      users: activeUsers.length,
      communities: communities.length,
      onlineMembers,
    };
  },
});
