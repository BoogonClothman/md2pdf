// Preload bridge: the only API surface exposed to renderer pages.

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ExportRequest, Md2PdfApi, OpenFileResult, SaveResult, ExportResult } from '../shared/types';

const api: Md2PdfApi = {
  platform: process.platform,

  fileOpen: (): Promise<OpenFileResult | null> => ipcRenderer.invoke('file:open'),
  fileOpenPath: (p: string): Promise<OpenFileResult> => ipcRenderer.invoke('file:open-path', p),
  fileSave: (path: string | null, content: string, suggestedName?: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save', path, content, suggestedName),
  pdfExport: (req: ExportRequest): Promise<ExportResult> => ipcRenderer.invoke('pdf:export', req),

  setDirty: (dirty: boolean, fileName?: string): void => {
    ipcRenderer.send('set-dirty', dirty, fileName);
  },
  forceClose: (): void => {
    ipcRenderer.send('force-close');
  },

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  onMenu: (cb: (action: string) => void): void => {
    ipcRenderer.on('menu-action', (_e, action: string) => cb(action));
  },

  // ---- export page only --------------------------------------------------
  onExportPayload: (cb: (payload: { markdown: string; title: string; baseDir?: string }) => void): void => {
    ipcRenderer.on('export-payload', (_e, payload) => cb(payload));
  },
  signalExportReady: (): void => {
    ipcRenderer.send('export-ready');
  },
  signalExportDone: (): void => {
    ipcRenderer.send('export-done');
  },
};

contextBridge.exposeInMainWorld('api', api);
