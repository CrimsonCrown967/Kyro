import { internalMutation } from "./_generated/server";
import { configuredFounderId } from "./lib";

/** Idempotent one-off used to mark Kyro's official identities. */
export const markOfficialAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const kyro = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", "kyro"))
      .unique();
    if (!kyro)
      throw new Error('The account with username "kyro" was not found.');
    await ctx.db.patch(kyro._id, { name: "Kyro", official: true });

    const founderId = configuredFounderId();
    if (founderId) {
      const founder = await ctx.db.get(founderId as typeof kyro._id);
      if (founder) await ctx.db.patch(founder._id, { official: true });
    }
    return {
      kyroUserId: kyro._id,
      founderMarked: founderId !== null,
    };
  },
});
