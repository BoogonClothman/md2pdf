// PDF export: renders the markdown through the same Chromium pipeline as the
// preview, in a hidden BrowserWindow, then calls webContents.printToPDF().
//
// Handshake with the export page:
//   page  --export-ready-->  main          (listeners registered)
//   main  --export-payload-> page          (markdown + metadata)
//   page  --export-done--->  main          (mermaid/fonts/images settled)
//   main  calls printToPDF()

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExportRequest, ExportResult } from '../shared/types';

const MM_TO_INCH = 1 / 25.4;
// NOTE: Electron's printToPDF `margins` option is documented as "pixels" but
// is actually interpreted in INCHES (validated against pageSize, e.g. A4 =
// 8.27 x 11.69). Verified empirically — see verify-md2pdf/margin-*.pdf.

const PAGE_SIZES = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 },
  Legal: { width: 816, height: 1344 },
} as const;

const EMPTY_HEADER = '<span></span>';
const PAGE_NUMBER_FOOTER =
  '<div style="font-size:8px;width:100%;text-align:center;color:#666;">' +
  '<span class="pageNumber"></span> / <span class="totalPages"></span></div>';

export async function exportToPdf(
  req: ExportRequest,
  owner?: BrowserWindow | null,
): Promise<ExportResult> {
  // 1. Ask where to save (skipped when no owner window, e.g. verify run).
  let outPath: string;
  if (owner) {
    const ret = await dialog.showSaveDialog(owner, {
      defaultPath: req.suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (ret.canceled || !ret.filePath) return { canceled: true };
    outPath = ret.filePath;
  } else {
    outPath = req.suggestedName;
  }

  // 2. Hidden window runs the export page (same renderer stack as the preview).
  const size = PAGE_SIZES[req.options.pageSize];
  const landscape = req.options.orientation === 'landscape';
  const win = new BrowserWindow({
    show: false,
    width: landscape ? size.height : size.width,
    height: landscape ? size.width : size.height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let readyHandler: (() => void) | null = null;
  let doneHandler: (() => void) | null = null;
  const cleanup = (): void => {
    if (readyHandler) ipcMain.removeListener('export-ready', readyHandler);
    if (doneHandler) ipcMain.removeListener('export-done', doneHandler);
    if (!win.isDestroyed()) win.destroy();
  };

  try {
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('export timed out after 30s')), 30_000);
      readyHandler = (): void => {
        clearTimeout(timer);
        resolve();
      };
      ipcMain.once('export-ready', readyHandler as () => void);
      win.webContents.once('did-fail-load', (_e, _code, desc) => {
        clearTimeout(timer);
        reject(new Error(`failed to load export page: ${desc}`));
      });
    });

    const donePromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('export render timed out after 30s')), 30_000);
      doneHandler = (): void => {
        clearTimeout(timer);
        resolve();
      };
      ipcMain.once('export-done', doneHandler as () => void);
    });

    const load = win.loadFile(path.join(__dirname, '../renderer/export.html'));
    // If an error path destroys the window before load settles, this rejection
    // would otherwise be unhandled (crashes under --unhandled-rejections=strict).
    load.catch(() => {});

    await readyPromise;
    win.webContents.send('export-payload', {
      markdown: req.markdown,
      title: req.suggestedName.replace(/\.pdf$/i, ''),
      baseDir: req.baseDir,
    });
    await donePromise;
    await load;

    // 3. Print to PDF.
    const marginIn = req.options.marginMm * MM_TO_INCH;
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: req.options.pageSize,
      landscape,
      margins: {
        marginType: 'custom',
        top: marginIn,
        bottom: marginIn,
        left: marginIn,
        right: marginIn,
      },
      displayHeaderFooter: req.options.pageNumbers,
      ...(req.options.pageNumbers
        ? { headerTemplate: EMPTY_HEADER, footerTemplate: PAGE_NUMBER_FOOTER }
        : {}),
      generateDocumentOutline: req.options.bookmarks,
    });

    // 4. Write the file.
    await writeFile(outPath, pdf);
    return { canceled: false, path: outPath };
  } catch (err) {
    return { canceled: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    cleanup();
  }
}
