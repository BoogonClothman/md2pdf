// Pure markdown -> HTML pipeline. Runs in both Node (verify) and browser (renderer).

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
// Microsoft-maintained KaTeX plugin (used by VS Code's markdown preview).
// Unlike waylonflinn/markdown-it-katex (unmaintained, hard-depends katex@0.6
// whose HTML mismatches katex 0.16 CSS), this one depends on katex ^0.16.4
// and dedupes to our top-level copy.
import mathPlugin from '@vscode/markdown-it-katex';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const md: MarkdownIt = new MarkdownIt({
  html: true, // allow raw HTML in markdown (sanitized later in renderer)
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const value = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        return `<pre class="hljs language-${lang}"><code class="language-${lang}">${value}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
  },
});

md.use(mathPlugin, { throwOnError: false });

// Render ```mermaid fences as containers that the renderer fills with SVG.
const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const info = (tokens[idx].info || '').trim().toLowerCase();
  if (info === 'mermaid') {
    return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(tokens[idx].content)}</pre></div>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

/** Render markdown source to an HTML fragment (not yet sanitized). */
export function renderMarkdown(src: string): string {
  return md.render(src);
}

/** Extract a sensible document title from markdown (first H1 or frontmatter-less first line). */
export function extractTitle(src: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(src);
  if (m) return m[1].trim();
  const firstLine = src.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.replace(/^#+\s*/, '').trim().slice(0, 80);
  return fallback;
}
