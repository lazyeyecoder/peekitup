const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickFile: () => ipcRenderer.invoke("pick-file"),
  readFile: (p) => ipcRenderer.invoke("read-file", p),
  saveFile: (p, text) => ipcRenderer.invoke("save-file", p, text),
  saveAs: (name, text) => ipcRenderer.invoke("save-as", name, text),
  setDirty: (v) => ipcRenderer.send("set-dirty", v),
  // Electron 32+ removed File.path; webUtils gives it back
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file.path || null;
    }
  },
  onFileOpened: (cb) => ipcRenderer.on("file-opened", (_e, data) => cb(data)),
});
