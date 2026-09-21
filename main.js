const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

let win = null;
let dirty = false; // renderer tells us when there are unsaved edits
let pendingFile = process.argv.slice(1).find((a) => MD_EXT.test(a)) || null;

// Only paths the user opened or chose in a Save dialog may be overwritten by "Save"
const known = new Set();
function remember(p) {
  const r = path.resolve(p);
  known.add(r);
  return r;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 520,
    minHeight: 380,
    backgroundColor: "#ffffff",
    title: "PEEKitUP — Markdown Viewer",
    autoHideMenuBar: true, // press Alt to show the menu
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));

  win.webContents.on("did-finish-load", () => {
    if (pendingFile) {
      openPath(pendingFile);
      pendingFile = null;
    }
  });

  // Warn before closing with unsaved edits
  win.on("close", (e) => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Close without saving"],
      defaultId: 0,
      cancelId: 0,
      title: "Unsaved changes",
      message: "You have unsaved changes.",
      detail: "Press Cancel, then Ctrl+S to save. Or close and lose them.",
    });
    if (r === 0) e.preventDefault();
  });

  win.on("closed", () => {
    win = null;
    dirty = false;
  });
}

function openPath(filePath) {
  if (!win) return;
  try {
    const p = remember(filePath);
    const text = fs.readFileSync(p, "utf8");
    win.webContents.send("file-opened", { name: path.basename(p), path: p, text });
  } catch (err) {
    dialog.showErrorBox("Cannot open file", String(err.message || err));
  }
}

/* ---------- auto update (installed .exe only, not `npm start`) ---------- */
function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.on("update-downloaded", async (info) => {
      if (!win) return;
      const r = await dialog.showMessageBox(win, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: `PEEKitUP ${info.version} is ready.`,
        detail: dirty
          ? "You have unsaved edits. Save them first, then restart."
          : "Restart to finish updating. Or it installs next time you quit.",
      });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on("error", () => {}); // offline etc. — stay quiet
    autoUpdater.checkForUpdates();
  } catch (_) {
    /* updater missing — ignore */
  }
}

/* ---------- OS integration ---------- */
app.on("open-file", (event, filePath) => {
  event.preventDefault(); // macOS "Open with"
  if (win) openPath(filePath);
  else pendingFile = filePath;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const f = argv.find((a) => MD_EXT.test(a));
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) openPath(f);
    }
  });
  app.whenReady().then(() => {
    createWindow();
    setupUpdater();
  });
}

/* ---------- IPC ---------- */
ipcMain.handle("pick-file", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Open a Markdown file",
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const p = remember(res.filePaths[0]);
  return { name: path.basename(p), path: p, text: fs.readFileSync(p, "utf8") };
});

ipcMain.handle("read-file", async (_e, p) => {
  const r = remember(p);
  return { name: path.basename(r), path: r, text: fs.readFileSync(r, "utf8") };
});

// Save straight over the file that is open
ipcMain.handle("save-file", async (_e, p, text) => {
  const r = path.resolve(p);
  if (!known.has(r)) throw new Error("Refusing to overwrite a file that was not opened here.");
  fs.writeFileSync(r, text, "utf8");
  return { path: r, name: path.basename(r) };
});

// Save As: pick a new place/name. Original file stays untouched.
ipcMain.handle("save-as", async (_e, suggestedName, text) => {
  const res = await dialog.showSaveDialog(win, {
    title: "Save Markdown file",
    defaultPath: suggestedName || "untitled.md",
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (res.canceled || !res.filePath) return null;
  const p = remember(res.filePath);
  fs.writeFileSync(p, text, "utf8");
  return { path: p, name: path.basename(p) };
});

ipcMain.on("set-dirty", (_e, v) => {
  dirty = !!v;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
