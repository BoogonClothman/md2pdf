// Export page: receives markdown over IPC, renders it, signals completion.

import './doc.css';
import { renderInto, waitForPaint } from './render';

const root = document.getElementById('content') as HTMLElement;

window.api.onExportPayload(async (payload) => {
  try {
    document.title = payload.title;
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
