// Line-based markdown syntax highlighting for the editor overlay.
//
// Deliberately NOT highlight.js's markdown grammar (as used for ```markdown
// fences in rendered output): its emphasis rules can open on an unpaired "_"
// - e.g. KaTeX's \int_0 in a math snippet - and never close again, slanting
// every line below it. Here block structure is tracked with a tiny fence
// state machine and all inline spans are matched per line only, so a style
// can never run away across the document. Fenced code content still gets
// real per-language tokens from highlight.js, line by line.

import hljs from 'highlight.js';
import { escapeHtml } from '../shared/markdown';

const MAX_HIGHLIGHT_CHARS = 1024 * 1024; // string ops are cheap; guard pathological pastes

/** Inline styling on already-escaped text, single left-to-right pass per rule. */
function inlineHtml(escaped: string): string {
  // Code spans are extracted first into placeholders: later rules must not
  // match text inside them (e.g. `[a](b)` written inside backticks).
  const codes: string[] = [];
  let s = escaped.replace(/(`+)([^`]+?)\1/g, (_m, _t, code: string) => {
    codes.push(`<span class="hljs-code">${code}</span>`);
    return `\u0000${codes.length - 1}\u0001`;
  });

  // images / inline links: label in "string" color, destination in "link"
  s = s.replace(/(!?)\[([^\]]*)\]\(([^)]*)\)/g, (_m, bang: string, label: string, dest: string) =>
    `${bang}<span class="hljs-string">${label}</span>(<span class="hljs-link">${dest}</span>)`,
  );
  // reference links [text][ref]
  s = s.replace(
    /(!?)\[([^\]]+)\]\[([^\]]*)\]/g,
    (_m, bang: string, label: string, ref: string) =>
      `${bang}<span class="hljs-string">${label}</span>[${ref}]`,
  );
  // <https://example.com>
  s = s.replace(
    /&lt;(https?:\/\/[^\s]*?)&gt;/g,
    (_m, url: string) => `<span class="hljs-link">${url}</span>`,
  );
  // strong before em so `**x**` is not consumed as two em spans
  s = s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, (_m, c: string) => `<span class="hljs-strong">${c}</span>`);
  s = s.replace(
    /(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)/g,
    (_m, c: string) => `<span class="hljs-strong">${c}</span>`,
  );
  // "*" may emphasize intraword, "_" may not (snake_case stays plain)
  s = s.replace(
    /(?<!\*)\*(?!\*)(?=\S)([^*]+?)(?<=\S)\*(?!\*)/g,
    (_m, c: string) => `<span class="hljs-emphasis">${c}</span>`,
  );
  s = s.replace(
    /(?<![\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])/g,
    (_m, c: string) => `<span class="hljs-emphasis">${c}</span>`,
  );

  return codes.length === 0
    ? s
    : s.replace(/\u0000(\d+)\u0001/g, (_m, i: string) => codes[Number(i)]);
}

function fenceLine(line: string, lang: string): string {
  if (line.length === 0) return '<span class="hljs-code"> </span>';
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<span class="hljs-code">${hljs.highlight(line, { language: lang, ignoreIllegals: true }).value}</span>`;
    } catch {
      /* fall through */
    }
  }
  return `<span class="hljs-code">${escapeHtml(line)}</span>`;
}

function blockLine(line: string): string {
  if (line.length === 0) return '';
  // ATX heading: "# title" ... "###### title" (a "#" run without a space is not one)
  if (/^#{1,6}(\s|$)/.test(line)) {
    return `<span class="hljs-section">${inlineHtml(escapeHtml(line))}</span>`;
  }
  // thematic break: --- *** - - - ...
  if (/^ {0,3}([-*_])(?: *\1){2,} *$/.test(line)) {
    return `<span class="hljs-bullet">${escapeHtml(line)}</span>`;
  }
  // blockquote
  if (/^ {0,3}>/.test(line)) {
    return `<span class="hljs-quote">${inlineHtml(escapeHtml(line))}</span>`;
  }
  // list item: only the bullet / ordinal marker is colored
  const li = /^(\s*)([-*+]|\d+[.)])( +)([\s\S]*)$/.exec(line);
  if (li) {
    return (
      escapeHtml(li[1]) +
      `<span class="hljs-bullet">${escapeHtml(li[2])}</span>` +
      escapeHtml(li[3]) +
      inlineHtml(escapeHtml(li[4]))
    );
  }
  return inlineHtml(escapeHtml(line));
}

/** Highlight markdown source; returns HTML for a <pre> layer (text must be verbatim). */
export function highlightMarkdown(src: string): string {
  if (src.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(src);

  const out: string[] = [];
  let closeRe: RegExp | null = null;
  let fenceLang = '';

  for (const line of src.split('\n')) {
    if (closeRe) {
      if (closeRe.test(line)) {
        out.push(`<span class="hljs-meta">${escapeHtml(line)}</span>`); // closing ``` marker
        closeRe = null;
      } else {
        out.push(fenceLine(line, fenceLang));
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      const marker = open[1];
      closeRe = new RegExp(`^ {0,3}\\${marker[0]}{${marker.length},}[ \\t]*$`);
      fenceLang = (open[2].trim().split(/\s+/)[0] || '').toLowerCase();
      out.push(`<span class="hljs-meta">${escapeHtml(line)}</span>`); // opening ``` marker
      continue;
    }
    out.push(blockLine(line));
  }
  return out.join('\n');
}
