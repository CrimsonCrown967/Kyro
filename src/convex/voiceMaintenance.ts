import { internalMutation } from "./functions";
import { PERMISSIONS } from "../lib/permissions";

/** Backfills new voice grants onto every existing @everyone role. */
export const backfillDefaultVoicePermissions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const roles = await ctx.db.query("serverRoles").collect();
    const additions = [
      PERMISSIONS.CONNECT_VOICE,
      PERMISSIONS.SPEAK_VOICE,
      PERMISSIONS.VIDEO,
      PERMISSIONS.SHARE_SCREEN,
    ];
    let updated = 0;
    for (const role of roles) {
      if (!role.isDefault) continue;
      const permissions = Array.from(
        new Set([...role.permissions, ...additions]),
      );
      if (permissions.length === role.permissions.length) continue;
      await ctx.db.patch(role._id, { permissions });
      updated += 1;
    }
    return { updated };
  },
});
