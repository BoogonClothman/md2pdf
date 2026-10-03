// Electron main process: window lifecycle, native menu, IPC, file dialogs.

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportToPdf } from './export';
import type { ExportRequest, ExportResult, OpenFileResult, SaveResult } from '../shared/types';

// WSL/containers: Chromium's shared-memory segment in /dev/shm can be flaky
// (ESRCH errors observed on WSL2). Using /tmp instead is harmless elsewhere.
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow: BrowserWindow | null = null;
let dirty = false;
let currentFileName = '';
let forceClose = false;

const preloadPath = path.join(__dirname, '../preload/preload.js');
const rendererDir = path.join(__dirname, '../renderer');

function updateTitle(): void {
  if (!mainWindow) return;
  const name = currentFileName ? `${currentFileName} — ` : '';
  mainWindow.setTitle(`${dirty ? '● ' : ''}${name}md2pdf`);
}

function sendMenu(action: string): void {
  mainWindow?.webContents.send('menu-action', action);
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: 'Export to PDF…', accelerator: 'CmdOrCtrl+E', click: () => sendMenu('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        ...(isMac ? [{ role: 'selectAll' as const }] : [
          { type: 'separator' as const }, { role: 'selectAll' as const },
        ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Window', role: 'window' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About md2pdf',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About md2pdf',
              message: 'md2pdf v0.1.0',
              detail: 'Markdown → PDF converter.\nChromium print pipeline (KaTeX math, Mermaid diagrams, syntax highlighting).',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#1f2329',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(rendererDir, 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (e) => {
    if (forceClose || !dirty || !mainWindow) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Unsaved changes',
      message: `"${currentFileName || 'Untitled'}" has unsaved changes.`,
      buttons: ['Save', 'Cancel', 'Discard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) {
      sendMenu('save-and-close');
    } else if (choice === 2) {
      forceClose = true;
      mainWindow.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- IPC -----------------------------------------------------------------

ipcMain.handle('file:open', async (): Promise<OpenFileResult | null> => {
  if (!mainWindow) return null;
  const ret = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (ret.canceled || ret.filePaths.length === 0) return null;
  const p = ret.filePaths[0];
  return { path: p, content: await readFile(p, 'utf8') };
});

ipcMain.handle('file:open-path', async (_e, p: string): Promise<OpenFileResult> => ({
  path: p,
  content: await readFile(p, 'utf8'),
}));

ipcMain.handle(
  'file:save',
  async (_e, filePath: string | null, content: string, suggestedName?: string): Promise<SaveResult> => {
    try {
      let target = filePath;
      if (!target) {
        if (!mainWindow) return { canceled: true };
        const ret = await dialog.showSaveDialog(mainWindow, {
          defaultPath: suggestedName || 'untitled.md',
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (ret.canceled || !ret.filePath) return { canceled: true };
        target = ret.filePath;
      }
      await writeFile(target, content, 'utf8');
      return { canceled: false, path: target };
    } catch (err) {
      return { canceled: false, error: String(err) };
    }
  },
);

ipcMain.handle('pdf:export', async (_e, req: ExportRequest): Promise<ExportResult> => {
  return exportToPdf(req, mainWindow);
});

ipcMain.on('set-dirty', (_e, isDirty: boolean, fileName?: string) => {
  dirty = isDirty;
  if (fileName !== undefined) currentFileName = fileName;
  updateTitle();
});

ipcMain.on('force-close', () => {
  forceClose = true;
  mainWindow?.close();
});

// ---- App lifecycle --------------------------------------------------------

const pendingOpens: string[] = [];

// Collect .md files passed on the command line (GUI file association etc.).
function collectArgvFiles(argv: string[]): void {
  for (const arg of argv) {
    if (/\.(md|markdown|mdown|mkd|txt)$/i.test(arg)) pendingOpens.push(path.resolve(arg));
  }
}

app.whenReady().then(() => {
  collectArgvFiles(process.argv.slice(1));
  buildMenu();
  createWindow();
  mainWindow?.webContents.on('did-finish-load', () => {
    for (const p of pendingOpens.splice(0)) sendMenu(`open:${p}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-file', (_e, p) => {
  // macOS Finder file association
  pendingOpens.push(p);
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => sendMenu(`open:${p}`));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
