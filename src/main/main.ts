// Electron main process: window lifecycle, native menu, IPC, file dialogs.

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportToPdf } from './export';
import type { ExportRequest, ExportResult, OpenFileResult, SaveResult } from '../shared/types';
import { applyPlatformSwitches } from './switches';
import { applySecurityPolicy } from './security';

applyPlatformSwitches(); // must run before app.whenReady()
applySecurityPolicy(path.join(__dirname, '../renderer'));

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
          label: 'Load Sample Document',
          click: () => sendMenu('load-sample'),
        },
        { type: 'separator' },
        {
          label: 'About md2pdf',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About md2pdf',
              message: `md2pdf v${app.getVersion()}`,
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
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Exit self-tests must not read/write the user's real session
      // (localStorage): use an in-memory partition while autotesting.
      ...(autoExitMode ? { partition: 'md2pdf-autotest' } : {}),
    },
  });

  mainWindow.loadFile(path.join(rendererDir, 'index.html')).catch((err) => {
    // Load failures are surfaced via did-fail-load; swallow to avoid an
    // unhandled rejection killing the process under
    // --unhandled-rejections=strict.
    console.error('main window load failed:', err);
  });

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
    // Reset so a future window (macOS re-activate) gets its own
    // unsaved-changes dialog instead of being force-closed silently.
    forceClose = false;
    dirty = false;
    currentFileName = '';
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
    if (autoMemoryMode) void runMemoryTest(autoMemoryMode);
    else if (autoExitMode) void runAutoExit(autoExitMode);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ---- Automated exit self-test ----------------------------------------------
// `MD2PDF_AUTOTEST_EXIT=clean|dirty` lets the verify harness spawn the REAL
// app and assert the process exits cleanly (guards against regressions like
// the renderer beforeunload double-guard that used to hang `npm run dev`).
const autoExitMode = process.env.MD2PDF_AUTOTEST_EXIT;

async function runAutoExit(mode: string): Promise<void> {
  const win = mainWindow;
  if (!win) return;
  if (mode === 'dirty') {
    // Drive a real edit through the editor so the dirty flag flows through
    // the same ipc path as user typing, then emulate the "Discard" branch
    // (forceClose bypasses the dialog - dialogs can't be automated headless).
    await win.webContents.executeJavaScript(`
      const ed = document.getElementById('editor');
      ed.value += '\\nautotest edit';
      ed.dispatchEvent(new Event('input'));
      true;`);
    await new Promise((r) => setTimeout(r, 400)); // let set-dirty ipc arrive
    console.log('AUTOTEST: closing dirty window (Discard path)');
    forceClose = true;
  } else {
    console.log('AUTOTEST: closing clean window');
  }

  // Assert the close PATH works (the actual regression surface: unsaved-changes
  // dialog / forceClose / beforeunload). We cannot rely on process exit here:
  // macOS deliberately keeps the app alive after the last window closes.
  const closed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 8_000);
    win.once('closed', () => {
      clearTimeout(timer);
      resolve(true);
    });
    win.close();
  });
  console.log(`AUTOTEST: window closed=${closed}`);
  app.exit(closed ? 0 : 1);
}

// ---- Automated session-memory self-test ------------------------------------
// `MD2PDF_AUTOTEST_MEMORY=write|read|clear` drives the REAL init/restore/
// persist path (same userData store a user would get) across three process
// runs: write a marker draft -> relaunch and assert it came back -> clear.
const autoMemoryMode = process.env.MD2PDF_AUTOTEST_MEMORY;

async function runMemoryTest(phase: string): Promise<void> {
  const win = mainWindow;
  if (!win) return;
  if (phase === 'write') {
    await win.webContents.executeJavaScript(`
      (() => {
        const ed = document.getElementById('editor');
        ed.value = 'MEMORY-PROBE-MARKER';
        ed.dispatchEvent(new Event('input'));
        const m = document.getElementById('opt-margin');
        m.value = '33';
        m.dispatchEvent(new Event('change'));
        return true;
      })()`);
    await new Promise((r) => setTimeout(r, 700)); // persist debounce is 300ms
    console.log('MEMTEST write ok');
    app.exit(0);
  } else if (phase === 'read') {
    const r = await win.webContents.executeJavaScript(`
      (() => ({
        marker: document.getElementById('editor').value.includes('MEMORY-PROBE-MARKER'),
        margin: document.getElementById('opt-margin').value,
        status: document.getElementById('status-msg').textContent,
      }))()`);
    console.log(`MEMTEST read ${JSON.stringify(r)}`);
    app.exit(r.marker === true && r.margin === '33' ? 0 : 1);
  } else if (phase === 'clear') {
    await win.webContents.executeJavaScript('localStorage.clear(); true');
    console.log('MEMTEST cleared');
    app.exit(0);
  } else {
    app.exit(2);
  }
}

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
