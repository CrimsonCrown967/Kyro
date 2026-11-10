# Convex database I/O changes

Kyro's live website uses `giant-cricket-958`. It is labelled a development
deployment in Convex. The configured function directory is `src/convex/`, so the
schema is `src/convex/schema.ts`.

Database I/O measures repeated reads and writes, not just stored bytes. The
reported 12.61 GB of I/O with 4.6 MB stored is consistent with repeatedly reading
the same data. This investigation found concrete sources of repeated work; it
does not establish an exact historical breakdown of the billed usage.

The largest amplification came from `users:heartbeat`: every 15 seconds it wrote
`lastSeen`, status, device and IP timestamps to the user document. Most signed-in
queries call `requireUser`, and message/member lists also hydrate profiles. Those
writes could invalidate all of those subscriptions even when nothing visible
changed. Homepage counters scanned users/servers, admin totals scanned messages
and profiles, and discovery loaded up to 200 profiles per community for counts.

The changes are:

- Heartbeats run every 60 seconds. Client requests are coalesced, and the backend
  ignores lease renewals within 45 seconds, including requests from old clients.
  A small indexed `userPresence` lease receives routine writes. Profiles change
  on connection/status/device transitions and IP changes, not every heartbeat.
  Bot authentication uses the same presence path.
- A once-per-minute job reads only expired leases and marks profiles offline.
  With the 150-second lease, disconnection normally appears within 150–210
  seconds of the final heartbeat. The job handles at most 200 leases per run;
  exceptionally large simultaneous disconnects can take additional runs.
  Last-seen timestamps describe connection/disconnection rather than every tick.
  The IP timestamp records when the currently captured address changed.
- Indexed `metrics` counters replace homepage/admin user, community and message
  scans. Homepage statistics read three small records. Per-community member and
  online counters replace member/profile scans in discovery and server summaries.
  Transactional triggers maintain the counters; per-source `metricEntries` make
  retries and migration idempotent. Convex Auth's user callback handles user
  creation outside the application's database wrapper. The auth provider and
  credential/2FA behavior are unchanged.
- New indexes narrow community-tag previews, public discovery, default-role
  lookup, active-account selection, bans by user/lift/expiry, warnings by expiry,
  notifications by user/container/read state, and typing by container/user/expiry.
  Existing indexes are reused for user warning histories and account lookups.
  Admin account search uses username prefixes and name full-text search rather
  than substring matching over the first 1,000 accounts.
- Admin report/ban/warning lists fetch only the referenced people. Permission
  calculation reads the default role plus assigned roles instead of all roles.
- Read receipts advance to the latest message timestamp and skip equal cursors.
  Notification changes are scoped to the viewer and container. Repeated channel
  preference updates and typing requests skip redundant writes. The inbox badge
  reads at most ten unread records, preserving its existing `9+` presentation.
- The expired-ban notification job uses an expiry index and a processed marker.
  It no longer revisits the same first 100 historical bans on every run. Email
  delivery retries remain owned by the existing outbox.

The frontend mutation effects were inspected: heartbeat, chat read marking,
voice-room join/leave, and role-position normalization. No unbounded
query-result-to-mutation loop was found. The 15-second voice heartbeat is retained
because voice seats expire after 45 seconds; it is a bounded liveness mechanism.
Convex's pre-change 72-hour health insights reported one retried `setTyping`
transaction involving `conversations`, not evidence of an infinite loop.

These changes trade a small amount of counter/index storage and transactional
write work on actual state changes for far fewer repeated profile/message reads.
Normal foreground presence requests fall from 240 to 60 per user-hour (75% fewer).
The larger expected saving is removal of heartbeat-driven subscription reruns.
The exact change in GB depends on traffic and should be measured after rollout;
already accrued usage is not erased.

## Deployment and migration

Deploy to the live deployment explicitly, using the ignored environment file that
selects `dev:giant-cricket-958`:

```powershell
npx convex dev --once --env-file .env.bot-deployment.local --codegen disable --typecheck enable --tail-logs disable
```

Run the internal `ioMaintenance:backfill` function once for each table: `users`,
`servers`, `messages`, `serverMembers`, with arguments `{ "table": "users" }`
(substitute each table name). Each transaction processes at most 100 documents
and schedules the next page. Repeating a page is safe. This is a one-time scan,
not a recurring cron. Existing tags are normalized to uppercase for indexed
lookup; existing account, membership and message content is preserved.

Check `ioMaintenance:status`: all four `backfill:*` values should be `1` and the
totals should match the source data. New registrations and ordinary mutations
maintain counters automatically after initialization. Keep writes to these source
tables inside `functions.ts`'s wrapped mutation context; direct dashboard/import
edits bypass triggers and require reconciliation. Do not delete metric entries
independently of their counters.

Recent unfiltered report/bug feeds remain bounded, newest-first queries on
Convex's built-in creation index. Explicit maintenance/backfill operations may
walk their intended data. Adding `.withIndex` without a selective range is not
treated as an I/O improvement.

## Verification and monitoring

`npm run test:io` covers unchanged profiles during heartbeat renewals, expiry and
privacy transitions, counter/membership updates, retried paginated backfills,
idempotent reads, notification scope, typing coalescing, badge bounds and expired
ban processing. Existing bot, email and voice regression suites also apply.

Compare database I/O per hour before/after rollout for comparable active-user
counts. In Convex, watch function invocations, database bytes read/written and
transaction retries for `users:heartbeat`, `messages:list`, `messages:setTyping`,
`servers:get`, `servers:discover`, `platformStats:get` and `admin:overview`.
Use `npx convex insights --deployment giant-cricket-958` for recent resource and
conflict warnings. Account for one-time index construction and counter backfill
when comparing the rollout hour. No paid plan change is required by this code.

Rollout on 2026-11-10: all 17 indexes were installed on `giant-cricket-958` and
all four backfill completion markers reached `1`. The initialized totals were
41 users, 8 communities and 2,323 messages; homepage totals matched the pre-change
41 users / 8 communities. Validation passed 38 bot/I/O tests, 10 email tests and
3 voice tests, plus TypeScript and the web production build. Lint had no errors
and retained 21 existing warnings. Convex still reports the project's accrued
free-tier overage; deployment does not reset that usage counter.
