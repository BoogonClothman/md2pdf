// Automated verification (run via `npm run verify`):
//   1. Exports a feature-complete sample markdown to PDF (no dialogs).
//   2. Boots the real main window under WSLg and captures a screenshot.
//   3. Asserts KaTeX superscript geometry (PDF/HTML class mismatch regression).
//   4. Spawns the REAL app (strict mode) and asserts it exits on clean and
//      dirty-discard close (guards against the beforeunload hang regression).
// Exits 0 on success, 1 on any failure.

import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { exportToPdf } from './export';
import { applyPlatformSwitches } from './switches';
import { applySecurityPolicy } from './security';
import type { PdfOptions } from '../shared/types';

applyPlatformSwitches(); // must run before app.whenReady()
applySecurityPolicy(path.join(__dirname, '../renderer'));

const OUT_DIR = path.resolve(__dirname, '../../../verify-md2pdf');

const SAMPLE = `# md2pdf verification

## Math (KaTeX)

Inline: $E = mc^2$ — display:

$$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$

## Diagram (Mermaid)

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant G as GUI
  participant C as Chromium
  U->>G: Write markdown
  G->>C: printToPDF()
  C-->>U: report.pdf
\`\`\`

## Code highlighting

\`\`\`typescript
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Table

| Feature    | Status |
| ---------- | ------ |
| KaTeX      | ✓      |
| Mermaid    | ✓      |
| Page nums  | ✓      |

- [x] Task list item
`;

const PDF_OPTS: PdfOptions = {
  pageSize: 'A4',
  orientation: 'portrait',
  marginMm: 20,
  pageNumbers: true,
  bookmarks: true,
};

// Keep the process alive after the hidden export window is destroyed
// (without a listener, Electron auto-quits when all windows close).
app.on('window-all-closed', () => {});

async function check(cond: boolean, label: string): Promise<boolean> {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
  }
  return cond;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  let ok = true;

  // ---- 1. PDF export pipeline ------------------------------------------
  const pdfPath = path.join(OUT_DIR, 'verify-output.pdf');
  const result = await exportToPdf(
    { markdown: SAMPLE, options: PDF_OPTS, suggestedName: pdfPath },
    null,
  );

  ok = await check(!result.error, `export completes without error${result.error ? ` (${result.error})` : ''}`) && ok;
  if (!result.error) {
    const st = await stat(pdfPath);
    ok = await check(st.size > 5_000, `PDF non-trivial size (${st.size} bytes)`) && ok;
    const head = (await readFile(pdfPath)).subarray(0, 5).toString('latin1');
    ok = await check(head === '%PDF-', `PDF magic bytes (${head})`) && ok;
  }

  // ---- 2. GUI smoke test (real main window + screenshot) -----------------
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  await new Promise((r) => setTimeout(r, 1500)); // let preview render

  const errors = await win.webContents.executeJavaScript(
    `window.__err || null`,
  ).catch(() => null);
  ok = await check(!errors, 'renderer has no uncaught errors') && ok;

  const hasPreview = await win.webContents.executeJavaScript(
    `document.getElementById('preview').children.length > 0`,
  );
  ok = await check(hasPreview === true, 'live preview rendered content') && ok;

  // ---- 3. KaTeX superscript geometry (regression: katex 0.6 CSS mismatch) --
  const sup = await win.webContents.executeJavaScript(`(() => {
    const k = document.querySelector('#preview .katex-html');
    if (!k) return { found: false };
    const base = Array.from(k.querySelectorAll('span')).find(
      s => s.children.length === 0 && s.textContent === 'c');
    const two = Array.from(k.querySelectorAll('span')).find(
      s => s.children.length === 0 && s.textContent === '2');
    if (!base || !two) return { found: false };
    const b = base.getBoundingClientRect(), t = two.getBoundingClientRect();
    return { found: true, supAbove: t.bottom <= b.bottom, delta: b.bottom - t.bottom };
  })()`);
  ok = await check(
    sup.found === true && sup.supAbove === true && sup.delta > 1,
    `KaTeX superscript sits above baseline (delta=${typeof sup.delta === 'number' ? sup.delta.toFixed(1) : 'n/a'}px)`,
  ) && ok;

  // ---- 4. Security guards (untrusted markdown must not reach remote) ----
  const nav = await win.webContents.executeJavaScript(`
    window.location.assign('https://example.com/');
    new Promise((r) => setTimeout(() => r(window.location.protocol), 700))
  `);
  ok = await check(
    nav === 'file:',
    `renderer-initiated navigation blocked (protocol=${nav})`,
  ) && ok;

  const pop = await win.webContents.executeJavaScript(`
    (() => { const w = window.open('https://example.com/');
             if (w) w.close(); return w ? 'opened' : 'denied'; })()
  `);
  ok = await check(pop === 'denied', `window.open denied (${pop})`) && ok;

  const img = await win.webContents.capturePage();
  const png = path.join(OUT_DIR, 'verify-window.png');
  await import('node:fs/promises').then((fs) => fs.writeFile(png, img.toPNG()));
  const pngSize = (await stat(png)).size;
  ok = await check(pngSize > 10_000, `window screenshot captured (${pngSize} bytes)`);

  win.destroy();

  // ---- 4. App exit paths: spawn the REAL app under strict mode -----------
  const tail = (s: string): string => JSON.stringify(s.slice(-300));
  const testAppExit = (mode: 'clean' | 'dirty'): Promise<{ ok: boolean; detail: string }> =>
    new Promise((resolve) => {
      const appRoot = path.resolve(__dirname, '../..'); // md2pdf/ (package.json main)
      const child = spawn(process.execPath, [appRoot], {
        env: {
          ...process.env,
          MD2PDF_AUTOTEST_EXIT: mode,
          NODE_OPTIONS: '--unhandled-rejections=strict',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => (out += d));
      child.stderr.on('data', (d: Buffer) => (out += d));
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ ok: false, detail: `${mode}: HUNG - no exit within 10s ${tail(out)}` });
      }, 10_000);
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ ok: false, detail: `${mode}: spawn error: ${e.message}` });
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        const ok = code === 0 && out.includes('AUTOTEST');
        resolve({
          ok,
          detail: `${mode}: exit=${code}${signal ? ` signal=${signal}` : ''}${ok ? '' : ` ${tail(out)}`}`,
        });
      });
    });

  const exitClean = await testAppExit('clean');
  ok = await check(exitClean.ok, `app exits after clean close - ${exitClean.detail}`) && ok;
  const exitDirty = await testAppExit('dirty');
  ok = await check(
    exitDirty.ok,
    `app exits after dirty discard close (beforeunload-hang regression) - ${exitDirty.detail}`,
  ) && ok;

  console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  console.log(`outputs in ${OUT_DIR}`);
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(() => void main()).catch((err) => {
  console.error(err);
  app.exit(1);
});
