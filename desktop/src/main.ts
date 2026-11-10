import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  session,
  shell,
  desktopCapturer,
  ipcMain,
  screen,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  KYRO_HOME,
  KYRO_ORIGIN,
  isKyroUrl,
  externalUrl,
  canRequestPermission,
} from "./security";

const resources = path.join(__dirname, "../resources");
const offlinePage = pathToFileURL(path.join(resources, "offline.html")).href;
const testMode = process.env.KYRO_DESKTOP_SMOKE_TEST === "1";
let mainWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let capturePending = false;
const granted = new Set<string>();
app.setName("Kyro");
app.enableSandbox();

function openExternal(value: string) {
  const url = externalUrl(value);
  if (url) void shell.openExternal(url).catch(() => undefined);
}

function secureContents(contents: WebContents) {
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("will-navigate", (event, url) => {
    if (!isKyroUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  contents.on("will-redirect", (event, url) => {
    if (!isKyroUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isKyroUrl(url)) void contents.loadURL(url).catch(() => undefined);
    else openExternal(url);
    return { action: "deny" };
  });
}

function loadKyro() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadURL(KYRO_HOME).catch(() => showOffline());
}

function showOffline() {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.getURL() === offlinePage
  )
    return;
  void mainWindow
    .loadFile(path.join(resources, "offline.html"))
    .catch(() => undefined);
}

function createMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Kyro",
      submenu: [
        { label: "Open Kyro", accelerator: "CmdOrCtrl+Home", click: loadKyro },
        {
          label: "Downloads & updates",
          click: () => openExternal(`${KYRO_ORIGIN}/download`),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () =>
            mainWindow?.webContents.getURL() === offlinePage
              ? loadKyro()
              : mainWindow?.reload(),
        },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(!app.isPackaged ? [{ role: "toggleDevTools" as const }] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Reset voice & notification permissions",
          click: () => {
            granted.clear();
            void dialog.showMessageBox({
              type: "info",
              title: "Permissions reset",
              message:
                "Kyro will ask again when you next use your microphone, camera or notifications.",
            });
          },
        },
        {
          label: "Privacy policy",
          click: () => openExternal(`${KYRO_ORIGIN}/privacy`),
        },
        {
          label: "About Kyro",
          click: () => {
            void dialog.showMessageBox({
              type: "info",
              title: "About Kyro",
              message: `Kyro for Windows ${app.getVersion()}`,
              detail:
                "Your communities, conversations and voice rooms.\nhttps://kyro-chat.cyou",
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureSession() {
  const profile = session.fromPartition("persist:kyro");
  profile.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (
      !contents ||
      contents !== mainWindow?.webContents ||
      !isKyroUrl(contents.getURL()) ||
      !canRequestPermission(origin, details.isMainFrame, permission)
    )
      return false;
    if (
      permission === "fullscreen" ||
      permission === "clipboard-sanitized-write" ||
      permission === "display-capture"
    )
      return true;
    const mediaType = "mediaType" in details ? String(details.mediaType) : "";
    return permission === "media"
      ? granted.has(`media:${mediaType}`)
      : granted.has(permission);
  });
  profile.setPermissionRequestHandler(
    async (contents, permission, callback, details) => {
      if (
        contents !== mainWindow?.webContents ||
        !isKyroUrl(contents.getURL()) ||
        !canRequestPermission(
          details.requestingUrl,
          details.isMainFrame,
          permission,
        )
      )
        return callback(false);
      // Display capture consent is handled by the source picker below.
      if (
        permission === "fullscreen" ||
        permission === "clipboard-sanitized-write" ||
        permission === "display-capture"
      )
        return callback(true);
      const mediaTypes =
        permission === "media" && "mediaTypes" in details
          ? (details.mediaTypes ?? [])
          : [];
      if (
        permission === "media" &&
        (!mediaTypes.length ||
          mediaTypes.some((type) => type !== "audio" && type !== "video"))
      )
        return callback(false);
      const keys =
        permission === "media"
          ? mediaTypes.map((type) => `media:${type}`)
          : [permission];
      if (keys.every((key) => granted.has(key))) return callback(true);
      const requested =
        permission === "notifications"
          ? "show desktop notifications"
          : `use your ${mediaTypes.map((type) => (type === "audio" ? "microphone" : "camera")).join(" and ")}`;
      try {
        const result = await dialog.showMessageBox(mainWindow!, {
          type: "question",
          title: "Kyro permission",
          message: `Allow Kyro to ${requested}?`,
          detail:
            "Only kyro-chat.cyou can request access. This choice lasts until you quit Kyro or reset permissions in Help.",
          buttons: ["Don't allow", "Allow"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        const allowed = result.response === 1;
        if (allowed) keys.forEach((key) => granted.add(key));
        callback(allowed);
      } catch {
        callback(false);
      }
    },
  );
  profile.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      !request.frame ||
      request.frame !== mainWindow?.webContents.mainFrame ||
      !isKyroUrl(request.securityOrigin) ||
      !request.userGesture ||
      capturePending
    )
      return callback({});
    capturePending = true;
    let cancel = () => {
      capturePending = false;
      callback({});
    };
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 360, height: 220 },
        fetchWindowIcons: true,
      });
      if (
        !mainWindow ||
        mainWindow.isDestroyed() ||
        !isKyroUrl(mainWindow.webContents.getURL()) ||
        !sources.length
      )
        return cancel();
      const picker = new BrowserWindow({
        parent: mainWindow,
        modal: true,
        width: 820,
        height: 640,
        minWidth: 480,
        minHeight: 440,
        show: false,
        title: "Choose what to share — Kyro",
        backgroundColor: "#111318",
        icon: path.join(resources, "icon.ico"),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "share-preload.js"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      captureWindow = picker;
      let finished = false;
      const finish = (id?: string, audio = false) => {
        if (finished) return;
        finished = true;
        ipcMain.removeHandler("kyro:share-sources");
        ipcMain.removeHandler("kyro:share-select");
        captureWindow = null;
        capturePending = false;
        const source = sources.find((source) => source.id === id);
        callback(
          source
            ? {
                video: source,
                ...(audio && request.audioRequested
                  ? { audio: "loopback" as const }
                  : {}),
              }
            : {},
        );
        if (!picker.isDestroyed()) picker.close();
      };
      cancel = () => finish();
      ipcMain.handle("kyro:share-sources", (event) => {
        if (
          event.sender !== picker.webContents ||
          event.senderFrame !== picker.webContents.mainFrame
        )
          throw new Error("Invalid picker");
        return {
          audioRequested: request.audioRequested,
          sources: sources.map((source) => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL(),
          })),
        };
      });
      ipcMain.handle(
        "kyro:share-select",
        (event, id: unknown, audio: unknown) => {
          if (
            event.sender !== picker.webContents ||
            event.senderFrame !== picker.webContents.mainFrame
          )
            throw new Error("Invalid picker");
          finish(typeof id === "string" ? id : undefined, audio === true);
        },
      );
      picker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      picker.webContents.on("will-navigate", (event) => event.preventDefault());
      picker.once("closed", () => finish());
      picker.once("ready-to-show", () => {
        if (!testMode) picker.show();
      });
      await picker.loadFile(path.join(resources, "share.html"));
    } catch {
      cancel();
    }
  });
  profile.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Save download from Kyro",
      defaultPath: path.join(
        app.getPath("downloads"),
        path.basename(item.getFilename()),
      ),
    });
    item.once("done", (_event, state) => {
      if (state === "interrupted" && mainWindow && !mainWindow.isDestroyed())
        void dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Download interrupted",
          message:
            "The file could not be downloaded. Check your connection and try again.",
        });
    });
  });
}

function createWindow() {
  let bounds: { width: number; height: number; x?: number; y?: number } = {
    width: 1280,
    height: 840,
  };
  const stateFile = path.join(app.getPath("userData"), "window.json");
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (
      Number.isInteger(saved.width) &&
      Number.isInteger(saved.height) &&
      saved.width >= 800 &&
      saved.height >= 600 &&
      saved.width <= 10000 &&
      saved.height <= 10000
    ) {
      bounds = { width: saved.width, height: saved.height };
      if (
        Number.isInteger(saved.x) &&
        Number.isInteger(saved.y) &&
        screen
          .getAllDisplays()
          .some(
            ({ workArea: a }) =>
              saved.x + 100 > a.x &&
              saved.x < a.x + a.width - 100 &&
              saved.y + 100 > a.y &&
              saved.y < a.y + a.height - 100,
          )
      )
        bounds = { ...bounds, x: saved.x, y: saved.y };
    }
  } catch {
    /* A fresh install uses the default window size. */
  }
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    title: "Kyro",
    backgroundColor: "#111318",
    icon: path.join(resources, "icon.ico"),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:kyro",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = window;
  secureContents(window.webContents);
  window.once("ready-to-show", () => {
    if (!testMode) window.show();
  });
  window.webContents.on(
    "did-fail-load",
    (_event, code, _description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && isKyroUrl(url)) showOffline();
    },
  );
  window.on("close", () => {
    try {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(window.getNormalBounds()));
    } catch {
      /* Window position is optional. */
    }
    if (captureWindow && !captureWindow.isDestroyed()) captureWindow.close();
  });
  window.on("closed", () => {
    mainWindow = null;
  });
  loadKyro();
}

if (testMode && process.env.KYRO_DESKTOP_TEST_PROFILE)
  app.setPath("userData", process.env.KYRO_DESKTOP_TEST_PROFILE);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!testMode) mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("org.kyro.chat");
    configureSession();
    createMenu();
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
