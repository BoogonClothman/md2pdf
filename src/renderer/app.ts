// Main window renderer: editor, live preview, toolbar, menu/file/PDF actions.

import './styles.css';
import './doc.css';
import { renderInto } from './render';
import { extractTitle } from '../shared/markdown';
import type { PdfOptions } from '../shared/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const api = window.api;

const editor = $<HTMLTextAreaElement>('editor');
const preview = $<HTMLElement>('preview');
const previewWrap = $<HTMLElement>('preview-wrap');
const divider = $<HTMLElement>('divider');
const split = $<HTMLElement>('split');
const statusMsg = $<HTMLElement>('status-msg');
const statusFile = $<HTMLElement>('status-file');
const statusStats = $<HTMLElement>('status-stats');
const dropOverlay = $<HTMLElement>('drop-overlay');

const DEFAULT_DOC = `# md2pdf

A **desktop Markdown → PDF** converter that runs on Windows, macOS and Linux.

## Features

- Live preview with syntax highlighting
- \`KaTeX\` math: $E = mc^2$ and $$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$
- Mermaid diagrams:

\`\`\`mermaid
flowchart LR
  A[Markdown] --> B{Renderer}
  B --> C[Chromium printToPDF]
  C --> D[PDF]
\`\`\`

- Tables, task lists, and more:

| Engine       | Fidelity | Notes                    |
| ------------ | -------- | ------------------------ |
| Chromium     | ★★★★★    | what you see = what prints |

- [x] Open / save files
- [x] Export to PDF (A4 / Letter / Legal)
- [ ] You name it

> Press **Ctrl+E** (⌘E on macOS) to export.
`;

// ---- state ----------------------------------------------------------------
let currentPath: string | null = null;
let savedContent = DEFAULT_DOC;
let dirty = false;

function fileName(): string {
  if (!currentPath) return '';
  const i = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
  return i >= 0 ? currentPath.slice(i + 1) : currentPath;
}

function setDirty(d: boolean): void {
  if (d === dirty) return;
  dirty = d;
  api.setDirty(dirty, fileName());
}

function status(msg: string, isError = false): void {
  statusMsg.textContent = msg;
  statusMsg.classList.toggle('error', isError);
}

function updateStats(): void {
  const text = editor.value;
  const chars = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  statusStats.textContent = `${words} words · ${chars} chars`;
  statusFile.textContent = currentPath || 'untitled';
}

// ---- live preview (debounced + serialized) --------------------------------
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let rendering = false;
let renderQueued = false;

async function doRender(): Promise<void> {
  if (rendering) {
    renderQueued = true;
    return;
  }
  rendering = true;
  try {
    await renderInto(preview, editor.value, currentPath ?? undefined);
  } catch (err) {
    console.error(err);
  } finally {
    rendering = false;
    if (renderQueued) {
      renderQueued = false;
      void doRender();
    }
  }
}

function scheduleRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => void doRender(), 120);
}

// ---- file ops --------------------------------------------------------------
async function openFile(path?: string): Promise<void> {
  try {
    const res = path ? await api.fileOpenPath(path) : await api.fileOpen();
    if (!res) return;
    currentPath = res.path;
    editor.value = res.content;
    savedContent = res.content;
    setDirty(false);
    api.setDirty(false, fileName());
    updateStats();
    scheduleRender();
    status(`Opened ${fileName()}`);
  } catch (err) {
    status(`Open failed: ${String(err)}`, true);
  }
}

async function saveFile(forceDialog = false): Promise<boolean> {
  const target = forceDialog ? null : currentPath;
  const res = await api.fileSave(target, editor.value, currentPath || 'untitled.md');
  if (res.canceled) return false;
  if (res.error) {
    status(`Save failed: ${res.error}`, true);
    return false;
  }
  currentPath = res.path ?? currentPath;
  savedContent = editor.value;
  setDirty(false);
  api.setDirty(false, fileName());
  updateStats();
  status(`Saved ${fileName()}`);
  return true;
}

function readPdfOptions(): PdfOptions {
  return {
    pageSize: $<HTMLSelectElement>('opt-pagesize').value as PdfOptions['pageSize'],
    orientation: $<HTMLSelectElement>('opt-orientation').value as PdfOptions['orientation'],
    marginMm: Math.max(0, Math.min(50, Number($<HTMLInputElement>('opt-margin').value) || 0)),
    pageNumbers: $<HTMLInputElement>('opt-pagenums').checked,
    bookmarks: $<HTMLInputElement>('opt-bookmarks').checked,
  };
}

async function exportPdf(): Promise<void> {
  const base = (fileName() || 'untitled').replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
  status('Exporting PDF…');
  $<HTMLButtonElement>('btn-export').disabled = true;
  try {
    const res = await api.pdfExport({
      markdown: editor.value,
      options: readPdfOptions(),
      suggestedName: `${base}.pdf`,
      baseDir: currentPath ?? undefined,
    });
    if (res.canceled) {
      status('Export canceled');
    } else if (res.error) {
      status(`Export failed: ${res.error}`, true);
    } else {
      status(`Exported → ${res.path}`);
    }
  } finally {
    $<HTMLButtonElement>('btn-export').disabled = false;
  }
}

// ---- menu actions ----------------------------------------------------------
api.onMenu((action) => {
  if (action.startsWith('open:')) {
    void openFile(action.slice('open:'.length));
    return;
  }
  switch (action) {
    case 'open':
      void openFile();
      break;
    case 'save':
      void saveFile(false);
      break;
    case 'save-as':
      void saveFile(true);
      break;
    case 'save-and-close':
      void saveFile(false).then((ok) => {
        if (ok) api.forceClose();
      });
      break;
    case 'export':
      void exportPdf();
      break;
  }
});

// ---- toolbar ---------------------------------------------------------------
$<HTMLButtonElement>('btn-open').addEventListener('click', () => void openFile());
$<HTMLButtonElement>('btn-save').addEventListener('click', () => void saveFile(false));
$<HTMLButtonElement>('btn-export').addEventListener('click', () => void exportPdf());

// ---- editor ----------------------------------------------------------------
editor.addEventListener('input', () => {
  setDirty(editor.value !== savedContent);
  updateStats();
  scheduleRender();
});

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: end } = editor;
    editor.setRangeText('  ', s, end, 'end');
    editor.dispatchEvent(new Event('input'));
  }
});

// Preview links: never navigate the app window (main-process will-navigate
// guards this too); http(s)/mailto links open in the system browser.
preview.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href') || '';
  if (/^(https?|mailto):/i.test(href)) api.openExternal(href);
});

// ---- split divider drag ----------------------------------------------------
let dragging = false;
divider.addEventListener('mousedown', () => {
  dragging = true;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const rect = split.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  const clamped = Math.max(15, Math.min(85, pct));
  const [left, right] = Array.from(split.children) as HTMLElement[];
  left.style.flex = `0 0 ${clamped}%`;
  right.style.flex = `0 0 ${100 - clamped}%`;
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  divider.classList.remove('dragging');
  document.body.style.cursor = '';
});

// ---- drag & drop -----------------------------------------------------------
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth += 1;
  dropOverlay.classList.add('visible');
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.classList.remove('visible');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('visible');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const p = api.getPathForFile(file);
  if (p) void openFile(p);
});

// Unsaved-changes guard lives ONLY in the main process (BrowserWindow 'close'
// dialog). A renderer-side beforeunload here would conflict with it: after
// the user picks "Discard", main calls forceClose+close, but beforeunload
// still sees dirty=true and Electron silently blocks the close -> window
// never closes, app.quit() hangs, `npm run dev` never returns.

// ---- init ------------------------------------------------------------------
editor.value = DEFAULT_DOC;
savedContent = DEFAULT_DOC;
updateStats();
void doRender();
status('Ready — Ctrl+O open · Ctrl+S save · Ctrl+E export PDF');
