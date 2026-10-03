// Markdown-it math plugin backed by the TOP-LEVEL katex dependency.
//
// We deliberately do not use `markdown-it-katex`: it bundles its own
// katex@0.6 (npm nested dep) while our stylesheet is katex 0.16 — the HTML
// class structure of 0.6 (`vlist-t` tables, no `.msupsub`) doesn't match the
// 0.16 CSS, which broke superscript/fraction positioning in rendered PDFs.
// Rule logic below follows markdown-it-katex (MIT) but calls our katex.

import type MarkdownIt from 'markdown-it';
import katex from 'katex';

interface MathToken {
  markup: string;
  content: string;
  block?: boolean;
}

interface MathState {
  src: string;
  pos: number;
  posMax: number;
  line: number;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  blkIndent: number;
  parentType: string;
  push(type: string, tag: string, nesting: 0): MathToken;
  getLines(start: number, end: number, indent: number, keepLastLF: boolean): string;
  pending: string;
}

const KATEX_OPTS = { throwOnError: false };

function isValidDelim(state: MathState, pos: number): { can_open: boolean; can_close: boolean } {
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1;
  let can_open = true;
  let can_close = true;

  // Delimiters must not be preceded by whitespace, and the closing
  // delimiter must not be followed by a digit (e.g. `$5` is currency).
  if (prevChar === 0x20 || prevChar === 0x09 || (nextChar >= 0x30 && nextChar <= 0x39)) {
    can_close = false;
  }
  if (nextChar === 0x20 || nextChar === 0x09) {
    can_open = false;
  }
  return { can_open, can_close };
}

/** Inline `$$display math$$` anywhere in a paragraph. */
function mathInlineDisplay(state: MathState, silent: boolean): boolean {
  if (state.src.slice(state.pos, state.pos + 2) !== '$$') return false;
  const start = state.pos + 2;
  const end = state.src.indexOf('$$', start);
  if (end === -1) return false;
  const content = state.src.slice(start, end);
  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push('math_inline_display', 'math', 0);
    token.markup = '$$';
    token.content = content;
  }
  state.pos = end + 2;
  return true;
}

/** Inline `$inline math$`. */
function mathInline(state: MathState, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false;
  const res = isValidDelim(state, state.pos);
  if (!res.can_open) {
    if (!silent) state.pending += '$';
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  let match = start;
  // Find the closing delimiter, skipping escaped dollars.
  while ((match = state.src.indexOf('$', match)) !== -1) {
    let p = match - 1;
    while (state.src[p] === '\\') p -= 1;
    if ((match - p) % 2 === 1) break;
    match += 1;
  }
  if (match === -1 || match - start === 0) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  const close = isValidDelim(state, match);
  if (!close.can_close) {
    if (!silent) state.pending += '$';
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

/** Block `$$ ... $$` spanning one or more lines. */
function mathBlock(state: MathState, startLine: number, endLine: number, silent: boolean): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const maxPos = state.eMarks[startLine];
  if (startPos + 2 > maxPos) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;
  if (silent) return true;

  let pos = startPos + 2;
  let firstLine = state.src.slice(pos, maxPos);
  let lastLine = '';
  let next = startLine;
  let found = false;

  if (firstLine.trim().slice(-2) === '$$') {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  while (!found) {
    next += 1;
    if (next >= endLine) break;
    const lineStart = state.bMarks[next] + state.tShift[next];
    const lineMax = state.eMarks[next];
    if (lineStart < lineMax && state.tShift[next] < state.blkIndent) break;
    if (state.src.slice(lineStart, lineMax).trim().slice(-2) === '$$') {
      const closeAt = state.src.slice(0, lineMax).lastIndexOf('$$');
      lastLine = state.src.slice(lineStart, closeAt);
      found = true;
    }
  }
  if (!found) return false;

  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content =
    (firstLine && firstLine.trim() ? `${firstLine}\n` : '') +
    state.getLines(startLine + 1, next, state.tShift[startLine], true) +
    (lastLine && lastLine.trim() ? lastLine : '');
  token.markup = '$$';
  return true;
}

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { ...KATEX_OPTS, displayMode });
  } catch {
    return `<code>${latex.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>`;
  }
}

export function registerMath(md: MarkdownIt): void {
  // markdown-it typings don't expose inline/block rulers; narrow via unknown.
  const rulers = md as unknown as {
    inline: { ruler: { before(after: string, name: string, fn: unknown): void } };
    block: { ruler: { after(after: string, name: string, fn: unknown): void } };
  };
  rulers.inline.ruler.before('escape', 'math_inline_display', mathInlineDisplay);
  rulers.inline.ruler.before('math_inline_display', 'math_inline', mathInline);
  rulers.block.ruler.after('blockquote', 'math_block', mathBlock);

  const rules = md.renderer.rules as unknown as Record<string, (tokens: MathToken[], idx: number) => string>;
  rules.math_inline = (tokens, idx) => renderKatex(tokens[idx].content, false);
  rules.math_inline_display = (tokens, idx) => renderKatex(tokens[idx].content, true);
  rules.math_block = (tokens, idx) => `<p>${renderKatex(tokens[idx].content, true)}</p>\n`;
}
