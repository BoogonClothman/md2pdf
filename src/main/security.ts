// Security policy for all WebContents. Shared by the real app and verify.
//
// Threat model: markdown input may be untrusted (html:true allows raw HTML;
// DOMPurify strips scripts, but navigation gadgets like <a target=_blank>,
// <meta refresh> or location changes must not be able to move the window to
// a remote origin). A remote page living in our window would inherit the
// privileged preload bridge (arbitrary file open/save + PDF export).

import { app, ipcMain, shell } from 'electron';
import { pathToFileURL } from 'node:url';

/** Only these URL schemes may leave the app (opened in the system browser). */
const EXTERNAL_SCHEME = /^(https?|mailto):/i;

export function applySecurityPolicy(rendererDir: string): void {
  // file:// origin of our bundled renderer assets, trailing slash included.
  const allowedPrefix = pathToFileURL(rendererDir).href;

  app.on('web-contents-created', (_event, contents) => {
    // 1. No popup windows: a child window would inherit this window's
    //    webPreferences (including the preload bridge).
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // 2. Renderer-initiated navigation may only touch our own bundled files.
    //    Main-process loadFile() does not emit will-navigate, so the app's
    //    normal loading flow is unaffected; same-document fragment changes
    //    don't emit it either.
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(allowedPrefix)) {
        event.preventDefault();
        console.warn(`[security] blocked navigation to ${url}`);
      }
    });
  });

  // 3. External links from the preview open in the system browser, but only
  //    for safe schemes (a markdown link must never reach shell.openExternal
  //    with e.g. file:// or a custom protocol).
  ipcMain.on('open-external', (_e, url: unknown) => {
    if (typeof url === 'string' && EXTERNAL_SCHEME.test(url)) {
      void shell.openExternal(url);
    } else {
      console.warn(`[security] refused openExternal for ${String(url)}`);
    }
  });
}
