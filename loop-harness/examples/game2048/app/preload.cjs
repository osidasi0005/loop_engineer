'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getBest: () => ipcRenderer.invoke('best:get'),
  setBest: (n) => ipcRenderer.invoke('best:set', n),
  quit: () => ipcRenderer.invoke('app:quit'),
});
