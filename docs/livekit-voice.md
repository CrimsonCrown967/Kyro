# Kyro LiveKit voice, video, and screen sharing

Kyro keeps Convex as the source of truth for authentication, memberships,
permissions, calls, and participant profiles. LiveKit Cloud carries all live
audio/video/screen media; no media is proxied through Vercel or Convex.

## Required Vercel Production variables

Add these to **Vercel → nylix-corp/kyro → Settings → Environment Variables**:

| Variable             | Type   | Value                                           |
| -------------------- | ------ | ----------------------------------------------- |
| `LIVEKIT_URL`        | Config | The `wss://` URL from the LiveKit Cloud project |
| `LIVEKIT_API_KEY`    | Secret | A LiveKit API key                               |
| `LIVEKIT_API_SECRET` | Secret | The matching, newly rotated API secret          |

Never use a development token server in production. Never prefix the API key or
secret with `VITE_`; those names are browser-public. A key or secret posted in
chat, an issue, or a terminal transcript must be revoked before deployment.

Redeploy Kyro after changing Vercel variables.

## Authorization flow

1. The signed-in browser asks the authenticated Convex action for a one-time
   join ticket.
2. Convex checks the existing user, platform-ban status, community membership,
   channel visibility, channel overrides, voice permissions, timeout status,
   conversation membership, and current private-call state.
3. Convex stores only a SHA-256 hash of a random 256-bit ticket. Tickets expire
   after 60 seconds and work once.
4. The browser exchanges the ticket at `/api/livekit/token`.
5. The Vercel Function consumes the ticket through Convex and signs a 10-minute
   LiveKit JWT using server-only credentials.
6. LiveKit enforces room, subscribe, microphone, camera, and screen-share
   grants. One Kyro identity maps to one LiveKit participant identity, so a
   duplicate connection replaces the old connection.

Moderator mute/disconnect uses a separate one-time moderation ticket. Convex
checks `manage_voice` and role hierarchy before the Vercel Function calls
LiveKit's Room Service API. Browsers never receive LiveKit API secrets or an
admin JWT.

## Permissions

- `connect_voice` — join a voice channel
- `speak_voice` — publish microphone audio
- `video` — publish camera video
- `share_screen` — publish screen and supported screen audio
- `manage_voice` — server-mute or disconnect lower-ranked participants

Existing `@everyone` roles are backfilled with connect, speak, camera, and
screen-share permissions. `manage_voice` remains opt-in for staff roles.
Channel permission overrides can allow or deny all five permissions.

## Browser behavior

- LiveKit handles SFU media transport and automatic reconnection.
- Microphone/camera permission errors join the user as a listener where
  possible and show a clear Kyro error.
- Screen sharing uses the browser's real source chooser for screen, window, or
  tab. System/tab audio is requested when supported.
- Audio input, camera, and supported output devices can be switched live.
- Remote participant volume is local to the listener.
- Camera and shared-screen tracks are rendered from actual LiveKit tracks.
- Leaving or navigating away disconnects LiveKit, stops local tracks, and
  clears the Convex roster heartbeat.

## Verification checklist

Use two separate Kyro accounts and two browser profiles/devices:

1. Join the same server voice channel and confirm both LiveKit participants.
2. Verify two-way audio, mute/unmute, deafen/undeafen, speaking rings, and
   participant volume.
3. Switch microphone, camera, and output device where supported.
4. Enable both cameras and verify the responsive video grid and camera-off
   states.
5. Share a screen, window, and browser tab; verify screen audio where the
   browser offers it and test fullscreen.
6. Disconnect and rejoin; interrupt the network and verify LiveKit reconnects.
7. Start, accept, reject, and end a private call. Confirm call duration and
   missed-call history.
8. Grant `manage_voice` to a moderator role; test server mute and disconnect.
9. Deny `connect_voice`, `speak_voice`, `video`, and `share_screen` through role
   or channel overrides and confirm the signed token lacks those grants.
10. Test a banned user, non-member, non-call participant, expired ticket, reused
    ticket, and forged ticket; every request must be denied server-side.
11. Repeat core controls on mobile Safari/Chrome. Device/output selection and
    screen audio depend on browser support.
