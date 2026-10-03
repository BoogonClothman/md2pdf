// Shared render pipeline used by both the live preview and the export page.

import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { renderMarkdown } from '../shared/markdown';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'default',
});

// DOMPurify config: keep KaTeX's MathML annotations.
const PURIFY_OPTS = {
  ADD_TAGS: ['annotation'] as string[],
  ADD_ATTR: ['encoding'] as string[],
};

function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : '.';
}

/** file:// URL for a directory, with trailing slash. */
function dirToFileUrl(dir: string): string {
  const norm = dir.replace(/\\/g, '/');
  const withSlash = norm.startsWith('/') ? norm : `/${norm}`; // Windows drive letters
  return `file://${withSlash.replace(/\/+$/, '')}/`;
}

/** Rewrite relative <img src> against the source file's directory. */
function resolveImages(root: HTMLElement, baseDir?: string): void {
  if (!baseDir) return;
  let base: URL;
  try {
    base = new URL(dirToFileUrl(dirnameOf(baseDir)));
  } catch {
    return;
  }
  for (const img of Array.from(root.querySelectorAll('img'))) {
    const src = img.getAttribute('src');
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) continue;
    try {
      img.src = new URL(src, base).href;
    } catch {
      /* leave as-is */
    }
  }
}

/**
 * Render markdown into `container` (synchronously replaces its content), then
 * asynchronously fills in Mermaid diagrams. Returns a promise that resolves
 * when the DOM is fully painted (diagrams included).
 */
export async function renderInto(
  container: HTMLElement,
  markdown: string,
  baseDir?: string,
): Promise<void> {
  const html = DOMPurify.sanitize(renderMarkdown(markdown), PURIFY_OPTS);
  container.innerHTML = html;
  resolveImages(container, baseDir);

  const nodes = Array.from(container.querySelectorAll<HTMLElement>('.mermaid'));
  if (nodes.length > 0) {
    try {
      await mermaid.run({ nodes });
    } catch (err) {
      console.error('mermaid render failed', err);
      for (const n of nodes) {
        n.innerHTML = `<span style="color:#c00">⚠ mermaid error: ${String(err).slice(0, 200)}</span>`;
      }
    }
  }
}

/** Wait for webfonts and all images so printToPDF captures a finished page. */
export async function waitForPaint(timeoutMs = 10_000): Promise<void> {
  const fonts = (document as any).fonts?.ready ?? Promise.resolve();
  const images = Promise.all(
    Array.from(document.images).map(
      (img) =>
        img.complete ||
        new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        }),
    ),
  );
  await Promise.race([
    Promise.all([fonts, images]),
    new Promise<void>((res) => setTimeout(res, timeoutMs)),
  ]);
  // one frame so layout settles
  await new Promise<void>((res) => requestAnimationFrame(() => res()));
}
