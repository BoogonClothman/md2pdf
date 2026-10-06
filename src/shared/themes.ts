// Document render themes: single source of truth for the theme whitelist.
//
// Three consumers share this table:
//   - renderer: toolbar dropdown (label), data-theme attribute (id);
//   - render.ts: mermaid diagram theme (mermaidTheme) - mermaid config is JS,
//     CSS variables cannot reach it;
//   - main/export.ts: PDF page-number footer color (footerColor) - the
//     footerTemplate is a separate HTML context that cannot read page CSS
//     variables, so the color must be baked into the template HTML.
//
// The CSS side lives in doc.css as `html[data-theme='...']` override blocks;
// keep ids in sync with those blocks. Deliberately NO mermaid/electron imports
// here: this module is bundled into both the main process and the renderer.

/** mermaid 11 theme names we use (subset of mermaid's config union). */
export type MermaidThemeName = 'default' | 'dark' | 'neutral';

export interface ThemeDef {
  /** Value of documentElement.dataset.theme; must match the doc.css block. */
  id: string;
  /** Toolbar dropdown label. */
  label: string;
  mermaidTheme: MermaidThemeName;
  /** Color of the page-number footer text (printToPDF footerTemplate). */
  footerColor: string;
}

/** Whitelist of shipped themes. First entry is the default. */
export const THEMES: readonly ThemeDef[] = [
  { id: 'github-light', label: 'GitHub Light', mermaidTheme: 'default', footerColor: '#666' },
];

export const DEFAULT_THEME: string = THEMES[0].id;

/** Type guard for theme ids (stored settings, export payloads). */
export function isThemeId(v: unknown): v is string {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

/** Look up a theme; unknown ids fall back to the default (never throws). */
export function themeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
