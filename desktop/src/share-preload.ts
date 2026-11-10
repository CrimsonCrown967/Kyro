import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kyroShare", {
  sources: () => ipcRenderer.invoke("kyro:share-sources"),
  select: (id: string | null, audio: boolean) =>
    ipcRenderer.invoke("kyro:share-select", id, audio),
});
