// Export page: receives markdown over IPC, renders it, signals completion.

import './doc.css';
import { renderInto, setMermaidTheme, waitForPaint } from './render';
import { DEFAULT_THEME, isThemeId } from '../shared/themes';

const root = document.getElementById('content') as HTMLElement;

window.api.onExportPayload(async (payload) => {
  try {
    document.title = payload.title;
    // Apply the theme BEFORE rendering: data-theme selects the doc.css token
    // block, setMermaidTheme the JS-side diagram theme. The printed PDF must
    // match what the preview showed for the same theme.
    const theme = isThemeId(payload.theme) ? payload.theme : DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
    setMermaidTheme(theme);
    await renderInto(root, payload.markdown, payload.baseDir);
    await waitForPaint();
  } catch (err) {
    console.error('export render failed', err);
    root.innerHTML = `<pre style="color:#c00">export render failed: ${String(err)}</pre>`;
  } finally {
    window.api.signalExportDone();
  }
});

// Tell the main process our listeners are registered — safe to send payload.
window.api.signalExportReady();
