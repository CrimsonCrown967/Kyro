# Kyro for Windows

An Electron desktop client for [Kyro](https://kyro-chat.cyou). The app opens the
live Kyro service in a dedicated window, using the existing account, messaging,
community and voice features. An internet connection is required.

## 1.0.1 connection repair

The desktop client now opens `https://www.kyro-chat.cyou/dashboard` and trusts
both exact HTTPS Kyro origins. The previous build blocked Vercel's apex-to-www
redirect and showed an offline screen even with a working internet connection.
External origins and insecure URLs remain blocked in the app.

Temporary load failures show a local recovery screen that retries every 15 seconds
and when the network returns, retaining the failed route and saved profile.
Certificate failures show separate guidance and require a manual retry. Aborted
navigations and failed subframes do not replace a working page.
Screen-sharing pickers are always released after selection or cancellation,
including when Chromium rejects the capture request.

Build the new installer with `npm run build:desktop`; it is written to
`desktop/release/Kyro-Setup-1.0.1-x64.exe`. Install it over the previous version.
The web interface is served live: deploy the root Vite build separately for the
refreshed friends hub, navigation and chat appearance to reach installed clients.
The website download link should be updated after the new installer is published.

## Install

The repaired local installer is `desktop/release/Kyro-Setup-1.0.1-x64.exe`.
Distribute it and `SHA256SUMS.txt` through MediaFire or another approved download
host. Keep installers and profiles out of source control. Build commands use
`--publish never`; nothing is published automatically.
Supports Windows 10 and 11, x64. Installation is per user, without administrator
rights, with an installation directory chooser and desktop/Start menu shortcuts.
Uninstall through Windows Settings. Account data is retained for reinstalling.

This initial release is unsigned. Windows may display an unknown publisher or
SmartScreen warning. The release includes `SHA256SUMS.txt`; verify a download with
`Get-FileHash .\Kyro-Setup-1.0.1-x64.exe -Algorithm SHA256`.

## Develop and build

Use Node.js 24 and npm on Windows:

```powershell
npm --prefix desktop ci
npm exec --prefix desktop -- install-electron
npm run test:desktop
npm --prefix desktop start
npm run build:desktop
```

The NSIS installer and unpacked application are generated in `desktop/release/`
and excluded from Git. Electron-builder downloads Electron and NSIS build tools.
The desktop package has its own lockfile and TypeScript configuration; the web
build does not install or bundle Electron.

From the repository root, with root dependencies installed, run the packaged
application smoke checks:

```powershell
node scripts/desktop-smoke.mjs
```

The checks use a temporary, isolated profile and hidden windows. They verify
renderer isolation, session persistence, permission denial, the screen picker,
and offline recovery without creating accounts or joining calls.

## Security and behavior

- Only `https://kyro-chat.cyou` and `https://www.kyro-chat.cyou` can navigate the main window. External HTTP(S) and
  email links open the default browser. File, executable and custom OS protocols
  are blocked. Redirects to other origins are blocked.
- The remote renderer is sandboxed, with context isolation, no Node integration,
  no preload bridge, no webviews, and normal web security enabled.
- Microphone, camera and notifications require native consent for the Kyro main
  frame. Consent is session-scoped and can be reset in Help. Screen sharing uses a
  separate local picker with a narrowly scoped IPC bridge and explicit selection.
  Optional system audio includes all computer audio, not only the selected window.
- Credentials and browser storage live in Electron's per-user profile, separate
  from the browser. The app uses Kyro's existing password/email authentication.
- Downloads show a Save dialog. The app never executes downloaded files.
- Window dimensions are restored. A second launch focuses the existing window.
- Closing the window quits the app; notifications and calls require it to remain
  open. There is no tray mode, startup registration, or automatic binary updater.
- Web features update through the live website. Use **Kyro > Downloads & updates**
  for new desktop installers. Reinstall to update the desktop runtime.

## Release

1. Update `desktop/package.json` and its lockfile. Update `src/lib/desktop.ts`
   after the matching installer is published so downloads never point to a
   missing or older artifact.
2. Run desktop tests, the installer build and packaged smoke checks; run the web
   typecheck, lint and production build when changing download links.
3. Generate `SHA256SUMS.txt` alongside the installer using SHA-256.
4. Upload the installer and checksum to the approved download host (currently
   MediaFire). Do not use GitHub. Upload assets before updating the version and
   download URL in `src/lib/desktop.ts`.
5. Deploy the Vite web build directly to the website host and verify `/download`
   and the new installer URL. A desktop installer build does not deploy the UI.

Release binaries are unsigned unless a maintainer configures a code-signing
certificate through electron-builder's signing environment. Never commit signing
credentials, user profiles, build outputs, or environment files.
