# Kyro Discord-parity roadmap

Kyro targets the useful collaboration and community capabilities of Discord
without copying Discord branding, proprietary artwork, or paid feature gates.
Work ships in independently testable phases so permissions, notifications, and
moderation remain server-enforced throughout.

## Already available

- Communities, categories, text channels, voice channels, and forum channels
- Direct messages and group DMs
- Replies, reactions, edits, deletes, pins, threads, polls, uploads, GIFs, and
  custom emoji
- Friends, blocking, presence, custom status, profiles, badges, decorations,
  and community tags
- Roles, channel overrides, slow mode, read-only channels, timeouts, kicks,
  bans, reports, AutoMod, and audit history
- Voice rooms, DM calls, screen sharing, and voice moderation
- Invite links, vanity links, discovery, join applications, templates, and
  Discord-template layout import
- Slash-command bots and custom server commands
- Mention/reply inbox, per-channel notification controls, numbered badges, and
  notification sounds
- Installable PWA and responsive desktop/mobile layouts

## Phase 1 — community foundation

- [x] Reliable role editing in a visible dialog
- [x] Automatic repair for duplicate legacy role ranks
- [x] Arbitrary role colours and safe hierarchy enforcement
- [x] Hoisted role sections in the member roster
- [x] Mentionable roles with permission-aware notifications
- [ ] Guided community onboarding and new-member questions
- [ ] Scheduled community events and event reminders
- [ ] Stage channels with speaker/audience controls
- [ ] Rules screening before first message
- [ ] More complete server notification defaults and overrides

## Phase 2 — expression and media

- [ ] Server stickers and account sticker favorites
- [ ] Soundboard clips, favorites, permissions, and per-user volume
- [ ] Voice messages with waveform playback
- [ ] Media galleries, spoiler controls, alt text, and richer embeds
- [ ] Clips and lightweight media editing

## Phase 3 — realtime voice and video

- [ ] Camera tiles in DMs, groups, and voice channels
- [ ] Stream quality controls and stream previews
- [ ] Picture-in-picture and pop-out calls
- [ ] Noise suppression, input sensitivity, and device diagnostics
- [ ] Stage recording indicators and moderation controls

## Phase 4 — apps, integrations, and activities

- [ ] Bot accounts, scoped tokens, OAuth installation, and command permissions
- [ ] Webhooks and channel integrations
- [ ] App directory and server-installed applications
- [ ] Embedded activities and lightweight multiplayer sessions
- [ ] Rich presence and joinable activities

## Phase 5 — platform completeness

- [ ] Notification center parity across desktop and mobile
- [ ] Keyboard navigation and command palette parity
- [ ] Data portability and migration tooling beyond layout import
- [ ] Localization, reduced-data mode, and accessibility preferences
- [ ] Native-wrapper distribution where PWA capabilities are insufficient

Each phase must pass type checking, lint, production build, backend schema
validation, permission review, mobile overflow checks, and browser verification
before deployment.
