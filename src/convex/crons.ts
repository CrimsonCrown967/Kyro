import { cronJobs } from "convex/server";
import {
  cleanupEmailRecordsRef,
  kickDueEmailsRef,
  notifyExpiredBansRef,
} from "./emailRefs";

const crons = cronJobs();

crons.interval(
  "retry transactional emails",
  { minutes: 5 },
  kickDueEmailsRef,
  {},
);
crons.interval(
  "clean expired verification records",
  { hours: 1 },
  cleanupEmailRecordsRef,
  {},
);
crons.interval(
  "email expired-ban restorations",
  { minutes: 15 },
  notifyExpiredBansRef,
  {},
);

export default crons;
