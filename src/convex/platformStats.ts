import { query } from "./functions";
import { metricValue } from "./metricsLib";

/** Three tiny counter reads instead of scanning profiles on each heartbeat. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const [users, communities, onlineMembers] = await Promise.all([
      metricValue(ctx, "users"),
      metricValue(ctx, "servers"),
      metricValue(ctx, "publicOnline"),
    ]);
    return { users, communities, onlineMembers };
  },
});
