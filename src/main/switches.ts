// Platform-specific Chromium switches. Must run before app.whenReady().
//
// Kept in one module so the real app and the verify harness behave the same.

import { app } from 'electron';
import { readFileSync } from 'node:fs';

/** True when running inside WSL(2). */
export function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

export function applyPlatformSwitches(): void {
  // WSL exposes no /dev/dri: Chromium's GPU process fails to initialize and
  // spams "Creation of StagingBuffer's SharedImage failed" on every repaint
  // before falling back to software rendering. Skip the GPU dance entirely
  // there; an editor/document renderer doesn't need it. Desktop
  // Windows/macOS/Linux keep hardware acceleration.
  if (isWsl()) {
    app.commandLine.appendSwitch('disable-gpu');
  }

  // WSL/containers: Chromium's shared-memory segment in /dev/shm can be flaky
  // (ESRCH errors observed on WSL2). Using /tmp instead is harmless elsewhere.
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}
