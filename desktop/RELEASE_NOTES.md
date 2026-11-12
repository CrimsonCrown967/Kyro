# Kyro 1.0.1 for Windows

Install `Kyro-Setup-1.0.1-x64.exe` over the earlier version. Windows 10 or 11
(x64) is required. Your existing application profile is retained.

## Connection repair

- Accept both official HTTPS domains, fixing the startup redirect that showed
  an internet error while the device was online.
- Retry temporary failures automatically every 15 seconds and when the network
  returns, restoring the requested page.
- Show separate DNS, timeout and certificate guidance, with an expandable error
  code. Certificate failures require a manual retry.
- Ignore cancelled navigations and subframe failures. Keep screen sharing
  available after cancelling the screen picker.

## Interface refresh

The separately built web interface includes a violet theme, a friends hub,
community navigation, unread-message filtering, direct-message search, clearer
chat controls and mobile navigation. Existing accounts, communities, messaging,
voice, screen sharing, bots and settings remain available.

Switching conversations clears the previous reply and pending attachments while
preserving each conversation's text draft. Avatar colors remain consistent
between the sidebar and chat, and community titles remain readable in light mode.

## Distribution

Builds stay local and automatic publishing is disabled. Do not upload the app,
installer to GitHub releases. Distribute the installer and `SHA256SUMS.txt`
through MediaFire or another approved download host.

The Windows app loads the live website. Deploy the root `dist/` web build to ship
the interface refresh to users; rebuilding the installer alone does not deploy
the website. Update `src/lib/desktop.ts` only after the new hosted installer URL
is available. Its current MediaFire link still refers to version 1.0.0.

The latest web update adds per-account favorites on this device, a keyboard
conversation switcher, quick appearance controls, community interest filters
and sorting, and a voice preview before joining. Actual voice connection state
is reported by LiveKit rather than inferred from the Join button.

The installer is unsigned. Verify it with:

```powershell
Get-FileHash .\Kyro-Setup-1.0.1-x64.exe -Algorithm SHA256
```

Desktop smoke checks cover startup, saved browser storage, canonical redirects,
renderer isolation, native permission denial, screen-picker cancellation and
reconnection. Full calls between multiple live users are outside these checks.
